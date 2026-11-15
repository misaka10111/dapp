import React, { useState } from "react";

import { buildEvidencePackage, readBrowserFile } from "./ipfs.js";
import { pinEvidence } from "./relay.js";
import { PIN_RELAY_KEY, PIN_RELAY_URL } from "./contract.js";
import { errorMessage } from "./utils.js";

// Two-step evidence flow: package and pin locally first, then record the digest
// on chain. The on-chain transaction only becomes available after a successful pin.
export default function EvidenceForm({ index, ready, busy, onSubmit }) {
  const [fileList, setFileList] = useState([]);
  const [summary, setSummary] = useState("");
  const [stage, setStage] = useState("idle"); // idle | packing | pinning | ready | error
  const [packageResult, setPackageResult] = useState(null);
  const [error, setError] = useState("");

  function resetPackage() {
    setStage("idle");
    setPackageResult(null);
    setError("");
  }

  function chooseFiles(event) {
    setFileList(Array.from(event.target.files ?? []));
    resetPackage();
  }

  async function prepare() {
    setError("");
    try {
      const text = summary.trim();
      if (!text) throw new Error("Write a summary of what you delivered.");
      if (new TextEncoder().encode(text).length > 4000)
        throw new Error("Summary must be 1–4000 UTF-8 bytes.");
      if (fileList.length === 0)
        throw new Error("Attach at least one evidence file.");

      const inputs = await Promise.all(fileList.map(readBrowserFile));
      setStage("packing");
      const result = await buildEvidencePackage(inputs, text);

      setStage("pinning");
      const pinned = await pinEvidence(
        PIN_RELAY_URL,
        result.car,
        result.digestHex,
        PIN_RELAY_KEY,
      );
      setPackageResult({ ...result, pinned });
      setStage("ready");
    } catch (e) {
      setError(errorMessage(e));
      setStage("error");
    }
  }

  async function submit(event) {
    event.preventDefault();
    if (stage !== "ready" || !packageResult) return;
    await onSubmit(index, packageResult.digestHex, summary.trim());
  }

  const working = stage === "packing" || stage === "pinning";

  return (
    <form className="evidence-form" onSubmit={submit}>
      <fieldset disabled={!ready || busy}>
        <label>
          What did you deliver?
          <textarea
            name="evidence"
            required
            maxLength={4000}
            rows={3}
            placeholder="Summarise the deliverable for your backers"
            value={summary}
            onChange={(e) => {
              setSummary(e.target.value);
              resetPackage();
            }}
          />
        </label>

        <label className="file-picker">
          Evidence files
          <input
            type="file"
            multiple
            required
            onChange={chooseFiles}
            aria-describedby={`evidence-files-${index}`}
          />
          <span className="file-picker-face">
            {fileList.length === 0
              ? "Choose deliverable files"
              : `${fileList.length} file(s) selected`}
          </span>
        </label>

        {fileList.length > 0 && (
          <ul className="selected-files" id={`evidence-files-${index}`}>
            {fileList.map((file) => (
              <li key={`${file.name}-${file.size}`}>
                <span>{file.name}</span>
                <small>{(file.size / 1024).toFixed(1)} KB</small>
              </li>
            ))}
          </ul>
        )}

        <button
          type="button"
          className="ghost"
          onClick={prepare}
          disabled={working || stage === "ready"}
        >
          {stage === "packing"
            ? "Packaging…"
            : stage === "pinning"
              ? "Pinning to IPFS…"
              : stage === "ready"
                ? "Package pinned"
                : "1. Package & pin to IPFS"}
        </button>

        {stage === "ready" && packageResult && (
          <div className="pin-ready">
            <p className="form-note tight">
              Root CID {packageResult.cidV0.slice(0, 10)}… pinned
              {packageResult.pinned.isDuplicate ? " (already existed)" : ""}.
            </p>
            <button type="submit" className="primary">
              2. Submit evidence on-chain
            </button>
          </div>
        )}

        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </fieldset>
    </form>
  );
}
