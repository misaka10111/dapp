import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import solc from "solc";
import solcDeployed from "solc-deployed";
import { FetchRequest, JsonRpcProvider, getAddress, keccak256 } from "ethers";

// Read-only deployment verification. No signer, wallet, send method, or ABI writes.
const root = fileURLToPath(new URL("../", import.meta.url));
const defaultRpc = "https://ethereum-sepolia-rpc.publicnode.com";
const defaultAddress = "0x9b824CA674432B390E30A5164a76c04EeAa8f686";
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const json = (value) => JSON.stringify(value, null, 2) + "\n";

function options() {
  const result = {
    rpc: process.env.SEPOLIA_RPC_URL || process.env.VITE_SEPOLIA_RPC_URL || defaultRpc,
    address: process.env.CONTRACT_ADDRESS || process.env.VITE_CONTRACT_ADDRESS || defaultAddress,
    block: process.env.VERIFY_BLOCK || "latest",
    timeout: 20000,
    out: null,
  };
  const names = { "--rpc": "rpc", "--address": "address", "--block": "block", "--out": "out", "--timeout-ms": "timeout" };
  for (let i = 2; i < process.argv.length; i++) {
    if (process.argv[i] === "--help") {
      console.log("node scripts/verify-deployment.mjs [--rpc URL] [--address ADDRESS] [--block NUMBER|latest] [--out FILE.json] [--timeout-ms 20000]\nEnvironment: SEPOLIA_RPC_URL / VITE_SEPOLIA_RPC_URL, CONTRACT_ADDRESS / VITE_CONTRACT_ADDRESS, VERIFY_BLOCK.\nExit: 0 = full runtime match; 2 = executable-only match; 3 = no match; 1 = error. Existing output files are never overwritten.");
      return null;
    }
    const key = names[process.argv[i]];
    if (!key || !process.argv[i + 1] || process.argv[i + 1].startsWith("--")) throw new Error(`Invalid argument: ${process.argv[i]}`);
    result[key] = process.argv[++i];
  }
  result.address = getAddress(result.address);
  if (!["http:", "https:"].includes(new URL(result.rpc).protocol)) throw new Error("RPC must use HTTP or HTTPS.");
  result.timeout = Number(result.timeout);
  if (!Number.isInteger(result.timeout) || result.timeout < 500 || result.timeout > 60000) throw new Error("Timeout must be 500–60000 ms.");
  if (result.block !== "latest") {
    if (!/^\d+$/.test(String(result.block))) throw new Error("Block must be a decimal block number or latest.");
    result.block = Number(result.block);
    if (!Number.isSafeInteger(result.block)) throw new Error("Invalid block number.");
  }
  return result;
}

