import Link from "next/link";
import { HeroFilm } from "@/components/HeroFilm";
import { HeroComposer } from "@/components/HeroComposer";
import { RoomStage } from "@/components/brief/RoomStage";
import { benchmarkHeadline, demoPair } from "@/lib/demo";
import { publicStats } from "@/lib/store";

export const dynamic = "force-dynamic";

const STEPS = [
  { n: "01", t: "What they said", d: "Their words and the things they love, pulled from one pasted message.", w: 100 },
  { n: "02", t: "What it could mean", d: "Every professional reading of each word; each reference resolved in Qloo, or dropped.", w: 86 },
  { n: "03", t: "Rooms their taste chooses", d: "The places Qloo ranks for people who love the same things, against typical places in their city.", w: 70 },
  { n: "04", t: "Atmospheres", d: "Nine kinds of room, scored by measured lift. Only the ones that stand out survive.", w: 46 },
  { n: "05", t: "Decisions", d: "Which reading of each word the evidence favours, hard constraints, and one question if it's worth asking.", w: 30 },
  { n: "06", t: "Spec", d: "Lines a pro can build, each traced back along the graph to what the client said.", w: 18 },
];

export default async function Home() {
  const [demo, bench, stats] = await Promise.all([demoPair(), benchmarkHeadline(), publicStats().catch(() => undefined)]);
  const b0 = bench?.systems.find((s) => s.id === "B0");
  const b3 = bench?.systems.find((s) => s.id === "B3");
  const differing = demo.maya.spec.filter((l) => demo.jordan.spec.find((x) => x.id === l.id)?.value !== l.value);

  return (
    <main id="main" className="flush">
      <section className="hero">
        <div className="wrap">
          <div>
            <div className="eyebrow amber">For lighting designers, interior designers and fit-out teams</div>
            <h1>
              <em>“Warm and modern”</em> means a different room for every client.
            </h1>
            <p className="lede">
              Paste what your client wrote. Tastespec reads what they love through Qloo&apos;s taste graph, finds the rooms people like them actually choose, and hands you a spec,
              a drawn room and a link for the client. Every line traced to evidence.
            </p>
            <HeroComposer />
            <div className="hero-proof">
              {b0 && b3 ? (
                <div>
                  <b>
                    {Math.round(b0.mean * 100)}% → {Math.round(b3.mean * 100)}%
                  </b>
                  spec lines matching the client&apos;s real taste, literal reading vs Tastespec (synthetic benchmark)
                </div>
              ) : null}
              <div>
                <b>0</b>lines personalised without evidence: it abstains instead
              </div>
              {stats?.briefs ? (
                <div>
                  <b>{stats.briefs}</b>briefs built on this server
                </div>
              ) : null}
            </div>
          </div>
          <div>
            <HeroFilm demo={demo} />
            <div className="film-caption">
              <span>Maya and Jordan, drawn from their own briefs.</span>
              <span>Demo data · synthetic world</span>
            </div>
          </div>
        </div>
      </section>

      <section className="band" id="problem">
        <div className="wrap">
          <div className="band-head">
            <div className="eyebrow">The problem inside the problem</div>
            <h2>The words clients use most tell a designer least.</h2>
            <p className="lede">
              “Warm” can mean 2700K light, oak and linen, a lived-in room, or a sociable one. Clients can&apos;t describe rooms in a spec&apos;s terms, so the pro picks a meaning and finds out at the
              walkthrough. A chatbot that only hears the words makes the same pick for everyone who says them. But clients can name what they love, and that carries their taste.
            </p>
          </div>
          <div className="duo">
            {[demo.maya, demo.jordan].map((c) => (
              <div key={c.name} className="card">
                <div className="who">
                  <h3>
                    {c.name} <span className="muted" style={{ fontSize: 16 }}>said “warm and modern”</span>
                  </h3>
                  <span className="pill plain">demo data</span>
                </div>
                <div className="small muted" style={{ marginBottom: 12 }}>
                  Loves {c.loves.slice(0, 4).join(", ")}
                </div>
                <RoomStage spec={c.spec} dims={c.dims} trade={demo.trade} room={demo.room} label={`${c.name}'s living room, drawn from the spec`} />
                <p className="serif" style={{ fontSize: 24, fontStyle: "italic", color: "var(--amber-text)", margin: "14px 0 4px" }}>
                  {c.title}
                </p>
                <ul className="diff-list">
                  {c.meanings.map((m) => (
                    <li key={m.word}>
                      <span>“{m.word}”</span>
                      <span>{m.means}</span>
                    </li>
                  ))}
                  {differing.slice(0, 3).map((l) => (
                    <li key={l.id}>
                      <span>{l.category}</span>
                      <span>{c.spec.find((x) => x.id === l.id)?.value}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <p className="small muted" style={{ marginTop: 16 }}>
            Same words, same room, same city: {differing.length} of {demo.lines} spec lines differ, and every difference comes from what they love. Taken literally, both would get the same room.{" "}
            <Link href="/compare">Run the same-words test yourself →</Link>
          </p>
        </div>
      </section>

      <section className="band alt" id="how">
        <div className="wrap">
          <div className="band-head">
            <div className="eyebrow">How it narrows</div>
            <h2>An agent with no memory, only a graph that gets narrower.</h2>
            <p className="lede">
              Tastespec remembers nothing between clients. Everything it knows about this one lives on a six-column graph that narrows from what they said to the spec, and every spec line can be walked
              back along it.
            </p>
          </div>
          <div className="steps-6">
            {STEPS.map((s) => (
              <div key={s.n}>
                <div className="n">{s.n}</div>
                <h4>{s.t}</h4>
                <p>{s.d}</p>
                <div className="funnel" style={{ width: `${s.w}%` }} aria-hidden="true" />
              </div>
            ))}
          </div>
          <div className="grid3 section">
            <div className="card">
              <div className="eyebrow amber">Progressively niche</div>
              <h3>Mainstream → Curated → Deep cut</h3>
              <p className="small muted" style={{ margin: 0 }}>
                Go deeper and the same taste question is asked among less popular places, on both sides of the comparison, so you get reference rooms nobody else will have shown the client.
              </p>
            </div>
            <div className="card">
              <div className="eyebrow amber">One question, only if it pays</div>
              <h3>“Friday, 8pm: which of these two?”</h3>
              <p className="small muted" style={{ margin: 0 }}>
                The agent simulates both answers first, and asks only when the evidence can&apos;t call it and the answer would change the spec. The client can answer on their own link.
              </p>
            </div>
            <div className="card">
              <div className="eyebrow amber">Built for the hand-over</div>
              <h3>Spec, scenes, zones, palette, PDF</h3>
              <p className="small muted" style={{ margin: 0 }}>
                A scene-by-zone dimming table, a buying list by category, an installer checklist and a client note: everything after the spec, from the same evidence.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="band dark" id="proof">
        <div className="wrap">
          <div className="band-head">
            <div className="eyebrow">Proof, not adjectives</div>
            <h2 style={{ color: "#efe7da" }}>Built so a judge, or a sceptical client, can check it.</h2>
          </div>
          <div className="trust-grid">
            <div className="card">
              <div className="icon-badge" aria-hidden="true">#</div>
              <h3>Every line traced</h3>
              <p className="small muted">
                Each Qloo request, decision and model call goes into a hash-chained ledger. Replay rebuilds the spec from stored evidence and compares line by line; any browser can verify the chain.
              </p>
            </div>
            <div className="card">
              <div className="icon-badge" aria-hidden="true">∅</div>
              <h3>Abstains instead of inventing</h3>
              <p className="small muted">
                No usable evidence means no personalisation: the brief says so and falls back to the literal reading. Model output is kept only when every name and number in it is in the facts.
              </p>
            </div>
            <div className="card">
              <div className="icon-badge" aria-hidden="true">≈</div>
              <h3>Honest about what it is</h3>
              <p className="small muted">
                Qloo results are aggregate affinities, not facts about a person. Synthetic data is labelled on every screen. Light levels are starting points, not calculations.
              </p>
            </div>
          </div>
          {bench ? (
            <div className="card section">
              <div className="panel-title">
                <div>
                  <div className="eyebrow">Benchmark · {bench.scenarios} seeded scenarios · synthetic world, not human labels</div>
                  <h3 style={{ margin: 0 }}>How often the spec matches the client&apos;s hidden taste</h3>
                </div>
                <Link href="/method#evaluation" className="small" style={{ color: "#e8a15a" }}>
                  Method and caveats →
                </Link>
              </div>
              <div className="bench">
                {bench.systems.map((s) => (
                  <div key={s.id} className={`b${s.id === "B3" ? " ours" : ""}`}>
                    <span>{s.label}</span>
                    <span className="t">
                      <i style={{ width: `${(s.mean * 100).toFixed(1)}%` }} />
                    </span>
                    <span className="v">{s.mean.toFixed(2)}</span>
                  </div>
                ))}
              </div>
              <p className="tiny muted" style={{ marginTop: 12, marginBottom: 0 }}>
                Mean line agreement with the oracle, 95% CIs in the report. Warm-word briefs that went cooler than 3000K: {Math.round(bench.warmFloorViolations.b2 * 100)}% without safeguards,{" "}
                {Math.round(bench.warmFloorViolations.b3 * 100)}% with. Invariant violations across all runs: {bench.invariantViolations}.
              </p>
            </div>
          ) : null}
        </div>
      </section>

      <section className="cta-final">
        <div className="wrap">
          <h2>Paste your next client&apos;s message.</h2>
          <p className="lede" style={{ margin: "0 auto 24px" }}>
            Runs on any OS with Node 22: <code>npm run demo</code> starts it on synthetic data, no keys needed. Add a Qloo key for live evidence.
          </p>
          <Link href="/app" className="btn primary lg">
            Open the workspace <span className="arrow">→</span>
          </Link>
        </div>
      </section>
    </main>
  );
}
