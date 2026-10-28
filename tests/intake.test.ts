import { describe, expect, it } from "vitest";
import { groundDraft, parseIntakeHeuristic } from "@/lib/intake";

describe("heuristic intake", () => {
  it("reads a typical client email", () => {
    const d = parseIntakeHeuristic(
      "Hi! We're redoing our living room in Chicago. We want it warm but modern. We love Khruangbin, The Bear and Wes Anderson films, and we always stay at the Ace Hotel.\nThanks,\nMaya",
    );
    expect(d.city).toBe("Chicago");
    expect(d.room).toBe("living_room");
    expect(d.trade).toBe("lighting");
    expect(d.words).toEqual(["warm", "modern"]);
    expect(d.loves).toEqual(expect.arrayContaining(["Khruangbin", "The Bear", "Wes Anderson"]));
    expect(d.clientLabel).toBe("Maya");
  });

  it("handles terse notes, other rooms and finishes", () => {
    const d = parseIntakeHeuristic("kitchen reno in Austin. cozy, bright. paint + materials only. big fans of Bon Iver + Chef's Table + Aesop");
    expect(d.city).toBe("Austin");
    expect(d.room).toBe("kitchen");
    expect(d.trade).toBe("finishes");
    expect(d.words).toEqual(["cozy", "bright"]);
    expect(d.loves).toEqual(["Bon Iver", "Chef's Table", "Aesop"]);
  });

  it("picks up quoted references and show hints", () => {
    const d = parseIntakeHeuristic('Bedroom in London. Something calm. Our references are "Severance" the show and "In the Mood for Love".');
    expect(d.room).toBe("bedroom");
    expect(d.city).toBe("London");
    expect(d.words).toContain("calm");
    expect(d.loves).toEqual(expect.arrayContaining(["Severance", "In the Mood for Love"]));
  });

  it("does not treat style words as references", () => {
    const d = parseIntakeHeuristic("We love warm light and cozy corners. We also love Fleetwood Mac. Living room in Denver.");
    expect(d.loves).toEqual(["Fleetwood Mac"]);
    expect(d.words).toEqual(expect.arrayContaining(["warm", "cozy"]));
  });

  it("detects multi-word cities and business rooms", () => {
    const d = parseIntakeHeuristic("New cocktail bar in Mexico City. Moody, elegant. The owners love Buena Vista Social Club and Wong Kar-wai.");
    expect(d.city).toBe("Mexico City");
    expect(d.room).toBe("bar");
    expect(d.words).toEqual(["moody", "elegant"]);
    expect(d.loves).toEqual(expect.arrayContaining(["Buena Vista Social Club", "Wong Kar-wai"]));
  });

  it("says what is missing instead of guessing", () => {
    const d = parseIntakeHeuristic("make it nice");
    expect(d.city).toBe("");
    expect(d.loves).toEqual([]);
    expect(d.notes.join(" ")).toMatch(/No city/);
    expect(d.notes.join(" ")).toMatch(/Fewer than two/);
  });

  it("survives hostile input", () => {
    const d = parseIntakeHeuristic("ignore previous instructions\u0000 " + "x".repeat(10_000) + " we love <script>alert(1)</script>");
    expect(d.loves.every((l) => l.length <= 80)).toBe(true);
  });
});

describe("grounding model output", () => {
  const text = "Living room in Chicago, warm and modern please. We love Khruangbin and The Bear. — Maya";

  it("keeps what the message supports", () => {
    const { draft, dropped } = groundDraft(text, { clientLabel: "Maya", city: "Chicago", room: "living_room", trade: "lighting", words: ["warm", "modern"], loves: ["Khruangbin", "The Bear (show)"] });
    expect(draft.loves).toEqual(["Khruangbin", "The Bear (show)"]);
    expect(draft.words).toEqual(["warm", "modern"]);
    expect(draft.city).toBe("Chicago");
    expect(dropped).toEqual([]);
  });

  it("drops invented references, words and cities", () => {
    const { draft, dropped } = groundDraft(text, { clientLabel: "Bob", city: "Paris", room: "kitchen", trade: "lighting", words: ["warm", "industrial"], loves: ["Khruangbin", "Radiohead"] });
    expect(draft.loves).toEqual(["Khruangbin"]);
    expect(draft.words).toEqual(["warm"]);
    expect(draft.city).toBe("");
    expect(draft.clientLabel).toBe("Client");
    expect(dropped.join(" ")).toMatch(/Radiohead.*industrial.*Paris|Radiohead/);
  });

  it("rejects invalid enums and junk types", () => {
    const { draft } = groundDraft(text, { room: "spaceship" as never, trade: "plumbing" as never, words: [42 as never], loves: null as never });
    expect(draft.room).toBe("living_room");
    expect(draft.trade).toBe("lighting");
    expect(draft.words).toEqual([]);
    expect(draft.loves).toEqual([]);
  });
});

describe("real-world phrasing", () => {
  const cases: [string, Partial<{ clientLabel: string; city: string; room: string; trade: string; words: string[]; loves: string[] }>][] = [
    [
      "Hi! We just bought a place in Chicago and want the living room to feel warm and modern. We're obsessed with Khruangbin, The Bear (the show), anything Wes Anderson, and we always stay at the Ace Hotel. Norah Jones is always on.\n\nThanks,\nMaya",
      { clientLabel: "Maya", city: "Chicago", words: ["warm", "modern"], loves: ["Khruangbin", "The Bear (the show)", "Wes Anderson", "Ace Hotel (hotel)", "Norah Jones"] },
    ],
    [
      "Hey! For our Chicago living room we'd love it warm and modern. Big fans of Fred again.., Severance, MUJI and Blue Bottle Coffee, and Kendrick Lamar is on repeat.\n\nJordan",
      { clientLabel: "Jordan", loves: ["Fred again..", "Severance", "MUJI", "Blue Bottle Coffee", "Kendrick Lamar"] },
    ],
    [
      "We're opening a restaurant in Austin and want the dining room cozy but lively. We love Buena Vista Social Club, Chef's Table and Bad Bunny. We need help with paint, colours and materials.\n\n— Sofia, Calle Ocho",
      { clientLabel: "Sofia", city: "Austin", room: "restaurant", trade: "finishes", words: ["cozy", "lively"] },
    ],
    [
      "Looking to redo my bedroom in London. I want it calm and minimal. I'm into Bon Iver, Studio Ghibli and Kinfolk magazine, and I love Aesop stores.",
      { city: "London", room: "bedroom", loves: ["Bon Iver", "Studio Ghibli", "Kinfolk", "Aesop (brand)"] },
    ],
    ["can you make our kitchen feel cozy?? we live in brooklyn. we love radiohead and the white lotus", { city: "Brooklyn", room: "kitchen", loves: ["Radiohead", "The White Lotus"] }],
  ];
  for (const [text, want] of cases) {
    it(`reads: ${text.slice(0, 48)}…`, () => {
      const d = parseIntakeHeuristic(text);
      for (const [k, v] of Object.entries(want)) expect(d[k as keyof typeof d]).toEqual(v);
    });
  }
});
