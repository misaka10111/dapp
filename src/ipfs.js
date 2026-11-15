// Content-addressed evidence packaging for MilestoneFund v2.
//
// Evidence files plus a manifest are packed into a deterministic UnixFS directory
// (dag-pb) entirely in the browser. Only the 32-byte SHA-256 digest is stored on
// chain; the full CID is reconstructed with multihash prefix 0x1220 ++ digest.

import { CID } from "multiformats/cid";
import { decode as decodeDigest } from "multiformats/hashes/digest";
import { sha256 } from "multiformats/hashes/sha2";
import * as raw from "multiformats/codecs/raw";
import { base58btc } from "multiformats/bases/base58";
import { base32 } from "multiformats/bases/base32";
import * as dagPB from "@ipld/dag-pb";
import { CarWriter, CarReader } from "@ipld/car";
import { UnixFS } from "ipfs-unixfs";

export const EVIDENCE_SCHEMA_VERSION = 1;
export const MANIFEST_NAME = "manifest.json";
// Kubo-compatible leaf chunk size.
export const DEFAULT_CHUNK_SIZE = 262144;

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();
const MULTIHASH_SHA256_PREFIX = new Uint8Array([0x12, 0x20]);

// ---------------------------------------------------------------------------
// Low-level byte helpers
// ---------------------------------------------------------------------------

export function utf8ByteLength(text) {
  return textEncoder.encode(text).length;
}

function toHex(bytes) {
  let out = "";
  for (const b of bytes) out += b.toString(16).padStart(2, "0");
  return out;
}

function fromHex(hex) {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (clean.length % 2 !== 0) throw new Error("Invalid hex string");
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++)
    bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

function concatBytes(parts) {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

async function putDagPBNode(node, blocks) {
  const bytes = dagPB.encode(node);
  const multihash = await sha256.digest(bytes);
  const cid = CID.create(1, dagPB.code, multihash);
  blocks.push({ cid, bytes });
  return { cid, bytes };
}

// A file small enough for one UnixFS node carries its bytes inline.
function inlineFileNode(bytes) {
  const unix = new UnixFS({ type: "file", data: bytes });
  return dagPB.createNode(unix.marshal(), []);
}

// A large file is split into raw leaf blocks linked by one UnixFS file node.
async function chunkedFileNode(bytes, chunkSize, blocks) {
  const links = [];
  const blockSizes = [];
  for (let start = 0; start < bytes.length; start += chunkSize) {
    const leaf = bytes.subarray(start, Math.min(start + chunkSize, bytes.length));
    const multihash = await sha256.digest(leaf);
    const leafCid = CID.create(1, raw.code, multihash);
    blocks.push({ cid: leafCid, bytes: leaf });
    links.push(dagPB.createLink("", leaf.length, leafCid));
    blockSizes.push(BigInt(leaf.length));
  }
  const unix = new UnixFS({ type: "file", blockSizes });
  return dagPB.createNode(unix.marshal(), links);
}

async function buildFile(name, bytes, chunkSize, blocks) {
  const node =
    bytes.length <= chunkSize
      ? inlineFileNode(bytes)
      : await chunkedFileNode(bytes, chunkSize, blocks);
  const { cid, bytes: encoded } = await putDagPBNode(node, blocks);
  return { name, size: bytes.length, cid, tsize: encoded.length };
}

function buildDirectoryNode(entries) {
  const links = entries
    .map((entry) => dagPB.createLink(entry.name, entry.tsize, entry.cid))
    .sort((a, b) => (a.Name < b.Name ? -1 : a.Name > b.Name ? 1 : 0));
  const unix = new UnixFS({ type: "directory" });
  return dagPB.createNode(unix.marshal(), links);
}

async function writeCar(rootCid, blocks) {
  const seen = new Set();
  const unique = [];
  for (const block of blocks) {
    const key = block.cid.toString();
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(block);
    }
  }
  const { writer, out } = CarWriter.create([rootCid]);
  const parts = [];
  const drain = (async () => {
    for await (const part of out) parts.push(part);
  })();
  for (const block of unique) await writer.put(block);
  await writer.close();
  await drain;
  return concatBytes(parts);
}

// ---------------------------------------------------------------------------
// Public API: packaging
// ---------------------------------------------------------------------------

/**
 * Build an evidence package.
 * @param {Array<{name:string, bytes?:Uint8Array, arrayBuffer?:()=>Promise<ArrayBuffer>}>} inputs
 * @param {string} summary creator-written summary, also submitted on-chain
 * @param {{chunkSize?:number, now?:string}} [options]
 */
export async function buildEvidencePackage(inputs, summary, options = {}) {
  const chunkSize = options.chunkSize ?? DEFAULT_CHUNK_SIZE;
  const now = options.now ?? new Date().toISOString();

  if (typeof summary !== "string" || summary.length === 0)
    throw new Error("Missing evidence summary");
  if (utf8ByteLength(summary) > 4000) throw new Error("Evidence summary too long");
  if (!Array.isArray(inputs) || inputs.length === 0)
    throw new Error("At least one evidence file is required");

  const names = new Set();
  for (const input of inputs) {
    if (typeof input.name !== "string" || input.name.length === 0)
      throw new Error("Evidence file is missing a name");
    if (input.name === MANIFEST_NAME)
      throw new Error(`"${MANIFEST_NAME}" is reserved`);
    if (names.has(input.name)) throw new Error(`Duplicate file name: ${input.name}`);
    names.add(input.name);
  }

  const blocks = [];
  const fileEntries = [];
  for (const input of inputs) {
    const bytes =
      input.bytes instanceof Uint8Array
        ? input.bytes
        : new Uint8Array(await input.arrayBuffer());
    fileEntries.push(await buildFile(input.name, bytes, chunkSize, blocks));
  }

  const manifest = {
    schemaVersion: EVIDENCE_SCHEMA_VERSION,
    summary,
    createdAt: now,
    files: fileEntries.map((entry) => ({
      name: entry.name,
      size: entry.size,
      cid: entry.cid.toV0().toString(base58btc),
    })),
  };
  const manifestBytes = textEncoder.encode(JSON.stringify(manifest, null, 2));
  const manifestEntry = await buildFile(
    MANIFEST_NAME,
    manifestBytes,
    chunkSize,
    blocks,
  );

  const directoryNode = buildDirectoryNode([...fileEntries, manifestEntry]);
  const root = await putDagPBNode(directoryNode, blocks);
  const car = await writeCar(root.cid, blocks);

  return {
    rootCid: root.cid,
    digestHex: digestFromCid(root.cid),
    cidV0: root.cid.toV0().toString(base58btc),
    cidV1: root.cid.toString(base32),
    manifest,
    blockCount: blocks.length,
    car,
  };
}

