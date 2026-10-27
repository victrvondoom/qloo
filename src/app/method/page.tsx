import { DIMENSIONS } from "@/lib/dimensions";
import { WORD_LEXICON } from "@/lib/words";

export default function Method() {
  return (
    <div style={{ maxWidth: 860 }}>
      <div className="eyebrow">Method</div>
      <h1>The problem inside the problem</h1>
      <p className="lede">
        Taste agents assume the user&apos;s words carry their preferences. In design trades they don&apos;t. “Warm”, “modern”, “cozy” and
        “clean” are the words clients use most and the ones that tell a pro least.
      </p>

      <section className="card section">
        <h2>The chain</h2>
        <ol>
          <li><b>What it seems to need:</b> recommend lighting or finishes that match a client&apos;s taste.</li>
          <li><b>Hidden assumption:</b> the client can state that taste. They can&apos;t, at least not in a spec&apos;s terms. They use a handful of words that each have several professional meanings: “warm” can mean 2700K light, oak and linen, a lived-in room, or a sociable one.</li>
          <li><b>Failure:</b> the pro picks a meaning, builds, and finds out at the walkthrough. A chatbot that only hears the words makes the same choice for everyone who says them.</li>
          <li><b>Information gap:</b> clients can&apos;t describe rooms, but they can name what they love: bands, shows, hotels, brands. Those names carry taste, but not in a form a pro can build from.</li>
          <li><b>Bridge:</b> Qloo knows which <em>places</em> people with that taste choose: the bars, restaurants, cafés and hotels they spend their evenings in. Places are rooms. Their tags and review keywords say what those rooms are like.</li>
          <li><b>Mechanism:</b> compare the rooms the client&apos;s taste neighbourhood chooses with the rooms everyone in the same city chooses. Atmospheres that are over-represented say what the client&apos;s words mean.</li>
          <li><b>Proof:</b> two clients with identical words get different specs; each difference is traceable to counts of real places; the literal reading and an LLM-only answer are shown beside it.</li>
        </ol>
      </section>

      <section className="card section">
        <h2>What runs, step by step</h2>
        <ol>
          <li><b>Resolve.</b> Each love goes to <code>GET /search</code> (with a type if hinted, e.g. “(show)”). Exact matches win; same-name entities of different types are flagged; matches under 0.5 name similarity are dropped rather than used. A pro can pin a different candidate.</li>
          <li><b>Crowd.</b> <code>GET /v2/insights?filter.type=urn:entity:place&amp;signal.interests.entities=…&amp;filter.location.query=CITY&amp;take=50</code>. If fewer than 12 returned places carry tags, the agent widens to a location signal, then to no location, and records the decision.</li>
          <li><b>Baseline.</b> The same query in the same scope with no taste signal: what is typical there.</li>
          <li><b>Taste tags.</b> <code>filter.type=urn:tag</code> with the same signals: cross-domain descriptors (from music, film, books) that can nudge an atmosphere up by at most 0.3.</li>
          <li><b>Fingerprint.</b> Each place is read against the lexicon below. For every atmosphere, crowd share vs. baseline share under Beta(1,1) priors gives a lift (ratio of posterior means) and P(crowd rate &gt; baseline rate). Score = clamp(log₂(lift)/1.5) × |2P−1| + capped tag nudge.</li>
          <li><b>Decode words.</b> Each word&apos;s readings are weighted ∝ exp(2 × score of that reading&apos;s atmosphere), with a small prior toward the dictionary sense. With no evidence, the literal sense wins.</li>
          <li><b>Spec.</b> A deterministic rulebook turns the atmosphere vector into spec lines. The model never sets a value. One guard: if the client used a word that can mean warm light, colour temperature never goes cooler than 3000K. Evidence chooses between a word&apos;s meanings; it doesn&apos;t overrule the word.</li>
          <li><b>One question, only if it matters.</b> For each contrasting pair of atmospheres, the agent simulates both possible answers, rebuilds the spec under each, and counts lines that differ. It asks about the pair that moves the most lines (at least two), naming two real places from the client&apos;s own taste neighbourhood.</li>
          <li><b>Counter-test.</b> If a Claude key is set, the model gets the same words, loves and option menu, but no Qloo data, and picks values. Agreement is reported line by line.</li>
          <li><b>Ledger.</b> Every step above is an entry in a SHA-256 hash chain. The API key is never recorded.</li>
        </ol>
        <p className="small muted">
          Invariant, tested: with zero evidence, every spec line equals the literal reading. So every difference between the two columns is
          attributable to Qloo data.
        </p>
      </section>

      <section className="card section">
        <h2>Atmosphere lexicon</h2>
        <p className="small muted">A place counts toward an atmosphere when a tag or keyword matches one of these terms as a whole word or phrase.</p>
        <div className="scroll-x">
          <table className="table">
            <thead>
              <tr>
                <th>Atmosphere</th>
                <th>Place terms</th>
                <th>Taste-tag terms</th>
              </tr>
            </thead>
            <tbody>
              {DIMENSIONS.map((d) => (
                <tr key={d.id}>
                  <td><b>{d.label}</b></td>
                  <td className="small">{d.venueTerms.join(", ")}</td>
                  <td className="small">{d.moodTerms.join(", ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card section">
        <h2>Word lexicon</h2>
        <div className="scroll-x">
          <table className="table">
            <tbody>
              {Object.entries(WORD_LEXICON).map(([w, rs]) => (
                <tr key={w}>
                  <td><em>{w}</em></td>
                  <td className="small">
                    {rs.map((r) => `${r.meaning}${r.isDictionaryDefault ? " (literal)" : ""}`).join(" · ")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="small muted">Words outside this list are mapped onto the nine atmospheres by Claude when a key is set, and labelled as such.</p>
      </section>

      <section className="card section">
        <h2>Limits, plainly</h2>
        <ul>
          <li>Qloo affinities describe aggregate tastes of people who like the same things. They are not facts about the client, and the brief says so.</li>
          <li>The lexicon depends on the tags and keywords Qloo returns for places. Where a city has few tagged places, the agent widens the search and warns that the evidence is thin.</li>
          <li>Light levels are typical starting ranges for the room type, not a lighting calculation.</li>
          <li>No personal data is sent to Qloo: only the names of public things the client loves and a city.</li>
          <li>Without a Claude key the core still runs; only the counter-test, the client note and unfamiliar-word mapping are skipped.</li>
        </ul>
      </section>
    </div>
  );
}
