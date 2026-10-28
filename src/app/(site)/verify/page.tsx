"use client";

import { useState } from "react";
import { verifyLedger, type VerifyResult } from "@/lib/ledger";
import type { Brief } from "@/lib/types";

export default function Verify() {
  const [result, setResult] = useState<VerifyResult & { label?: string }>();
  const [error, setError] = useState<string>();
  const [id, setId] = useState("");
  const [head, setHead] = useState("");

  const check = async (brief: Brief, label: string) => {
    setError(undefined);
    if (!Array.isArray(brief?.ledger)) throw new Error("No ledger found in that file.");
    setResult({ ...(await verifyLedger(brief.ledger, head.trim() || undefined)), label });
  };

  const onFile = async (f: File) => {
    try {
      if (f.size > 20 * 1024 * 1024) throw new Error("File too large.");
      const j = JSON.parse(await f.text()) as { brief?: Brief } & Brief;
      await check(j.brief ?? j, f.name);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const onId = async () => {
    try {
      const res = await fetch(`/api/briefs/${encodeURIComponent(id.trim())}`);
      const j = (await res.json()) as { brief?: Brief; error?: string };
      if (!j.brief) throw new Error(j.error ?? "Not found");
      await check(j.brief, j.brief.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <main id="main">
      <div className="wrap">
    <div>
      <div className="eyebrow">Audit</div>
      <h1>Verify an evidence bundle</h1>
      <p className="lede">
        Every Qloo call, agent decision, model call and client answer in a brief is a ledger entry whose SHA-256 hash covers the entry before
        it. Change anything afterwards and the chain breaks at that entry. This check runs entirely in your browser.
      </p>
      <div className="grid2 section">
        <div className="card">
          <h3>Upload a bundle</h3>
          <p className="small muted">The JSON file from “Download evidence bundle” on any brief. Try editing a number in it first.</p>
          <input type="file" accept="application/json,.json" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
        </div>
        <div className="card">
          <h3>Or check a saved brief</h3>
          <div className="row">
            <input type="text" placeholder="brief id, e.g. b-…" value={id} onChange={(e) => setId(e.target.value)} style={{ flex: 1 }} />
            <button className="btn" onClick={onId} disabled={!id.trim()}>Verify</button>
          </div>
        </div>
      </div>
      <div className="card section">
        <label className="field" style={{ margin: 0 }}>
          <span>Optional: the head hash you recorded when the brief was shared (detects entries cut off the end)</span>
          <input type="text" className="mono" placeholder="64 hex characters" value={head} onChange={(e) => setHead(e.target.value)} />
        </label>
      </div>
      {error ? <div className="err section" role="alert">{error}</div> : null}
      {result ? (
        <div className="card section" role="status" style={{ borderColor: result.ok ? "var(--good)" : "var(--bad)" }}>
          <h2 style={{ color: result.ok ? "var(--good)" : "var(--bad)" }}>{result.ok ? "Chain intact" : "Chain broken"}</h2>
          <p>
            {result.label}:{" "}
            {result.ok
              ? `all ${result.checked} entries hash correctly and each links to the one before${head.trim() ? ", and the head matches the one you recorded" : ""}.`
              : `entry #${result.firstBadSeq} fails (${result.reason}). Everything from there on can't be trusted.`}
          </p>
          <div className="hash">head {result.head}</div>
          <p className="small muted" style={{ marginTop: 8 }}>
            What this proves: the record is unchanged{head.trim() ? " relative to the head you supplied" : " internally (supply a recorded head to rule out truncation)"}.
            What it doesn&apos;t prove: that Qloo&apos;s data was accurate. Each Qloo entry carries a response hash and Qloo request id for that.
          </p>
        </div>
      ) : null}
    </div>
      </div>
    </main>
  );
}