// Read a browser File into a package input.
export async function readBrowserFile(file) {
  return { name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) };
}

// ---------------------------------------------------------------------------
// Public API: digest / CID conversion
// ---------------------------------------------------------------------------

export function normalizeDigestHex(hex) {
  const bytes = fromHex(hex);
  if (bytes.length !== 32) throw new Error("Evidence digest must be 32 bytes");
  return "0x" + toHex(bytes);
}

export function digestFromCid(cid) {
  const multihash = cid.multihash.bytes;
  if (multihash[0] !== 0x12 || multihash[1] !== 0x20 || multihash.length !== 34)
    throw new Error("CID is not sha256-based");
  return "0x" + toHex(multihash.subarray(2));
}

// Reconstruct a CIDv0 (dag-pb, sha256) from the on-chain bytes32 digest.
export function cidFromDigest(hex) {
  const digest = fromHex(normalizeDigestHex(hex));
  const multihash = new Uint8Array(34);
  multihash.set(MULTIHASH_SHA256_PREFIX, 0);
  multihash.set(digest, 2);
  return CID.create(0, dagPB.code, decodeDigest(multihash));
}

export function cidV0String(cid) {
  return cid.toV0().toString(base58btc);
}

export function cidV1String(cid) {
  return cid.toV1().toString(base32);
}

// ---------------------------------------------------------------------------
// Public API: gateway links and verification
// ---------------------------------------------------------------------------

export function gatewayLinks(cidOrDigest) {
  const cid =
    typeof cidOrDigest === "string" ? cidFromDigest(cidOrDigest) : cidOrDigest;
  const v0 = cid.toV0().toString(base58btc);
  const v1 = cid.toV1().toString(base32);
  return [
    { label: "ipfs.io", url: `https://ipfs.io/ipfs/${v0}` },
    { label: "dweb.link", url: `https://dweb.link/ipfs/${v1}` },
    { label: "Lighthouse", url: `https://gateway.lighthouse.storage/ipfs/${v0}` },
  ];
}

async function fetchThroughGateways(cid, accept, fetchImpl) {
  let lastError;
  for (const link of gatewayLinks(cid)) {
    try {
      const response = await fetchImpl(link.url, { headers: { Accept: accept } });
      if (!response.ok) {
        lastError = new Error(`HTTP ${response.status} from ${link.label}`);
        continue;
      }
      return { bytes: new Uint8Array(await response.arrayBuffer()), gateway: link.label };
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError ?? new Error("All gateways failed");
}

// Verify just the root block (gateways that do not support trustless CAR).
export async function verifyRootBlock(digestHex, fetchImpl = globalThis.fetch) {
  const expected = normalizeDigestHex(digestHex);
  const cid = cidFromDigest(expected);
  const { bytes, gateway } = await fetchThroughGateways(
    cid,
    "application/vnd.ipld.raw",
    fetchImpl,
  );
  const multihash = await sha256.digest(bytes);
  return {
    match: "0x" + toHex(multihash.digest) === expected,
    scope: "root-block",
    gateway,
    checkedBlocks: 1,
  };
}

/**
 * Fetch the evidence DAG through public gateways and verify every block against
 * its CID. Falls back to root-block verification when CAR is unsupported.
 */
export async function verifyContent(digestHex, fetchImpl = globalThis.fetch) {
  const expected = normalizeDigestHex(digestHex);
  const cid = cidFromDigest(expected);

  let carResponse;
  try {
    carResponse = await fetchThroughGateways(
      cid,
      "application/vnd.ipld.car",
      fetchImpl,
    );
  } catch {
    return verifyRootBlock(expected, fetchImpl);
  }

  const reader = await CarReader.fromBytes(carResponse.bytes);
  const roots = await reader.getRoots();
  if (!roots.some((root) => digestFromCid(root) === expected))
    return {
      match: false,
      scope: "full-dag",
      gateway: carResponse.gateway,
      checkedBlocks: 0,
      reason: "CAR root does not match the on-chain digest",
    };

  let checked = 0;
  for await (const blockCid of reader.cids()) {
    const { bytes: blockBytes } = await reader.get(blockCid);
    const multihash = await sha256.digest(blockBytes);
    if (toHex(multihash.digest) !== toHex(blockCid.multihash.bytes.subarray(2)))
      return {
        match: false,
        scope: "full-dag",
        gateway: carResponse.gateway,
        checkedBlocks: checked,
        reason: "Block hash mismatch",
      };
    checked++;
  }
  return {
    match: true,
    scope: "full-dag",
    gateway: carResponse.gateway,
    checkedBlocks: checked,
  };
}

export { CarReader, textDecoder };
