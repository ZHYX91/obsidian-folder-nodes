import { describe, expect, it, vi } from "vitest";

import { layoutNodeGraph3D } from "../../src/core/node-graph-3d";
import { layoutNodeGraph, type NodeGraphTree } from "../../src/core/node-graph-layout";
import { buildNodeGraphModel } from "../../src/core/node-graph-model";
import { NodeGraphCanvasRenderer } from "../../src/ui/node-graph-canvas-renderer";

function fakeContext() {
  return {
    arc: vi.fn(), beginPath: vi.fn(), clearRect: vi.fn(), fill: vi.fn(), fillRect: vi.fn(), fillText: vi.fn(),
    lineTo: vi.fn(), moveTo: vi.fn(), quadraticCurveTo: vi.fn(), restore: vi.fn(), save: vi.fn(), setLineDash: vi.fn(), setTransform: vi.fn(),
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
    expect(surface.querySelectorAll("svg, line, path")).toHaveLength(0);
    expect(surface.querySelectorAll("button")).toHaveLength(1);
    expect(context.fillRect).toHaveBeenCalled();
    expect((renderer as unknown as { camera2D: { zoom: number } }).camera2D.zoom).toBeGreaterThanOrEqual(0.22);
    expect(surface.querySelector<HTMLElement>(".folder-nodes-node-graph-edge-lod")?.hidden).toBe(false);

    renderer.destroy();
    expect(surface.querySelectorAll("canvas, button")).toHaveLength(0);
    surface.remove();
    getContext.mockRestore();
  });

  it("renders the fitted 20k 3D overview as dots while keeping one full focus control", async () => {
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
      "3d",
      "structure",
      null,
      {
        label: (key) => key,
        onOpen: vi.fn(),
        onSelect: vi.fn(),
        relationSummary: (structure, links) => `Structure ${structure} · Links ${links}`,
      },
    );
    await new Promise((resolve) => window.setTimeout(resolve, 30));

    expect(context.arc.mock.calls.length).toBeGreaterThan(0);
    expect(context.arc.mock.calls.length).toBeLessThan(20_000);
    expect(context.fillText).not.toHaveBeenCalled();
    renderer.setFocus("N19998", true);
    await new Promise((resolve) => window.setTimeout(resolve, 30));
    const overlay = surface.querySelector<HTMLButtonElement>(".folder-nodes-node-graph-focus-overlay");
    expect(overlay?.hidden).toBe(false);
    expect(overlay?.dataset.nodePath).toBe("N19998");

    renderer.destroy();
    surface.remove();
    getContext.mockRestore();
  });

  it("batches a realistic 125k-edge overview and restores every incident edge on focus", async () => {
    const children = Array.from({ length: 499 }, (_, index): NodeGraphTree => ({
      id: `N${String(index).padStart(3, "0")}`,
      children: [],
    }));
    const tree: NodeGraphTree = { id: "", children };
    const nodes = [{ id: "", depth: 0 }, ...children.map(({ id }) => ({ id, depth: 1 }))];
    const edges = children.map(({ id }) => ({ source: "", target: id, structure: true, link: false }));
    for (let left = 0; left < children.length; left += 1) {
      for (let right = left + 1; right < children.length; right += 1) {
        edges.push({
          source: children[left]?.id ?? "",
          target: children[right]?.id ?? "",
          structure: false,
          link: true,
        });
      }
    }
    const model = { nodes, edges };
    const layout = layoutNodeGraph(tree);
    const records = new Map(nodes.map(({ id }) => [id, {
      label: id === "" ? "Dense Vault" : id,
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
      "hybrid",
      null,
      {
        label: (key) => key,
        onOpen: vi.fn(),
        onSelect: vi.fn(),
        relationSummary: (structure, links) => `Structure ${structure} · Links ${links}`,
      },
    );
    await new Promise((resolve) => window.setTimeout(resolve, 30));

    expect(model.nodes).toHaveLength(500);
    expect(model.edges).toHaveLength(124_750);
    expect(surface.dataset.nodeGraphEdgeLod).toBe("overview");
    expect(surface.querySelector<HTMLElement>(".folder-nodes-node-graph-edge-lod")?.hidden).toBe(false);
    expect(context.stroke.mock.calls.length).toBeLessThanOrEqual(6);
    expect(context.lineTo.mock.calls.length + context.quadraticCurveTo.mock.calls.length).toBeLessThanOrEqual(6_000);
    const overviewCount = (renderer as unknown as { drawnEdges: () => readonly unknown[] }).drawnEdges().length;

    context.lineTo.mockClear();
    context.quadraticCurveTo.mockClear();
    context.stroke.mockClear();
    renderer.setFocus("N000", false);
    await new Promise((resolve) => window.setTimeout(resolve, 30));
    expect(context.stroke.mock.calls.length).toBeLessThanOrEqual(6);
    expect((renderer as unknown as { drawnEdges: () => readonly unknown[] }).drawnEdges().length).toBeGreaterThan(overviewCount);
    expect((renderer as unknown as { drawnEdges: () => readonly unknown[] }).drawnEdges().length).toBeLessThanOrEqual(overviewCount + 499);

    renderer.destroy();
    surface.remove();
    getContext.mockRestore();
  });

  it("can update selection focus without recentering the 3D camera", async () => {
    const tree: NodeGraphTree = {
      id: "",
      children: [{ id: "A", children: [] }, { id: "B", children: [] }],
    };
    const model = buildNodeGraphModel(tree);
    const layout = layoutNodeGraph(tree);
    const records = new Map(model.nodes.map(({ id }) => [id, {
      label: id === "" ? "Vault" : id,
      path: id,
      visual: { kind: "fallback", value: "folder", accent: null, inheritedFrom: null } as const,
    }]));
    const onSelect = vi.fn();
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(fakeContext() as never);
    const surface = document.body.createDiv();
    Object.defineProperties(surface, {
      clientHeight: { configurable: true, value: 600 },
      clientWidth: { configurable: true, value: 1_000 },
    });
    const renderer = new NodeGraphCanvasRenderer(
      surface,
      { layout, model, points3D: layoutNodeGraph3D(model), records },
      "3d",
      "structure",
      null,
      {
        label: () => "Large Node Graph",
        onOpen: vi.fn(),
        onSelect,
        relationSummary: (structure, links) => `Structure ${structure} · Links ${links}`,
      },
    );
    renderer.setFocus("A", true);
    const cameraBeforeSelection = { ...(renderer as unknown as { camera3D: Record<string, number> }).camera3D };
    renderer.setFocus("B", false);
    expect((renderer as unknown as { camera3D: Record<string, number> }).camera3D).toEqual(cameraBeforeSelection);

    const canvas = surface.querySelector<HTMLCanvasElement>("canvas");
    canvas?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerId: 1, pointerType: "mouse" }));
    canvas?.dispatchEvent(new PointerEvent("pointercancel", { bubbles: true, pointerId: 1, pointerType: "mouse" }));
    expect(onSelect).not.toHaveBeenCalled();

    canvas?.dispatchEvent(new PointerEvent("pointerdown", {
      bubbles: true, clientX: 10, clientY: 10, pointerId: 2, pointerType: "mouse",
    }));
    for (let offset = 1; offset <= 10; offset += 1) {
      canvas?.dispatchEvent(new PointerEvent("pointermove", {
        bubbles: true, clientX: 10 + offset, clientY: 10, pointerId: 2, pointerType: "mouse",
      }));
    }
    expect((renderer as unknown as { drag: { moved: boolean } | null }).drag?.moved).toBe(true);
    canvas?.dispatchEvent(new PointerEvent("pointerup", {
      bubbles: true, clientX: 20, clientY: 10, pointerId: 2, pointerType: "mouse",
    }));
    expect(onSelect).not.toHaveBeenCalled();

    canvas?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerId: 3, pointerType: "mouse" }));
    canvas?.dispatchEvent(new PointerEvent("lostpointercapture", {
      bubbles: true, pointerId: 3, pointerType: "mouse",
    }));
    expect((renderer as unknown as { drag: unknown }).drag).toBeNull();
    expect(surface.classList.contains("is-dragging")).toBe(false);

    surface.style.setProperty("--background-primary", "#fefefe");
    renderer.refreshPalette();
    expect((renderer as unknown as { palette: { background: string } }).palette.background).toBe("#fefefe");

    renderer.destroy();
    surface.remove();
    getContext.mockRestore();
  });
});
