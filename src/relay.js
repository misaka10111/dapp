// Frontend client for the Cloudflare pin relay.

import { normalizeDigestHex } from "./ipfs.js";

export class RelayError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "RelayError";
    this.status = status;
  }
}

/**
 * Upload a CAR to the pin relay.
 * @param {string} relayUrl Worker base URL
 * @param {Uint8Array} car evidence CAR bytes
 * @param {string} digest expected on-chain digest
 * @param {string} [relayKey] optional shared header key
 */
export async function pinEvidence(relayUrl, car, digest, relayKey) {
  const expected = normalizeDigestHex(digest);
  if (!relayUrl) throw new RelayError("Pin relay URL is not configured", 0);

  const headers = {
    "Content-Type": "application/vnd.ipld.car",
    "x-evidence-digest": expected,
  };
  if (relayKey) headers["x-relay-key"] = relayKey;

  let response;
  try {
    response = await fetch(`${relayUrl.replace(/\/$/, "")}/pin`, {
      method: "POST",
      headers,
      body: car,
    });
  } catch (err) {
    throw new RelayError(`Cannot reach the pin relay: ${err.message}`, 0);
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new RelayError(payload.error ?? `Relay HTTP ${response.status}`, response.status);
  if (payload.digest !== expected)
    throw new RelayError("Relay response digest does not match the package", response.status);

  return {
    digest: payload.digest,
    cid: payload.cid,
    isDuplicate: payload.isDuplicate ?? false,
  };
}
