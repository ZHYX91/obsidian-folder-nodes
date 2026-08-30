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

  it("uses branch-local card widths and preserves the horizontal gap from each parent edge", () => {
    const widths = new Map([
      ["", 144],
      ["A", 220],
      ["B", 220],
      ["A/C", 144],
    ]);
    const layout = layoutNodeGraph(tree, { nodeWidths: widths });
    const positions = new Map(layout.nodes.map((node) => [node.id, node]));
    const root = positions.get("");
    const a = positions.get("A");
    const b = positions.get("B");
    const c = positions.get("A/C");
    expect(root?.width).toBe(144);
    expect(a?.width).toBe(220);
    expect(b?.width).toBe(220);
    expect(c?.width).toBe(144);
    expect((a?.x ?? 0) - ((root?.x ?? 0) + (root?.width ?? 0))).toBe(72);
    expect((c?.x ?? 0) - ((a?.x ?? 0) + (a?.width ?? 0))).toBe(72);
    expect(layout.maxNodeWidth).toBe(220);
    expect(Math.max(...layout.nodes.map((node) => node.x + node.width)) + 32).toBe(layout.width);
  });

  it("keeps variable-width forest roots synthetic-free and derives exact bounds", () => {
    const layout = layoutNodeGraphForest([
      { id: "Work", children: [{ id: "Work/A", children: [] }] },
      { id: "External", children: [] },
    ], {
      nodeWidths: new Map([["Work", 144], ["Work/A", 220], ["External", 220]]),
    });
    const positions = new Map(layout.nodes.map((node) => [node.id, node]));
    expect(positions.get("Work")?.x).toBe(32);
    expect(positions.get("External")?.x).toBe(32);
    expect((positions.get("Work/A")?.x ?? 0) - (
      (positions.get("Work")?.x ?? 0) + (positions.get("Work")?.width ?? 0)
    )).toBe(72);
    expect(layout.nodes.some(({ id }) => id.includes("forest-root"))).toBe(false);
    expect(Math.max(...layout.nodes.map((node) => node.x + node.width)) + 32).toBe(layout.width);
  });

  it("falls back safely when a per-node width is invalid", () => {
    const layout = layoutNodeGraph(tree, {
      nodeWidth: 160,
      nodeWidths: new Map([["", Number.NaN], ["A", -4]]),
    });
    expect(layout.nodes.every(({ width }) => width === 160)).toBe(true);
    expect(layout.maxNodeWidth).toBe(160);
  });

  it("allocates top-to-bottom subtree bands so wide parents cannot overlap", () => {
    const nested = {
      id: "root",
      children: [
        { id: "A", children: [{ id: "A/leaf", children: [] }] },
        { id: "B", children: [{ id: "B/leaf", children: [] }] },
      ],
    };
    const layout = layoutNodeGraph(nested, {
      direction: "top-to-bottom",
      nodeWidths: new Map([
        ["root", 144], ["A", 220], ["B", 220], ["A/leaf", 144], ["B/leaf", 144],
      ]),
    });
    const positions = new Map(layout.nodes.map((node) => [node.id, node]));
    const a = positions.get("A");
    const b = positions.get("B");
    const aLeaf = positions.get("A/leaf");
    expect((b?.x ?? 0) - ((a?.x ?? 0) + (a?.width ?? 0))).toBe(36);
    expect((a?.x ?? 0) + (a?.width ?? 0) / 2).toBe((aLeaf?.x ?? 0) + (aLeaf?.width ?? 0) / 2);
  });

  it("keeps a deep variable-width top-to-bottom chain iterative", () => {
    type MutableTree = { id: string; children: MutableTree[] };
    const deep: MutableTree = { id: "0", children: [] };
    const widths = new Map<string, number>([["0", 144]]);
    let cursor = deep;
    for (let index = 1; index < 20_000; index += 1) {
      const id = String(index);
      const child: MutableTree = { id, children: [] };
      widths.set(id, index % 2 === 0 ? 144 : 220);
      cursor.children.push(child);
      cursor = child;
    }
    const layout = layoutNodeGraph(deep, { direction: "top-to-bottom", nodeWidths: widths });
    expect(layout.nodes).toHaveLength(20_000);
    expect(layout.maxNodeWidth).toBe(220);
  });
});
