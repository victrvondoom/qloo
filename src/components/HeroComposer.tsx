"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { EXAMPLES } from "./examples";

/** The landing page's entry point: paste a message, land in the workspace with the draft already read. */
export function HeroComposer() {
  const router = useRouter();
  const [text, setText] = useState("");
  const go = (t: string) => router.push(`/app?m=${encodeURIComponent(t.slice(0, 3000))}`);
  return (
    <form
      className="composer"
      onSubmit={(e) => {
        e.preventDefault();
        if (text.trim()) go(text);
      }}
    >
      <label htmlFor="hero-message" className="sr-only">
        Your client&apos;s message
      </label>
      <textarea id="hero-message" value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste what your client wrote: “We want the living room warm and modern… we love Khruangbin and The Bear…”" style={{ minHeight: 84 }} />
      <div className="bar">
        <span className="hint">Or try</span>
        {EXAMPLES.slice(0, 2).map((ex) => (
          <button key={ex.key} type="button" className="btn sm ghost" title={ex.blurb} onClick={() => go(ex.text)}>
            {ex.label}
          </button>
        ))}
        <span className="grow" />
        <button type="submit" className="btn primary" disabled={!text.trim()}>
          Read it <span className="arrow">→</span>
        </button>
      </div>
    </form>
  );
}
