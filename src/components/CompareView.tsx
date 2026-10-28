"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { PRESETS } from "./presets";
import { Timeline } from "./Timeline";
import { useAgentStream } from "./useAgentStream";
import { RoomStage } from "./brief/RoomStage";
import { buildDeepBrief } from "@/lib/deep/build";
import { DIMENSION_BY_ID } from "@/lib/dimensions";
import type { Brief } from "@/lib/types";

export function CompareView({ initialA, initialB }: { initialA?: Brief; initialB?: Brief }) {
  const router = useRouter();
  const a = useAgentStream();
  const b = useAgentStream();
  const [words, setWords] = useState("warm, modern");
  const briefA = a.brief ?? initialA;
  const briefB = b.brief ?? initialB;

  const go = async () => {
    const w = words.split(",").map((x) => x.trim()).filter(Boolean);
    const [ra, rb] = await Promise.all([a.run({ ...PRESETS[0].input, words: w }), b.run({ ...PRESETS[1].input, words: w })]);
    if (ra && rb) router.replace(`/compare?a=${ra.id}&b=${rb.id}`, { scroll: false });
  };

  const both = briefA && briefB;
  const differing = both ? briefA.spec.filter((l) => briefB.spec.find((m) => m.id === l.id)?.value !== l.value) : [];

  return (
    <div>
      <div className="eyebrow">The same-words test</div>
      <h1>Two clients. Identical words. Different rooms?</h1>
      <p className="lede">
        Maya and Jordan both ask for a living room that&apos;s “{words}”. A literal reading, or a chatbot that only hears the words, gives them
        the same room. Run both through Qloo and see what the evidence says.
      </p>
      <div className="card row" style={{ marginBottom: 16 }}>
        <label className="field" style={{ margin: 0, flex: "1 1 240px" }}>
          <span>The words both clients use</span>
          <input type="text" value={words} onChange={(e) => setWords(e.target.value)} />
        </label>
        <button className="btn primary" onClick={go} disabled={a.running || b.running}>
          {a.running || b.running ? "Running both…" : "Run both briefs"}
        </button>
      </div>

      {both ? (
        <section className="card" style={{ marginBottom: 16, borderColor: "var(--amber)" }}>
          <div className="eyebrow">Result</div>
          <h2>
            {differing.length} of {briefA.spec.length} spec lines differ between Maya and Jordan.
          </h2>
          <p className="muted" style={{ margin: 0 }}>
            Their literal readings are identical, because their words are. Every difference below comes from Qloo data.
            {briefA.dataMode === "fixture" || briefB.dataMode === "fixture" ? " (This run used synthetic demo data.)" : ""}
          </p>
        </section>
      ) : null}

      <div className="compare-cols">
        {[
          { s: a, brief: briefA, preset: PRESETS[0] },
          { s: b, brief: briefB, preset: PRESETS[1] },
        ].map(({ s, brief, preset }) => (
          <div key={preset.key} className="card">
            <div className="eyebrow">{preset.title}</div>
            <p className="small muted">Loves: {preset.input.loves.join(", ")}</p>
            {s.running || s.error ? <Timeline steps={s.steps} running={s.running} /> : null}
            {s.error ? <div className="err">{s.error}</div> : null}
            {brief ? (
              <>
                <RoomStage spec={brief.spec} dims={brief.dimensions} trade={brief.input.trade} room={brief.input.room} label={`${preset.title}'s room, drawn from the spec`} />
                <p className="serif" style={{ fontSize: 24, fontStyle: "italic", color: "var(--amber-text)", margin: "14px 0 6px" }}>
                  {buildDeepBrief(brief).title}
                </p>
                {brief.words.map((w) => (
                  <p key={w.word} style={{ margin: "6px 0" }}>
                    <em>“{w.word}”</em> → <b>{w.chosen?.meaning ?? "unmapped"}</b>{" "}
                    {w.chosen ? <span className="muted small">({Math.round(w.chosen.weight * 100)}%)</span> : null}
                  </p>
                ))}
                <p className="small muted" style={{ marginTop: 8 }}>
                  Strongest signals:{" "}
                  {[...brief.dimensions]
                    .sort((x, y) => y.score - x.score)
                    .slice(0, 3)
                    .map((d) => `${DIMENSION_BY_ID[d.id].short} ×${d.lift.toFixed(1)}`)
                    .join(" · ")}
                </p>
                <table className="table" style={{ marginTop: 8 }}>
                  <tbody>
                    {brief.spec.map((l) => (
                      <tr key={l.id} className={differing.some((d) => d.id === l.id) ? "changed" : undefined}>
                        <td style={{ width: "34%" }}>
                          <b className="small">{l.category}</b>
                        </td>
                        <td className="small">{l.value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <Link className="btn sm" style={{ marginTop: 10 }} href={`/brief/${brief.id}`}>
                  Open full brief and evidence →
                </Link>
              </>
            ) : !s.running ? (
              <p className="muted">Not run yet.</p>
            ) : null}
          </div>
        ))}
      </div>
      {both ? (
        <section className="card section">
          <div className="eyebrow">If you only listened to the words</div>
          <table className="table">
            <tbody>
              {briefA.spec.map((l) => (
                <tr key={l.id}>
                  <td style={{ width: "24%" }}><b className="small">{l.category}</b></td>
                  <td className="small">{l.literalValue}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="small muted" style={{ marginTop: 8 }}>Both clients get exactly this.</p>
        </section>
      ) : null}
    </div>
  );
}
