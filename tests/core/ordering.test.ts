import { describe, expect, it } from "vitest";
import { compareChildren, materializeManualOrder, naturalOrder, ORDER_GAP, planReorder } from "../../src/core/ordering";

describe("distributed sparse ordering", () => {
  const children = [
    { childPath: "P/A", basename: "A", order: 1024 },
    { childPath: "P/B", basename: "B", order: 2048 },
    { childPath: "P/C", basename: "C", order: 3072 },
  ];
  it("uses deterministic comparisons", () => {
    expect(naturalOrder([{ childPath: "P/A10", basename: "A10", order: null }, { childPath: "P/A2", basename: "A2", order: null }]).map((item) => item.basename)).toEqual(["A2", "A10"]);
    expect(compareChildren({ childPath: "P/X", basename: "X", order: null }, { childPath: "P/Y", basename: "Y", order: 1 })).toBe(1);
  });
  it("moves one child with one metadata patch when a gap exists", () => {
    const plan = planReorder(children, "P/C", 1);
    expect(plan.orderedPaths).toEqual(["P/A", "P/C", "P/B"]);
    expect(plan.patches).toEqual([{ childPath: "P/C", previousOrder: 3072, nextOrder: 1536 }]);
  });
  it("materializes sparse keys without parent child lists", () => {
    const plan = materializeManualOrder(children.map((item) => ({ ...item, order: null })));
    expect(plan.patches.map((patch) => patch.nextOrder)).toEqual([ORDER_GAP, ORDER_GAP * 2, ORDER_GAP * 3]);
  });
  it("performs bounded rebalance with no gap", () => {
    const crowded = children.map((item, index) => ({ ...item, order: index + 1 }));
    const plan = planReorder(crowded, "P/C", 1);
    expect(plan.patches.length).toBeLessThanOrEqual(64);
    expect(plan.orderedPaths).toEqual(["P/A", "P/C", "P/B"]);
  });
});