async function bounded(promise, milliseconds, label) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} timed out after ${milliseconds} ms`)), milliseconds);
    })]);
  } finally {
    clearTimeout(timer);
  }
}

// Definite-length CBOR decoder for Solidity auxiliary metadata. Do not assume
// a particular prefix or strip arbitrary trailing bytes from non-Solidity code.
function decodeCbor(bytes) {
  let offset = 0;
  function take(count) {
    if (!Number.isSafeInteger(count) || count < 0 || offset + count > bytes.length) throw new Error("Truncated CBOR");
    const result = bytes.subarray(offset, offset + count);
    offset += count;
    return result;
  }
  function value(depth = 0) {
    if (depth > 16) throw new Error("CBOR nesting limit");
    const first = take(1)[0], major = first >> 5, info = first & 31;
    if (major === 7) {
      if (info === 20) return false;
      if (info === 21) return true;
      if (info === 22) return null;
      throw new Error("Unsupported CBOR simple value");
    }
    let size = info;
    if (info >= 24) {
      const count = ({ 24: 1, 25: 2, 26: 4, 27: 8 })[info];
      if (!count) throw new Error("Unsupported indefinite CBOR");
      let total = 0n;
      for (const byte of take(count)) total = total * 256n + BigInt(byte);
      if (total > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("CBOR integer too large");
      size = Number(total);
    }
    if (major === 0) return size;
    if (major === 1) return -1 - size;
    if (major === 2) return Buffer.from(take(size));
    if (major === 3) return take(size).toString("utf8");
    if (major === 4) return Array.from({ length: size }, () => value(depth + 1));
    if (major === 5) {
      const map = Object.create(null);
      for (let i = 0; i < size; i++) {
        const key = value(depth + 1);
        if (typeof key !== "string" || Object.hasOwn(map, key)) throw new Error("Invalid CBOR map key");
        map[key] = value(depth + 1);
      }
      return map;
    }
    throw new Error("Unsupported CBOR type");
  }
  const result = value();
  if (offset !== bytes.length) throw new Error("Trailing CBOR bytes");
  return result;
}

function splitRuntime(code) {
  const bytes = Buffer.from(code.slice(2), "hex");
  const fallback = { executable: code, metadata: { recognized: false, strippedBytes: 0 } };
  if (bytes.length < 3) return fallback;
  const size = bytes.readUInt16BE(bytes.length - 2), start = bytes.length - 2 - size;
  if (size === 0 || start < 0) return fallback;
  try {
    const fields = decodeCbor(bytes.subarray(start, bytes.length - 2));
    if (!fields || Array.isArray(fields) || !Object.hasOwn(fields, "solc")) return fallback;
    const version = fields.solc;
    if (!(Buffer.isBuffer(version) && version.length === 3) && typeof version !== "string") return fallback;
    return {
      executable: "0x" + bytes.subarray(0, start).toString("hex"),
      metadata: {
        recognized: true, cborBytes: size, strippedBytes: size + 2,
        compilerVersion: Buffer.isBuffer(version) ? [...version].join(".") : version,
        cborHex: "0x" + bytes.subarray(start, bytes.length - 2).toString("hex"),
        fields: Object.fromEntries(Object.entries(fields).map(([key, val]) => [key, Buffer.isBuffer(val) ? "0x" + val.toString("hex") : val])),
      },
    };
  } catch {
    return fallback;
  }
}

async function verify(config) {
  const sourceFile = path.join(root, "contracts/MilestoneFund.sol");
  const rawSource = fs.readFileSync(sourceFile, "utf8");
  const normalizedLf = rawSource.replace(/\r\n/g, "\n");
  const repositoryAbi = JSON.parse(fs.readFileSync(path.join(root, "src/abi/MilestoneFund.json"), "utf8"));
  const request = new FetchRequest(config.rpc);
  request.timeout = config.timeout;
  const provider = new JsonRpcProvider(request, 11155111, { batchMaxCount: 1 });
  const rpc = (promise, label) => bounded(promise, config.timeout, label);
  try {
    const network = await rpc(provider.getNetwork(), "eth_chainId");
    if (network.chainId !== 11155111n) throw new Error("Expected Ethereum Sepolia (11155111).");
    const block = await rpc(provider.getBlock(config.block), "getBlock");
    if (!block) throw new Error("Requested block not found.");
    const code = await rpc(provider.getCode(config.address, block.number), "eth_getCode");
    if (code === "0x") throw new Error("No deployed runtime at the requested address/block.");
    const onChain = splitRuntime(code);
    if (!onChain.metadata.recognized) throw new Error("Solidity CBOR metadata not recognized; refusing speculative stripping.");

    const candidates = [], seen = new Set();
    let best = null;
    const compilers = [
      { label: "solc", compiler: solc, evms: ["paris", "shanghai", "cancun"] },
      { label: "solc-deployed", compiler: solcDeployed, evms: ["osaka", "prague", "cancun", "shanghai", "paris"] },
    ];
    function compileCandidate(engine, enabled, evmVersion, sourcePath, content, sourceVariant, repositoryDefault = false) {
      const input = {
        language: "Solidity", sources: { [sourcePath]: { content } },
        settings: {
          optimizer: { enabled, runs: 200 }, evmVersion,
          outputSelection: { "*": { "*": ["abi", "evm.deployedBytecode.object", "metadata"] } },
        },
      };
      const compilerVersion = engine.compiler.version();
      const key = compilerVersion + JSON.stringify(input);
      if (seen.has(key)) return null;
      if (seen.size >= 64) throw new Error("Bounded compiler search limit reached.");
      seen.add(key);
      const output = JSON.parse(engine.compiler.compile(JSON.stringify(input)));
      const errors = (output.errors || []).filter((item) => item.severity === "error");
      if (errors.length) throw new Error(errors.map((item) => item.formattedMessage).join("\n"));
      const artifact = output.contracts[sourcePath].MilestoneFund;
      const runtime = "0x" + artifact.evm.deployedBytecode.object;
      const split = splitRuntime(runtime);
      const fullMatch = runtime === code;
      const executableMatch = split.metadata.recognized && split.executable === onChain.executable;
      const summary = {
        id: candidates.length + 1, package: engine.label, compilerVersion,
        optimizer: { enabled, runs: 200 }, evmVersion, viaIR: false,
        sourcePath, sourceVariant, sourceSha256: sha256(content), sourceBytes: Buffer.byteLength(content),
        standardInputSha256: sha256(JSON.stringify(input)), repositoryDefault,
        runtimeBytes: (runtime.length - 2) / 2, runtimeKeccak256: keccak256(runtime),
        executableBytes: (split.executable.length - 2) / 2, executableKeccak256: keccak256(split.executable),
        metadata: split.metadata, fullMatch, executableMatch,
        abiMatchesRepository: JSON.stringify(artifact.abi) === JSON.stringify(repositoryAbi),
      };
      candidates.push(summary);
      if (fullMatch || (!best && executableMatch)) best = { summary, input, artifact };
      return summary;
    }

    // Always record the unchanged repository compile settings first.
    compileCandidate(compilers[0], true, "paris", "MilestoneFund.sol", rawSource, "working-tree", true);
    outer: for (const engine of compilers) {
      for (const evm of engine.evms) {
        for (const enabled of [false, true]) {
          if (best?.summary.fullMatch) break outer;
          const result = compileCandidate(engine, enabled, evm, "MilestoneFund.sol", rawSource, "working-tree");
          if (!result?.executableMatch || result.fullMatch) continue;
          // Metadata depends on source-unit path and exact bytes, including newlines.
          for (const sourcePath of ["MilestoneFund.sol", "contracts/MilestoneFund.sol"]) {
            for (const [variant, content] of [["LF", normalizedLf], ["CRLF", normalizedLf.replace(/\n/g, "\r\n")]]) {
              compileCandidate(engine, enabled, evm, sourcePath, content, variant);
              if (best?.summary.fullMatch) break outer;
            }
          }
        }
      }
    }
    // Avoid reporting success against a block that changed during compilation.
    const canonical = await rpc(provider.getBlock(block.number), "recheck block hash");
    if (!canonical || canonical.hash !== block.hash) throw new Error("Block hash changed during verification; rerun at a stable block.");
    const status = best?.summary.fullMatch ? "full-match" : best ? "executable-only-match" : "no-match";
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const output = path.resolve(config.out || path.join(root, "docs/evidence/deployment", `verification-${block.number}-${timestamp}.json`));
    if (!output.endsWith(".json")) throw new Error("--out must end in .json");
    const stem = output.slice(0, -5);
    const files = [{ role: "on-chain-runtime", file: stem + "-runtime.hex", content: code + "\n" }];
    if (best) {
      files.push({ role: "matching-standard-input", file: stem + "-standard-input.json", content: json(best.input) });
      files.push({ role: "matching-compiler-metadata", file: stem + "-metadata.json", content: best.artifact.metadata + "\n" });
    }
    for (const filename of [output, ...files.map((item) => item.file)]) {
      if (fs.existsSync(filename)) throw new Error(`Refusing to overwrite evidence: ${filename}`);
    }
    const result = {
      schemaVersion: 1, observedAt: new Date().toISOString(), status,
      chainId: 11155111, address: config.address,
      rpc: { origin: new URL(config.rpc).origin, endpointSha256: sha256(config.rpc), credentialsAndPathOmitted: true },
      block: { number: block.number, hash: block.hash, timestamp: block.timestamp, timeUTC: new Date(block.timestamp * 1000).toISOString(), timeBeijing: new Date((block.timestamp + 28800) * 1000).toISOString().replace("T", " ").replace(".000Z", " UTC+08:00") },
      source: { file: "contracts/MilestoneFund.sol", sha256: sha256(rawSource), bytes: Buffer.byteLength(rawSource), normalizedLfSha256: sha256(normalizedLf), normalizedLfBytes: Buffer.byteLength(normalizedLf) },
      installedCompilers: compilers.map((item) => ({ package: item.label, version: item.compiler.version() })),
      onChain: { runtimeBytes: (code.length - 2) / 2, runtimeKeccak256: keccak256(code), executableBytes: (onChain.executable.length - 2) / 2, executableKeccak256: keccak256(onChain.executable), metadata: onChain.metadata },
      search: { maxCompiles: 64, actualCompiles: candidates.length, optimizerEnabled: [false, true], optimizerRuns: [200], viaIR: false, compilerEvmCandidates: compilers.map((item) => ({ package: item.label, evmVersions: item.evms })), metadataRefinements: { sourcePaths: ["MilestoneFund.sol", "contracts/MilestoneFund.sol"], newlines: ["LF", "CRLF"] }, stoppedAfterFirstFullMatch: status === "full-match" },
      repositoryDefault: candidates[0], matchedCandidate: best?.summary || null, candidates,
      comparisonScope: "Full match compares every runtime byte, including validated CBOR metadata. Executable-only comparison strips only the recognized CBOR trailer and its two-byte length. No opcode normalization or selector-only comparison is used. This verifies runtime at the fixed block, not creation transaction provenance or security.",
      unchanged: ["contracts/MilestoneFund.sol", "scripts/compile-contract.mjs", "src/abi/MilestoneFund.json"],
      evidenceFiles: files.map((item) => ({ role: item.role, file: path.basename(item.file), sha256: sha256(item.content), bytes: Buffer.byteLength(item.content) })),
    };
    fs.mkdirSync(path.dirname(output), { recursive: true });
    for (const item of files) fs.writeFileSync(item.file, item.content, { flag: "wx" });
    fs.writeFileSync(output, json(result), { flag: "wx" });
    console.log(json({ status, blockNumber: block.number, blockHash: block.hash, onChainRuntimeBytes: result.onChain.runtimeBytes, runtimeKeccak256: result.onChain.runtimeKeccak256, chainMetadataCompiler: onChain.metadata.compilerVersion, repositoryDefaultFullMatch: candidates[0].fullMatch, repositoryDefaultExecutableMatch: candidates[0].executableMatch, matchedCandidate: best?.summary || null, evidence: output }));
    return status === "full-match" ? 0 : status === "executable-only-match" ? 2 : 3;
  } finally {
    provider.destroy();
  }
}

let config;
try {
  config = options();
  if (config) process.exitCode = await verify(config);
} catch (error) {
  const message = String(error?.shortMessage || error?.message || error);
  console.error(json({ status: "verification-error", message: config?.rpc ? message.replaceAll(config.rpc, "[RPC URL]") : message }));
  process.exitCode = 1;
}
