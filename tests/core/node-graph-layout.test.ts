import { describe, expect, it } from "vitest";

import { fitNodeGraphViewport, layoutNodeGraph, layoutNodeGraphForest } from "../../src/core/node-graph-layout";

describe("node graph layout", () => {
  const tree = {
    id: "",
    children: [
      { id: "A", children: [{ id: "A/C", children: [] }] },
      { id: "B", children: [] },
    ],
  };

  it("places parents left of children by default with deterministic coordinates", () => {
    const first = layoutNodeGraph(tree);
    const second = layoutNodeGraph(tree);
    expect(second).toEqual(first);
    const positions = new Map(first.nodes.map((node) => [node.id, node]));
    expect(positions.get("")?.depth).toBe(0);
    expect(positions.get("A")?.depth).toBe(1);
    expect(positions.get("A/C")?.depth).toBe(2);
    expect(first.direction).toBe("left-to-right");
    expect((positions.get("")?.x ?? 0) < (positions.get("A")?.x ?? 0)).toBe(true);
    expect((positions.get("A")?.x ?? 0) < (positions.get("A/C")?.x ?? 0)).toBe(true);
  });

  it("can preserve the original top-to-bottom hierarchy", () => {
    const layout = layoutNodeGraph(tree, { direction: "top-to-bottom" });
    const positions = new Map(layout.nodes.map((node) => [node.id, node]));
    expect(layout.direction).toBe("top-to-bottom");
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

  it("keeps oversized DOM graphs readable and grows the scrollable stage", () => {
    expect(fitNodeGraphViewport(20_000, 8_000, 1_000, 600, 24, 0.65)).toEqual({
      scale: 0.65,
      stageWidth: 13_048,
      stageHeight: 5_248,
      offsetX: 24,
      offsetY: 24,
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

  it("lays out a 20k-deep chain iteratively without overflowing the stack", () => {
    type MutableTree = { id: string; children: MutableTree[] };
    const deep: MutableTree = { id: "0", children: [] };
    let cursor = deep;
    for (let index = 1; index < 20_000; index += 1) {
      const child: MutableTree = { id: String(index), children: [] };
      cursor.children.push(child);
      cursor = child;
    }
    const layout = layoutNodeGraph(deep);
    expect(layout.nodes).toHaveLength(20_000);
    expect(layout.edges).toHaveLength(19_999);
    expect(Math.max(...layout.nodes.map(({ depth }) => depth))).toBe(19_999);
  });

  it("preserves caller sibling order so NodeService manual rank reaches the final layout", () => {
    const forward = layoutNodeGraph({ id: "", children: [{ id: "A", children: [] }, { id: "B", children: [] }] });
    const reversed = layoutNodeGraph({ id: "", children: [{ id: "B", children: [] }, { id: "A", children: [] }] });
    const forwardPositions = new Map(forward.nodes.map((node) => [node.id, node]));
    const reversedPositions = new Map(reversed.nodes.map((node) => [node.id, node]));
    expect((forwardPositions.get("A")?.y ?? 0) < (forwardPositions.get("B")?.y ?? 0)).toBe(true);
    expect((reversedPositions.get("B")?.y ?? 0) < (reversedPositions.get("A")?.y ?? 0)).toBe(true);
  });

  it("lays out disconnected scoped roots without a visible synthetic node or edge", () => {
    const layout = layoutNodeGraphForest([
      { id: "Work", children: [{ id: "Work/A", children: [] }] },
      { id: "External", children: [] },
    ]);
    expect(layout.nodes.map(({ id }) => id).sort()).toEqual(["External", "Work", "Work/A"]);
    expect(layout.nodes.some(({ id }) => id.includes("forest-root"))).toBe(false);
    expect(layout.edges).toEqual([{ source: "Work", target: "Work/A" }]);
    expect(layout.direction).toBe("left-to-right");
    const positions = new Map(layout.nodes.map((node) => [node.id, node]));
    expect((positions.get("Work")?.x ?? 0) < (positions.get("Work/A")?.x ?? 0)).toBe(true);
  });
});
