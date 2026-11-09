import { test } from "node:test";
import assert from "node:assert/strict";
import * as dagPB from "@ipld/dag-pb";
import { UnixFS } from "ipfs-unixfs";
import { importer } from "ipfs-unixfs-importer";
import { MemoryBlockstore } from "blockstore-core";

import {
  buildEvidencePackage,
  cidFromDigest,
  cidV0String,
  cidV1String,
  digestFromCid,
  gatewayLinks,
  normalizeDigestHex,
  readBrowserFile,
  utf8ByteLength,
  verifyContent,
  CarReader,
  MANIFEST_NAME,
} from "../src/ipfs.js";

const FIXED_NOW = "2026-11-09T03:00:00.000Z";
const encoder = new TextEncoder();

function fileInput(name, text) {
  return { name, bytes: encoder.encode(text) };
}

function bytesInput(name, bytes) {
  return { name, bytes };
}

async function buildSimple(options = {}) {
  return buildEvidencePackage(
    [fileInput("report.txt", "Milestone one deliverable")],
    "First milestone delivered on time.",
    { now: FIXED_NOW, ...options },
  );
}

test("package exposes consistent digest and CID strings", async () => {
  const pkg = await buildSimple();
  assert.equal(pkg.digestHex, digestFromCid(pkg.rootCid));
  assert.match(pkg.digestHex, /^0x[0-9a-f]{64}$/);
  assert.match(pkg.cidV0, /^Qm[1-9A-HJ-NP-Za-km-z]{44}$/);
  assert.match(pkg.cidV1, /^bafy[a-z2-7]{54,}$/);

  const rebuilt = cidFromDigest(pkg.digestHex);
  assert.equal(digestFromCid(rebuilt), pkg.digestHex);
  assert.equal(cidV0String(rebuilt), pkg.cidV0);
  assert.equal(cidV1String(rebuilt.toV1()), pkg.cidV1);
});

test("same inputs with fixed time produce identical CID and CAR", async () => {
  const a = await buildSimple();
  const b = await buildSimple();
  assert.equal(a.cidV0, b.cidV0);
  assert.deepEqual(a.car, b.car);
});

test("manifest lists every file and the reserved manifest entry", async () => {
  const pkg = await buildEvidencePackage(
    [
      fileInput("a.txt", "alpha"),
      fileInput("b.txt", "beta"),
    ],
    "Two files attached.",
    { now: FIXED_NOW },
  );
  assert.equal(pkg.manifest.schemaVersion, 1);
  assert.equal(pkg.manifest.summary, "Two files attached.");
  assert.equal(pkg.manifest.createdAt, FIXED_NOW);
  assert.deepEqual(
    pkg.manifest.files.map((f) => f.name),
    ["a.txt", "b.txt"],
  );
  assert.equal(pkg.manifest.files[0].size, 5);
  assert.match(pkg.manifest.files[0].cid, /^Qm/);

  // The CAR contains exactly one root and all blocks decode as dag-pb or raw.
  const reader = await CarReader.fromBytes(pkg.car);
  const roots = await reader.getRoots();
  assert.equal(roots.length, 1);
  assert.equal(digestFromCid(roots[0]), pkg.digestHex);
});

test("directory blocks are standard UnixFS dag-pb nodes", async () => {
  const pkg = await buildSimple();
  const reader = await CarReader.fromBytes(pkg.car);
  const rootBlock = await reader.get(pkg.rootCid);
  const node = dagPB.decode(rootBlock.bytes);
  const unix = UnixFS.unmarshal(node.Data);
  assert.equal(unix.type, "directory");
  const names = node.Links.map((link) => link.Name).sort();
  assert.deepEqual(names, [MANIFEST_NAME, "report.txt"]);
});

test("large files are split into raw leaf chunks", async () => {
  const chunkSize = 64 * 1024;
  const big = new Uint8Array(chunkSize * 3 + 10);
  for (let i = 0; i < big.length; i++) big[i] = i % 251;
  const pkg = await buildEvidencePackage(
    [bytesInput("big.bin", big)],
    "Chunked deliverable.",
    { now: FIXED_NOW, chunkSize },
  );
  // 4 raw leaves + 1 UnixFS file node + 1 manifest node + 1 directory root.
  assert.equal(pkg.blockCount, 7);
  const reader = await CarReader.fromBytes(pkg.car);
  let rawLeaves = 0;
  for await (const cid of reader.cids()) {
    if (cid.code === 0x55) rawLeaves++;
  }
  assert.equal(rawLeaves, 4);
});

test("verifyContent returns full-dag match through a mocked gateway", async () => {
  const pkg = await buildSimple();
  const mockFetch = async (url, init) => {
    assert.equal(init.headers.Accept, "application/vnd.ipld.car");
    return {
      ok: true,
      arrayBuffer: async () => pkg.car.buffer.slice(
        pkg.car.byteOffset,
        pkg.car.byteOffset + pkg.car.byteLength,
      ),
    };
  };
  const result = await verifyContent(pkg.digestHex, mockFetch);
  assert.equal(result.match, true);
  assert.equal(result.scope, "full-dag");
  assert.ok(result.checkedBlocks >= 3);
});

