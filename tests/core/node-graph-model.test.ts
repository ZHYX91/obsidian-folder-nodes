import { describe, expect, it } from "vitest";

import {
  buildNodeGraphModel,
  buildNodeGraphModelFromNodes,
  edgesForShowLinks,
  nodeGraphLinkEdges,
  nodeGraphStructureEdges,
} from "../../src/core/node-graph-model";

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

  it("keeps structure permanent and overlays links only when requested", () => {
    const model = buildNodeGraphModel(tree, new Map([["A", new Set(["B"])]]));
    expect(nodeGraphStructureEdges(model)).toHaveLength(3);
    expect(nodeGraphLinkEdges(model)).toHaveLength(1);
    expect(edgesForShowLinks(model, false)).toHaveLength(3);
    expect(edgesForShowLinks(model, true)).toHaveLength(4);
  });

  it("builds a deep graph iteratively and preserves the supplied sibling order", () => {
    type MutableTree = { id: string; children: MutableTree[] };
    const deep: MutableTree = { id: "0", children: [] };
    let cursor = deep;
    for (let index = 1; index < 20_000; index += 1) {
      const child: MutableTree = { id: String(index), children: [] };
      cursor.children.push(child);
      cursor = child;
    }
    expect(buildNodeGraphModel(deep).nodes).toHaveLength(20_000);

    const reversed = buildNodeGraphModel({
      id: "",
      children: [{ id: "B", children: [] }, { id: "A", children: [] }],
    });
    expect(reversed.nodes.map(({ id }) => id)).toEqual(["", "B", "A"]);
  });

  it("builds a shared model from a scoped forest without inventing structure edges", () => {
    const model = buildNodeGraphModelFromNodes(
      [{ id: "Work", depth: 0 }, { id: "Work/A", depth: 1 }, { id: "External", depth: 0 }],
      [{ source: "Work", target: "Work/A" }],
      new Map([["Work/A", new Set(["External"])]]),
    );
    expect(model.edges).toEqual([
      { source: "External", target: "Work/A", structure: false, link: true },
      { source: "Work", target: "Work/A", structure: true, link: false },
    ]);
  });

  it("retains parent-to-child direction even when the child sorts first", () => {
    const model = buildNodeGraphModel({ id: "Z", children: [{ id: "A", children: [] }] });
    expect(model.edges).toEqual([
      { source: "Z", target: "A", structure: true, link: false },
    ]);
  });
});
