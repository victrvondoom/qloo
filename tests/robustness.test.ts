// A small replayable slice of the robustness lab. The full run is `npm run robustness`.
import { describe, expect, it } from "vitest";
import { runRobustness } from "@/lib/robustness";

describe("robustness lab", () => {
  it("seed 1: every scenario executes and no invariant is violated; corruption is always rejected", async () => {
    const { results, summary } = await runRobustness({ seeds: [1] });
    expect(summary.notExecuted).toBe(0);
    expect(results.filter((r) => r.violations.length).map((r) => `${r.id}: ${r.violations.join("; ")}`)).toEqual([]);
    expect(summary.invalidEvidenceRejectionRate).toBe(1);
    expect(Object.keys(summary.byCategory).length).toBe(9);
  });
  it("is deterministic: the same seed gives the same scenarios and outcomes", async () => {
    const a = await runRobustness({ seeds: [2] });
    const b = await runRobustness({ seeds: [2] });
    const strip = (r: { id: string; violations: string[]; note?: string; corruptionDetected?: boolean }[]) => r.map((x) => [x.id, x.violations, x.note, x.corruptionDetected]);
    expect(strip(a.results)).toEqual(strip(b.results));
  });
});
