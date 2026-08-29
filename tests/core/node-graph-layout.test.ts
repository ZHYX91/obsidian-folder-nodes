import { describe, expect, it } from "vitest";

import { fitNodeGraphViewport, layoutNodeGraph } from "../../src/core/node-graph-layout";

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

  it("fits a large graph inside the viewport while preserving its aspect ratio", () => {
    expect(fitNodeGraphViewport(1000, 600, 500, 400, 20)).toEqual({
      scale: 0.46,
      stageWidth: 500,
      stageHeight: 400,
      offsetX: 20,
      offsetY: 62,
    });
  });

  it("centers a small graph without enlarging it", () => {
    expect(fitNodeGraphViewport(200, 100, 500, 400, 20)).toEqual({
      scale: 1,
      stageWidth: 500,
      stageHeight: 400,
      offsetX: 150,
      offsetY: 150,
    });
  });

  it("keeps the original layout when the viewport is not measurable", () => {
    expect(fitNodeGraphViewport(200, 100, 0, 0)).toEqual({
      scale: 1,
      stageWidth: 200,
      stageHeight: 100,
      offsetX: 0,
      offsetY: 0,
    });
  });
});