test("verifyContent detects a CAR whose root does not match the digest", async () => {
  const pkg = await buildSimple();
  const other = await buildEvidencePackage(
    [fileInput("report.txt", "Different content entirely")],
    "Different summary.",
    { now: FIXED_NOW },
  );
  const mockFetch = async () => ({
    ok: true,
    arrayBuffer: async () =>
      other.car.buffer.slice(other.car.byteOffset, other.car.byteOffset + other.car.byteLength),
  });
  const result = await verifyContent(pkg.digestHex, mockFetch);
  assert.equal(result.match, false);
  assert.match(result.reason, /root/i);
});

test("verifyContent detects a tampered block inside the CAR", async () => {
  const pkg = await buildSimple();
  const tampered = new Uint8Array(pkg.car);
  // Modify a byte well inside the archive (past the 51-byte header region).
  tampered[tampered.length - 12] ^= 0xff;
  const mockFetch = async () => ({
    ok: true,
    arrayBuffer: async () =>
      tampered.buffer.slice(tampered.byteOffset, tampered.byteOffset + tampered.byteLength),
  });
  const result = await verifyContent(pkg.digestHex, mockFetch);
  assert.equal(result.match, false);
});

test("gateway links embed the reconstructed CID", async () => {
  const pkg = await buildSimple();
  const links = gatewayLinks(pkg.digestHex);
  assert.equal(links.length, 3);
  assert.equal(links[0].url, `https://ipfs.io/ipfs/${pkg.cidV0}`);
  assert.equal(links[1].url, `https://dweb.link/ipfs/${pkg.cidV1}`);
  for (const link of links) assert.ok(link.label.length > 0);
});

test("validation rejects empty, duplicate, reserved and oversized inputs", async () => {
  await assert.rejects(
    buildEvidencePackage([], "summary", { now: FIXED_NOW }),
    /At least one/,
  );
  await assert.rejects(
    buildEvidencePackage(
      [fileInput("a.txt", "x"), fileInput("a.txt", "y")],
      "summary",
      { now: FIXED_NOW },
    ),
    /Duplicate/,
  );
  await assert.rejects(
    buildEvidencePackage(
      [fileInput(MANIFEST_NAME, "x")],
      "summary",
      { now: FIXED_NOW },
    ),
    /reserved/,
  );
  await assert.rejects(
    buildEvidencePackage(
      [fileInput("a.txt", "x")],
      "x".repeat(4001),
      { now: FIXED_NOW },
    ),
    /too long/,
  );
});

test("digest normalization validates length", () => {
  const hex = "0x" + "ab".repeat(32);
  assert.equal(normalizeDigestHex(hex), hex);
  assert.throws(() => normalizeDigestHex("0x" + "ab".repeat(31)), /32 bytes/);
});

test("readBrowserFile converts a File-like object", async () => {
  const fakeFile = {
    name: "proof.png",
    arrayBuffer: async () => encoder.encode("png-bytes").buffer,
  };
  const input = await readBrowserFile(fakeFile);
  assert.equal(input.name, "proof.png");
  assert.deepEqual(input.bytes, encoder.encode("png-bytes"));
});

test("utf8ByteLength counts bytes rather than code points", () => {
  assert.equal(utf8ByteLength("café"), 5);
  assert.equal(utf8ByteLength("abc"), 3);
});

// ---------------------------------------------------------------------------
// Cross-implementation vectors (ipfs-unixfs-importer is the reference used by
// Kubo and Helia).
// ---------------------------------------------------------------------------

test("known vectors: empty directory and inline file match the reference", async () => {
  // Canonical empty UnixFS directory.
  const emptyDir = dagPB.createNode(new UnixFS({ type: "directory" }).marshal(), []);
  const emptyMh = await (await import("multiformats/hashes/sha2")).sha256.digest(
    dagPB.encode(emptyDir),
  );
  const emptyCid = (await import("multiformats/cid")).CID.create(
    1,
    dagPB.code,
    emptyMh,
  );
  assert.equal(
    emptyCid.toV0().toString(),
    "QmUNLLsPACCz1vLxQVkXqqLX5R1X345qqfHbsf67hvA3Nn",
  );

  // Inline file containing "hello".
  const pkg = await buildEvidencePackage(
    [fileInput("hello.txt", "hello")],
    "vector check",
    { now: FIXED_NOW },
  );
  const reader = await CarReader.fromBytes(pkg.car);
  let found = false;
  for await (const cid of reader.cids()) {
    if (cid.toV0().toString() === "QmWfVY9y3xjsixTgbd9AorQxH7VtMpzfx2HaWtsoUYecaX")
      found = true;
  }
  assert.ok(found, "inline file CID must match the reference importer output");
});

test("chunked file node CID matches ipfs-unixfs-importer (v1, raw leaves)", async () => {
  const chunkSize = 262144;
  const big = new Uint8Array(chunkSize * 2 + 10);
  for (let i = 0; i < big.length; i++) big[i] = i % 251;

  const blockstore = new MemoryBlockstore();
  function* content() {
    yield big;
  }
  let reference;
  for await (const entry of importer(
    [{ path: "big.bin", content: content() }],
    blockstore,
    { cidVersion: 1, rawLeaves: true },
  )) {
    reference = entry.cid;
  }

  const pkg = await buildEvidencePackage(
    [bytesInput("big.bin", big)],
    "Chunked reference check.",
    { now: FIXED_NOW },
  );
  const reader = await CarReader.fromBytes(pkg.car);
  let matched = false;
  for await (const cid of reader.cids()) {
    if (cid.toString() === reference.toString()) matched = true;
  }
  assert.ok(matched, "chunked UnixFS file node must match the reference CID");
});
