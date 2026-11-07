import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";
import solc from "solc";
import { compareRuntime } from "../scripts/verify-deployment.mjs";

const evidence = new URL("../docs/evidence/deployment/verification-12080309-2026-11-07T01-09-15-627Z", import.meta.url);
const input = JSON.parse(fs.readFileSync(new URL(evidence.href + "-standard-input.json"), "utf8"));
input.settings.outputSelection = { "*": { "*": ["evm.deployedBytecode.object", "evm.deployedBytecode.immutableReferences"] } };
const output = JSON.parse(solc.compile(JSON.stringify(input)));
assert.deepEqual((output.errors || []).filter(({ severity }) => severity === "error"), []);
const artifact = output.contracts["MilestoneFund.sol"].MilestoneFund.evm.deployedBytecode;
const localRuntime = "0x" + artifact.object;
const references = artifact.immutableReferences;
const groups = Object.entries(references);
assert.ok(groups.length >= 2, "The fixture must contain both timeout variables");
assert.ok(groups.every(([, slots]) => slots.length >= 2), "The fixture must exercise repeated immutable values");

function substitute(values = {}) {
  const bytes = Buffer.from(artifact.object, "hex");
  for (const [id, slots] of groups) {
    const value = BigInt(values[id] ?? 600);
    for (const { start, length } of slots) {
      const encoded = value.toString(16).padStart(length * 2, "0");
      assert.equal(encoded.length, length * 2);
      Buffer.from(encoded, "hex").copy(bytes, start);
    }
  }
  return "0x" + bytes.toString("hex");
}

function changeMetadata(runtime) {
  const bytes = Buffer.from(runtime.slice(2), "hex");
  // Change only the last compiler-version byte inside the valid CBOR trailer.
  assert.equal(bytes[bytes.length - 3], 0x18);
  bytes[bytes.length - 3] = 0x19;
  return "0x" + bytes.toString("hex");
}

test("identical runtime is a full match without inventing an immutable substitution", () => {
  const result = compareRuntime(localRuntime, localRuntime, references);
  assert.equal(result.fullMatch, true);
  assert.equal(result.executableMatch, true);
  assert.equal(result.metadataMatch, true);
  assert.equal(result.immutableMatch, false);
});

for (const value of [1, 256, 600, 604800]) {
  test(`compiler-declared immutable slots accept the complete value ${value}`, () => {
    const values = Object.fromEntries(groups.map(([id]) => [id, value]));
    const result = compareRuntime(localRuntime, substitute(values), references);
    assert.equal(result.fullMatch, false);
    assert.equal(result.executableMatch, false);
    assert.equal(result.immutableMatch, true);
    assert.equal(result.metadataMatch, true);
    assert.equal(result.substitutedFullMatch, true);
    assert.ok(result.immutableSlots.length > 0);
  });
}

test("different immutable variables may have different values", () => {
  const values = { [groups[0][0]]: 1, [groups[1][0]]: 604800 };
  assert.equal(compareRuntime(localRuntime, substitute(values), references).immutableMatch, true);
});

test("repeated references to the same immutable must contain the same value", () => {
  const bytes = Buffer.from(substitute().slice(2), "hex");
  const { start, length } = groups[0][1][1];
  Buffer.from((601).toString(16).padStart(length * 2, "0"), "hex").copy(bytes, start);
  const result = compareRuntime(localRuntime, "0x" + bytes.toString("hex"), references);
  assert.equal(result.immutableMatch, false);
  assert.equal(result.substitutedFullMatch, false);
});

test("arbitrary zero-byte changes outside compiler references are not immutable substitutions", () => {
  const original = Buffer.from(artifact.object, "hex");
  const executableLength = original.length - 2 - original.readUInt16BE(original.length - 2);
  const declared = new Set(groups.flatMap(([, slots]) => slots.flatMap(({ start, length }) =>
    Array.from({ length }, (_, offset) => start + offset))));
  let position = -1;
  for (let i = 0; i + 1 < executableLength; i++) {
    if (original[i] === 0 && original[i + 1] === 0 && !declared.has(i) && !declared.has(i + 1)) {
      position = i;
      break;
    }
  }
  assert.ok(position >= 0, "The fixture needs zero bytes outside immutable references");
  for (const runtime of [localRuntime, substitute()]) {
    const bytes = Buffer.from(runtime.slice(2), "hex");
    bytes.writeUInt16BE(600, position);
    const result = compareRuntime(localRuntime, "0x" + bytes.toString("hex"), references);
    assert.equal(result.fullMatch, false);
    assert.equal(result.executableMatch, false);
    assert.equal(result.immutableMatch, false);
    assert.equal(result.substitutedFullMatch, false);
  }
});

test("zero-byte differences without compiler references cannot pass verification", () => {
  const result = compareRuntime(localRuntime, substitute());
  assert.equal(result.immutableMatch, false);
  assert.equal(result.substitutedFullMatch, false);
});

test("a metadata-only mismatch remains executable-only rather than becoming an immutable match", () => {
  const result = compareRuntime(localRuntime, changeMetadata(localRuntime), references);
  assert.equal(result.fullMatch, false);
  assert.equal(result.executableMatch, true);
  assert.equal(result.metadataMatch, false);
  assert.equal(result.immutableMatch, false);
  assert.equal(result.substitutedFullMatch, false);
});

test("immutable substitution does not hide a metadata mismatch", () => {
  const result = compareRuntime(localRuntime, changeMetadata(substitute()), references);
  assert.equal(result.immutableMatch, true);
  assert.equal(result.metadataMatch, false);
  assert.equal(result.fullMatch, false);
  assert.equal(result.substitutedFullMatch, false);
});

test("invalid or overlapping immutable ranges cannot authorize a match", () => {
  const slot = groups[0][1][0];
  for (const invalid of [
    { invalid: [{ start: -1, length: 32 }] },
    { invalid: [{ start: 1.5, length: 32 }] },
    { invalid: [{ start: 0, length: 0 }] },
    { invalid: [{ start: artifact.object.length / 2, length: 32 }] },
    { ...references, duplicate: [slot] },
    { ...references, overlap: [{ start: slot.start + 1, length: slot.length }] },
  ]) {
    const result = compareRuntime(localRuntime, substitute(), invalid);
    assert.equal(result.immutableMatch, false);
    assert.equal(result.substitutedFullMatch, false);
  }
});

test("saved Sepolia runtime matches declared immutable values but not the saved compiler metadata", () => {
  const deployed = fs.readFileSync(new URL(evidence.href + "-runtime.hex"), "utf8").trim();
  const result = compareRuntime(localRuntime, deployed, references);
  assert.equal(result.immutableMatch, true);
  assert.equal(result.fullMatch, false);
  assert.equal(result.executableMatch, false);
  assert.equal(result.metadataMatch, false);
  assert.equal(result.substitutedFullMatch, false);
  const bytes = Buffer.from(deployed.slice(2), "hex");
  for (const [, slots] of groups) {
    for (const { start, length } of slots) {
      assert.equal(BigInt("0x" + bytes.subarray(start, start + length).toString("hex")), 600n);
    }
  }
});
