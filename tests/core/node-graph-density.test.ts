import { describe, expect, it } from "vitest";

import { nodeGraphDensityOverview } from "../../src/core/node-graph-density";

describe("Node Graph density overview", () => {
  it("keeps a bounded deterministic child set and preserves the focused branch", () => {
    const nodes = [
      { id: "", parentId: null },
      ...Array.from({ length: 20 }, (_, index) => ({ id: `N${String(index).padStart(2, "0")}`, parentId: "" })),
    ];
    const overview = nodeGraphDensityOverview(nodes, "N19", new Set(), 5);
    expect([...overview.visibleIds]).toEqual(["", "N00", "N01", "N02", "N03", "N19"]);
    expect(overview.hiddenBranchCount).toBe(15);
  });

  it("shows all children of an explicitly expanded parent", () => {
    const nodes = [
      { id: "", parentId: null },
      ...Array.from({ length: 20 }, (_, index) => ({ id: `N${index}`, parentId: "" })),
    ];
    const overview = nodeGraphDensityOverview(nodes, null, new Set([""]), 5);
    expect(overview.visibleIds).toHaveLength(21);
    expect(overview.hiddenBranchCount).toBe(0);
  });

  it("limits overview depth while keeping a deeply focused path", () => {
    const nodes = [
      { id: "", parentId: null },
      { id: "A", parentId: "" },
      { id: "A/B", parentId: "A" },
      { id: "A/B/C", parentId: "A/B" },
      { id: "A/B/C/D", parentId: "A/B/C" },
      { id: "A/Other", parentId: "A" },
      { id: "A/B/Other", parentId: "A/B" },
      { id: "A/B/C/Other", parentId: "A/B/C" },
    ];
    const overview = nodeGraphDensityOverview(nodes, "A/B/C/D", new Set(), 12, 1, 16);
    expect([...overview.visibleIds]).toEqual(["", "A", "A/B", "A/B/C", "A/B/C/D"]);
    expect(overview.hiddenBranchCount).toBe(3);
  });

  it("caps disconnected roots and preserves the root containing focus", () => {
    const nodes = Array.from({ length: 20 }, (_, index) => ({
      id: `R${String(index).padStart(2, "0")}`,
      parentId: null,
    }));
    const overview = nodeGraphDensityOverview(nodes, "R19", new Set(), 5, 1, 5);
    expect([...overview.visibleIds]).toEqual(["R00", "R01", "R02", "R03", "R19"]);
    expect(overview.hiddenBranchCount).toBe(15);
  });
});
