import { describe, expect, it } from "vitest";
import { compareChildren, materializeManualOrder, naturalOrder, ORDER_GAP, planAppendChildren, planReorder } from "../../src/core/ordering";

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
  it("re-ranks the desired sequence when no safe gap exists", () => {
    const crowded = children.map((item, index) => ({ ...item, order: index + 1 }));
    const plan = planReorder(crowded, "P/C", 1);
    expect(plan.orderedPaths).toEqual(["P/A", "P/C", "P/B"]);
    expect(plan.patches.map(({ nextOrder }) => nextOrder)).toEqual([ORDER_GAP, ORDER_GAP * 2, ORDER_GAP * 3]);
  });
  it.each(["sparse", "missing", "duplicate", "overflow"])("appends a batch in the intended order with %s ranks", (mode) => {
    const existing = [
      { childPath: "P/A", basename: "A", order: mode === "missing" ? null : mode === "overflow" ? Number.MAX_SAFE_INTEGER : 1024 },
      { childPath: "P/B", basename: "B", order: mode === "duplicate" ? 1024 : mode === "overflow" ? null : 2048 },
    ];
    const moved = [
      { childPath: "P/Z", basename: "Z", order: 4096 },
      { childPath: "P/Y", basename: "Y", order: 8192 },
    ];
    const plan = planAppendChildren(existing, moved);
    const ranks = new Map(plan.patches.map(({ childPath, nextOrder }) => [childPath, nextOrder]));
    const persisted = [...existing, ...moved].map((child) => ({ ...child, order: ranks.get(child.childPath) ?? child.order })).sort(compareChildren);
    expect(persisted.map(({ childPath }) => childPath)).toEqual([...existing].sort(compareChildren).map(({ childPath }) => childPath).concat(["P/Z", "P/Y"]));
    expect(plan.orderedPaths).toEqual(persisted.map(({ childPath }) => childPath));
    expect(new Set(persisted.map(({ order }) => order)).size).toBe(4);
    if (mode === "sparse") expect(plan.patches).toEqual([
      { childPath: "P/Z", previousOrder: 4096, nextOrder: 3072 },
      { childPath: "P/Y", previousOrder: 8192, nextOrder: 4096 },
    ]);
  });
});
