import { describe, expect, it } from "vitest";

import { buildNodeGraphModel, edgesForMode } from "../../src/core/node-graph-model";

const tree = {
  id: "",
  children: [
    { id: "A", children: [{ id: "A/C", children: [] }] },
    { id: "B", children: [] },
  ],
};

describe("Node Graph relation model", () => {
  it("deduplicates reciprocal links, drops self/non-node targets, and marks structural overlap", () => {
    const links = new Map<string, ReadonlySet<string>>([
      ["", new Set(["A", "A", "missing"])],
      ["A", new Set(["", "A", "B"])],
      ["B", new Set(["A"])],
    ]);
    const model = buildNodeGraphModel(tree, links);
    expect(model.nodes.map(({ id }) => id)).toEqual(["", "A", "A/C", "B"]);
    expect(model.edges).toEqual([
      { source: "", target: "A", structure: true, link: true },
      { source: "", target: "B", structure: true, link: false },
      { source: "A", target: "A/C", structure: true, link: false },
      { source: "A", target: "B", structure: false, link: true },
    ]);
  });

  it("filters one shared model into Structure, Links, and Hybrid", () => {
    const model = buildNodeGraphModel(tree, new Map([["A", new Set(["B"])]]));
    expect(edgesForMode(model, "structure")).toHaveLength(3);
    expect(edgesForMode(model, "links")).toEqual([
      { source: "A", target: "B", structure: false, link: true },
    ]);
    expect(edgesForMode(model, "hybrid")).toHaveLength(4);
  });
});
