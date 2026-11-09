// Pinning adapter. The Pinata v3 upload endpoint accepts a raw CAR upload on the
// public network and preserves its root CID. Swap this module to use another
// pinning service without touching the request handler.

const PINATA_UPLOAD_URL = "https://uploads.pinata.cloud/v3/files";

export async function pinCar(env, carBytes, digest) {
  const form = new FormData();
  form.set("network", "public");
  form.set("car", "true");
  form.set("name", `milestonefund-evidence-${digest.slice(2, 10)}.car`);
  form.set(
    "file",
    new Blob([carBytes], { type: "application/vnd.ipld.car" }),
    "evidence.car",
  );

  const response = await fetch(PINATA_UPLOAD_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.PINATA_JWT}` },
    body: form,
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const reason = payload?.error?.reason ?? `Pinata HTTP ${response.status}`;
    throw new Error(reason);
  }
  return {
    cid: payload.data.cid,
    isDuplicate: payload.data.is_duplicate ?? false,
  };
}
