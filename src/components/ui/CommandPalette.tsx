"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

interface Item {
  label: string;
  hint: string;
  href: string;
}

const PAGES: Item[] = [
  { label: "New brief", hint: "paste a client message", href: "/app" },
  { label: "Same words, two rooms", hint: "and Duet", href: "/compare" },
  { label: "Proof Lab", hint: "try to break it", href: "/lab" },
  { label: "Projects", hint: "tracking and 3D taste space", href: "/projects" },
  { label: "Method", hint: "how it works, evaluation", href: "/method" },
  { label: "Study", hint: "blinded preference study", href: "/study" },
  { label: "Verify a bundle", hint: "re-hash a ledger", href: "/verify" },
  { label: "Home", hint: "landing page", href: "/" },
];

/** ⌘K / Ctrl+K: jump to any page or any of your briefs. */
export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const [briefs, setBriefs] = useState<Item[]>([]);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === "Escape") setOpen(false);
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("tastespec:palette", onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("tastespec:palette", onOpen);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    fetch("/api/briefs")
      .then((r) => r.json())
      .then((j: { briefs: { id: string; clientLabel: string; words: string[]; city: string; project: string }[] }) =>
        setBriefs(j.briefs.map((b) => ({ label: `${b.clientLabel}${b.project ? ` · ${b.project}` : ""}`, hint: `“${b.words.join(", ")}” · ${b.city}`, href: `/brief/${b.id}` }))),
      )
      .catch(() => {});
  }, [open]);

  const results = useMemo(() => {
    const t = q.trim().toLowerCase();
    const all = [...PAGES, ...briefs];
    return (t ? all.filter((i) => `${i.label} ${i.hint}`.toLowerCase().includes(t)) : all).slice(0, 12);
  }, [q, briefs]);

  if (!open) return null;
  const go = (i: Item) => {
    setOpen(false);
    setQ("");
    router.push(i.href);
  };
  return (
    <div className="palette-backdrop" onClick={() => setOpen(false)}>
      <div className="palette" role="dialog" aria-modal="true" aria-label="Command palette" onClick={(e) => e.stopPropagation()}>
        <input
          ref={input} autoFocus
          type="search"
          value={q}
          placeholder="Jump to a page or a client…"
          aria-label="Search pages and briefs"
          onChange={(e) => {
            setQ(e.target.value);
            setSel(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setSel((s) => Math.min(results.length - 1, s + 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setSel((s) => Math.max(0, s - 1));
            } else if (e.key === "Enter" && results[sel]) go(results[sel]);
          }}
        />
        <ul role="listbox">
          {results.map((r, i) => (
            <li key={r.href} role="option" aria-selected={i === sel} onMouseEnter={() => setSel(i)} onClick={() => go(r)}>
              <b>{r.label}</b>
              <span>{r.hint}</span>
            </li>
          ))}
          {!results.length ? <li className="muted">Nothing matches.</li> : null}
        </ul>
        <div className="palette-foot">
          <span className="kbd">↑↓</span> move <span className="kbd">↵</span> open <span className="kbd">esc</span> close
        </div>
      </div>
    </div>
  );
}

export function PaletteButton() {
  return (
    <button type="button" className="theme-toggle hide-sm" style={{ width: "auto", padding: "0 10px", gap: 6, fontSize: 12 }} onClick={() => window.dispatchEvent(new Event("tastespec:palette"))} aria-label="Open the command palette">
      <span className="kbd">⌘K</span>
    </button>
  );
}
