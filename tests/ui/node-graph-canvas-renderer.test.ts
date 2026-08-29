import { describe, expect, it, vi } from "vitest";

import { layoutNodeGraph3D } from "../../src/core/node-graph-3d";
import { layoutNodeGraph, type NodeGraphTree } from "../../src/core/node-graph-layout";
import { buildNodeGraphModel } from "../../src/core/node-graph-model";
import { NodeGraphCanvasRenderer } from "../../src/ui/node-graph-canvas-renderer";

function fakeContext() {
  return {
    arc: vi.fn(), beginPath: vi.fn(), clearRect: vi.fn(), fill: vi.fn(), fillRect: vi.fn(), fillText: vi.fn(),
    lineTo: vi.fn(), moveTo: vi.fn(), restore: vi.fn(), save: vi.fn(), setLineDash: vi.fn(), setTransform: vi.fn(),
    stroke: vi.fn(), strokeRect: vi.fn(),
  };
}

describe("large Node Graph canvas renderer", () => {
  it("renders a deterministic 20k graph with constant graph DOM and tears down", async () => {
    const children = Array.from({ length: 19_999 }, (_, index): NodeGraphTree => ({
      id: `N${String(index).padStart(5, "0")}`,
      children: [],
    }));
    const tree: NodeGraphTree = { id: "", children };
    const model = buildNodeGraphModel(tree);
    const layout = layoutNodeGraph(tree);
    const records = new Map(model.nodes.map(({ id }) => [id, {
      label: id === "" ? "Large Vault" : id,
      path: id,
      visual: { kind: "fallback", value: "folder", accent: null, inheritedFrom: null } as const,
    }]));
    const context = fakeContext();
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(context as never);
    const surface = document.body.createDiv();
    Object.defineProperties(surface, {
      clientHeight: { configurable: true, value: 600 },
      clientWidth: { configurable: true, value: 1_000 },
    });
    const renderer = new NodeGraphCanvasRenderer(
      surface,
      { layout, model, points3D: layoutNodeGraph3D(model), records },
      "2d",
      "structure",
      null,
      {
        label: () => "Large Node Graph",
        onOpen: vi.fn(),
        onSelect: vi.fn(),
        relationSummary: (structure, links) => `Structure ${structure} · Links ${links}`,
      },
    );
    await new Promise((resolve) => window.setTimeout(resolve, 30));

    expect(model.nodes).toHaveLength(20_000);
    expect(surface.querySelectorAll("canvas")).toHaveLength(1);
    expect(surface.querySelectorAll("svg, line")).toHaveLength(0);
    expect(surface.querySelectorAll("button")).toHaveLength(1);
    expect(context.fill).toHaveBeenCalled();

    renderer.destroy();
    expect(surface.querySelectorAll("canvas, button")).toHaveLength(0);
    surface.remove();
    getContext.mockRestore();
  });
});
