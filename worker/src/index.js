// MilestoneFund pin relay.
// Verifies the uploaded CAR before asking the pinning service to store it, so the
// server-side pinning quota can never be spent on malformed or mismatched claims.

import { CarReader } from "@ipld/car";
import { digestFromCid, normalizeDigestHex } from "../../src/ipfs.js";
import { pinCar } from "./pinning.js";

function corsHeaders(env, origin) {
  const allowed = (env.ALLOWED_ORIGINS ?? "").split(",").map((s) => s.trim());
  const headers = {
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,x-evidence-digest,x-relay-key",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
  if (origin && allowed.includes(origin))
    headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}

function json(body, headers, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin");
    const cors = corsHeaders(env, origin);
    const url = new URL(request.url);

    if (request.method === "OPTIONS")
      return new Response(null, { status: 204, headers: cors });

    if (request.method === "GET" && url.pathname === "/health")
      return json({ ok: true }, cors);

    if (request.method === "POST" && url.pathname === "/pin") {
      if (env.RELAY_KEY) {
        if (request.headers.get("x-relay-key") !== env.RELAY_KEY)
          return json({ error: "Invalid relay key" }, cors, 401);
      }

      let expected;
      try {
        expected = normalizeDigestHex(request.headers.get("x-evidence-digest"));
      } catch {
        return json(
          { error: "Missing or invalid x-evidence-digest header" },
          cors,
          400,
        );
      }

      const carBytes = new Uint8Array(await request.arrayBuffer());
      let reader;
      try {
        reader = await CarReader.fromBytes(carBytes);
      } catch {
        return json({ error: "Body is not a valid CAR" }, cors, 400);
      }

      const roots = await reader.getRoots();
      if (roots.length !== 1)
        return json({ error: "CAR must have exactly one root" }, cors, 400);
      if (digestFromCid(roots[0]) !== expected)
        return json(
          { error: "CAR root does not match x-evidence-digest" },
          cors,
          400,
        );

      for await (const cid of reader.cids()) {
        const block = await reader.get(cid);
        if (!block) return json({ error: "Incomplete CAR" }, cors, 400);
      }

      try {
        const pinned = await pinCar(env, carBytes, expected);
        return json(
          {
            ok: true,
            digest: expected,
            cid: pinned.cid,
            isDuplicate: pinned.isDuplicate,
          },
          cors,
        );
      } catch (err) {
        return json(
          { error: "Pinning service rejected the upload", detail: err.message },
          cors,
          502,
        );
      }
    }

    return json({ error: "Not found" }, cors, 404);
  },
};
