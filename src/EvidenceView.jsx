import React, { useState } from "react";

import {
  cidFromDigest,
  cidV0String,
  cidV1String,
  gatewayLinks,
  normalizeDigestHex,
  verifyContent,
} from "./ipfs.js";
import { errorMessage } from "./utils.js";

export default function EvidenceView({ evidence, digest }) {
  const [cidStyle, setCidStyle] = useState("v0");
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState(null);
  const [copied, setCopied] = useState(false);

  let cid;
  try {
    cid = cidFromDigest(normalizeDigestHex(digest));
  } catch {
    return (
      <div className="evidence">
        <p className="eyebrow">Creator’s evidence</p>
        <p>{evidence}</p>
        <p className="muted">Stored CID is not a valid 32-byte digest.</p>
      </div>
    );
  }

  const cidText = cidStyle === "v0" ? cidV0String(cid) : cidV1String(cid);
  const links = gatewayLinks(cid);

  async function copy() {
    try {
      await navigator.clipboard.writeText(cidText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  async function verify() {
    setChecking(true);
    setResult(null);
    try {
      setResult(await verifyContent(normalizeDigestHex(digest)));
    } catch (e) {
      setResult({ match: false, failed: true, reason: errorMessage(e) });
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="evidence">
      <p className="eyebrow">Creator’s evidence</p>
      <p>{evidence}</p>

      <div className="cid-block">
        <div className="cid-head">
          <span className="cid-label">IPFS CID</span>
          <div className="cid-toggle" role="group" aria-label="CID version">
            <button
              type="button"
              className={cidStyle === "v0" ? "active" : ""}
              onClick={() => setCidStyle("v0")}
            >
              v0
            </button>
            <button
              type="button"
              className={cidStyle === "v1" ? "active" : ""}
              onClick={() => setCidStyle("v1")}
            >
              v1
            </button>
          </div>
        </div>
        <code className="cid-text">{cidText}</code>
        <div className="cid-actions">
          <button type="button" className="ghost tiny" onClick={copy}>
            {copied ? "Copied ✓" : "Copy CID"}
          </button>
          <button
            type="button"
            className="ghost tiny"
            onClick={verify}
            disabled={checking}
          >
            {checking ? "Verifying…" : "Verify content"}
          </button>
        </div>
      </div>

      <div className="gateway-links">
        {links.map((link) => (
          <a
            key={link.label}
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
          >
            {link.label} ↗
          </a>
        ))}
      </div>

      {result && (
        <p
          className={`verify-result ${result.match ? "match" : "mismatch"}`}
          role="status"
        >
          {result.match
            ? `✓ Match · ${result.scope} · ${result.checkedBlocks} block(s) via ${result.gateway}`
            : `✗ Mismatch${result.reason ? ` · ${result.reason}` : ""}`}
        </p>
      )}
    </div>
  );
}
