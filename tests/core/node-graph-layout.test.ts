import { describe, expect, it } from "vitest";

import { layoutNodeGraph } from "../../src/core/node-graph-layout";

describe("node graph layout", () => {
  const tree = {
    id: "",
    children: [
      { id: "A", children: [{ id: "A/C", children: [] }] },
      { id: "B", children: [] },
    ],
  };

  it("places parents above children with deterministic coordinates", () => {
    const first = layoutNodeGraph(tree);
    const second = layoutNodeGraph(tree);
    expect(second).toEqual(first);
    const positions = new Map(first.nodes.map((node) => [node.id, node]));
    expect(positions.get("")?.depth).toBe(0);
    expect(positions.get("A")?.depth).toBe(1);
    expect(positions.get("A/C")?.depth).toBe(2);
    expect((positions.get("")?.y ?? 0) < (positions.get("A")?.y ?? 0)).toBe(true);
    expect((positions.get("A")?.y ?? 0) < (positions.get("A/C")?.y ?? 0)).toBe(true);
  });

  it("emits one structural edge for every non-root node", () => {
    const layout = layoutNodeGraph(tree);
    expect(layout.edges).toEqual([
      { source: "A", target: "A/C" },
      { source: "", target: "A" },
      { source: "", target: "B" },
    ]);
    expect(layout.width).toBeGreaterThan(0);
    expect(layout.height).toBeGreaterThan(0);
  });
});
