import type { Metadata } from "next";
import Link from "next/link";
import { results } from "@/lib/study-store";
import { CRITERIA, MIN_INTERPRETABLE, QUESTIONS, SYSTEM_NAMES, type StudySystem } from "@/lib/study";

export const metadata: Metadata = { title: "Study results" };
export const dynamic = "force-dynamic";

const pct = (x: number | null) => (x === null ? "–" : `${Math.round(x * 100)}%`);

export default async function StudyResults() {
  const r = await results();
  return (
    <main id="main">
      <div className="wrap">
        <div className="eyebrow">Independent evaluation</div>
        <h1>Study results</h1>
        {r.responses === 0 ? (
          <div className="card">
            <p><b>NO HUMAN DATA COLLECTED.</b> Zero responses have been recorded. Nothing on this page is simulated, and no result can be claimed until real people respond.</p>
            <Link className="btn primary" href="/study">Take the study</Link>
          </div>
        ) : (
          <>
            <p className="lede">
              {r.responses} response{r.responses === 1 ? "" : "s"} recorded. {r.interpretable ? "" : `Fewer than ${MIN_INTERPRETABLE}: too few to read as a preference. Treat everything below as anecdote.`}
              {r.dataModes.includes("fixture") ? " Some cases use synthetic demo data." : ""}
            </p>
            {r.byPair.map((p) => {
              const [x, y] = p.pair.split(" vs ") as [StudySystem, StudySystem];
              return (
                <section key={p.pair} className="card section">
                  <h2>{SYSTEM_NAMES[x]} vs {SYSTEM_NAMES[y]} <span className="muted small">({p.responses} responses · mean confidence {p.meanConfidence ?? "–"}/5)</span></h2>
                  <div className="scroll-x">
                    <table className="table">
                      <thead>
                        <tr><th>Question</th><th>{SYSTEM_NAMES[x]}</th><th>{SYSTEM_NAMES[y]}</th><th>Equal</th><th>Neither</th><th>{SYSTEM_NAMES[x]} share of decisive (95% CI)</th></tr>
                      </thead>
                      <tbody>
                        {CRITERIA.map((c) => {
                          const k = p.criteria[c];
                          const s = k.firstShareOfDecisive;
                          return (
                            <tr key={c}>
                              <td className="small">{QUESTIONS[c]}</td>
                              <td>{k.first}</td><td>{k.second}</td><td>{k.equal}</td><td>{k.neither}</td>
                              <td className="small">{s.p === null ? "–" : `${pct(s.p)} [${pct(s.lo)}, ${pct(s.hi)}] (n=${s.n})`}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </section>
              );
            })}
          </>
        )}
        <p className="small muted">
          Limitations: fictional clients, small and self-selected samples, and a specification’s wording can sway a choice. See <code>docs/HUMAN_EVALUATION.md</code>.
        </p>
      </div>
    </main>
  );
}
