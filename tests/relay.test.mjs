import { test, mock } from "node:test";
import assert from "node:assert/strict";

import { pinEvidence, RelayError } from "../src/relay.js";

const DIGEST = "0x" + "ab".repeat(32);
const CAR = new Uint8Array([1, 2, 3, 4]);

function mockResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

test("successful pin returns the relay payload", async () => {
  const calls = [];
  mock.method(globalThis, "fetch", async (url, init) => {
    calls.push({ url, init });
    return mockResponse(200, {
      ok: true,
      digest: DIGEST,
      cid: "QmReference",
      isDuplicate: false,
    });
  });

  const result = await pinEvidence(
    "https://relay.example.workers.dev/",
    CAR,
    DIGEST,
    "secret",
  );
  assert.equal(result.cid, "QmReference");
  assert.equal(result.digest, DIGEST);

  const { url, init } = calls[0];
  assert.equal(url, "https://relay.example.workers.dev/pin");
  assert.equal(init.method, "POST");
  assert.equal(init.headers["x-evidence-digest"], DIGEST);
  assert.equal(init.headers["x-relay-key"], "secret");
  assert.equal(init.headers["Content-Type"], "application/vnd.ipld.car");
  assert.deepEqual(init.body, CAR);
});

test("401 relay key failure surfaces the server error", async () => {
  mock.method(globalThis, "fetch", async () =>
    mockResponse(401, { error: "Invalid relay key" }),
  );
  await assert.rejects(
    pinEvidence("https://relay.example", CAR, DIGEST),
    (err) => err instanceof RelayError && err.status === 401 && /relay key/.test(err.message),
  );
});

test("400 root mismatch is reported as a relay error", async () => {
  mock.method(globalThis, "fetch", async () =>
    mockResponse(400, { error: "CAR root does not match x-evidence-digest" }),
  );
  await assert.rejects(
    pinEvidence("https://relay.example", CAR, DIGEST),
    (err) => err.status === 400 && /root/.test(err.message),
  );
});

test("429 rate limit maps to the HTTP status", async () => {
  mock.method(globalThis, "fetch", async () =>
    mockResponse(429, { error: "Rate limited" }),
  );
  await assert.rejects(
    pinEvidence("https://relay.example", CAR, DIGEST),
    (err) => err.status === 429,
  );
});

test("network failure produces a status-0 RelayError", async () => {
  mock.method(globalThis, "fetch", async () => {
    throw new TypeError("Failed to fetch");
  });
  await assert.rejects(
    pinEvidence("https://relay.example", CAR, DIGEST),
    (err) => err.status === 0 && /Cannot reach/.test(err.message),
  );
});

test("response digest mismatch is rejected even with HTTP 200", async () => {
  mock.method(globalThis, "fetch", async () =>
    mockResponse(200, { digest: "0x" + "cd".repeat(32), cid: "QmOther" }),
  );
  await assert.rejects(
    pinEvidence("https://relay.example", CAR, DIGEST),
    /digest does not match/,
  );
});

test("missing relay URL fails before any fetch", async () => {
  let fetched = false;
  mock.method(globalThis, "fetch", async () => {
    fetched = true;
  });
  await assert.rejects(pinEvidence("", CAR, DIGEST), /not configured/);
  assert.equal(fetched, false);
});

test("omits the relay key header when no key is given", async () => {
  let seenInit;
  mock.method(globalThis, "fetch", async (url, init) => {
    seenInit = init;
    return mockResponse(200, { digest: DIGEST, cid: "QmX" });
  });
  await pinEvidence("https://relay.example", CAR, DIGEST);
  assert.equal("x-relay-key" in seenInit.headers, false);
});
