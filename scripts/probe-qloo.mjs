// Live smoke test for a Qloo key: checks auth, search, place insights with and
// without a signal, and tag insights, and prints which response fields came back
// (tags / keywords on places matter most for Tastespec).
//
//   QLOO_API_KEY=... node scripts/probe-qloo.mjs [city]
//
// The key is read from the environment and never printed.

const key = process.env.QLOO_API_KEY;
const base = (process.env.QLOO_BASE_URL || "https://hackathon.api.qloo.com").replace(/\/+$/, "");
const city = process.argv[2] || "Chicago";
if (!key) {
  console.error("Set QLOO_API_KEY first.");
  process.exit(1);
}

async function get(path, params) {
  const url = `${base}${path}?${new URLSearchParams(params)}`;
  const t = Date.now();
  const res = await fetch(url, { headers: { "X-Api-Key": key, Accept: "application/json" } });
  const body = await res.json().catch(() => ({}));
  console.log(`${res.status}  ${Date.now() - t}ms  GET ${path} ${JSON.stringify(params)}`);
  if (!res.ok) console.log("   ", JSON.stringify(body).slice(0, 300));
  return body;
}

const list = (body, key) => (Array.isArray(body?.results) ? body.results : body?.results?.[key] ?? []);

const s = await get("/search", { query: "Khruangbin", take: 3 });
const hit = list(s, "entities")[0];
console.log("   search →", hit ? `${hit.name} ${hit.entity_id} ${hit.types ?? hit.type}` : "nothing");
if (!hit) process.exit(1);

const crowd = await get("/v2/insights", { "filter.type": "urn:entity:place", "signal.interests.entities": hit.entity_id, "filter.location.query": city, take: 10 });
const places = list(crowd, "entities");
const withTags = places.filter((p) => p.tags?.length).length;
const withKw = places.filter((p) => p.properties?.keywords?.length).length;
console.log(`   ${places.length} places; ${withTags} with tags; ${withKw} with keywords`);
if (places[0]) {
  console.log("   first place fields:", Object.keys(places[0]).join(", "));
  console.log("   properties:", Object.keys(places[0].properties ?? {}).join(", "));
  console.log("   sample tags:", (places[0].tags ?? []).slice(0, 8).map((t) => t.name).join(" | "));
  console.log("   sample keywords:", (places[0].properties?.keywords ?? []).slice(0, 8).map((k) => k.name ?? k).join(" | "));
}

const baseline = await get("/v2/insights", { "filter.type": "urn:entity:place", "filter.location.query": city, take: 10 });
console.log(`   baseline ${list(baseline, "entities").length} places`);

const tags = await get("/v2/insights", { "filter.type": "urn:tag", "signal.interests.entities": hit.entity_id, take: 10 });
console.log("   taste tags:", list(tags, "tags").map((t) => t.name).join(" | "));
