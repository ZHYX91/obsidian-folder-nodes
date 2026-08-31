import { describe, expect, it, vi } from "vitest";

import { layoutNodeGraph3D } from "../../src/core/node-graph-3d";
import { layoutNodeGraph, type NodeGraphTree } from "../../src/core/node-graph-layout";
import { buildNodeGraphModel } from "../../src/core/node-graph-model";
import { NodeGraphCanvasRenderer } from "../../src/ui/node-graph-canvas-renderer";

function fakeContext() {
  return {
    arc: vi.fn(), beginPath: vi.fn(), bezierCurveTo: vi.fn(), clearRect: vi.fn(), fill: vi.fn(), fillRect: vi.fn(), fillText: vi.fn(),
    drawImage: vi.fn(), lineTo: vi.fn(), measureText: vi.fn((text: string) => ({ width: [...text].length * 7 })), moveTo: vi.fn(), quadraticCurveTo: vi.fn(), restore: vi.fn(), save: vi.fn(), setLineDash: vi.fn(), setTransform: vi.fn(),
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
      false,
      null,
      {
        label: (key) => key === "altBranchHint" ? "Hold Alt to toggle the complete branch" : "Large Node Graph",
        onOpen: vi.fn(),
        onSelect: vi.fn(),
        relationSummary: (structure, links) => `Structure ${structure} · Links ${links}`,
      },
    );
    await new Promise((resolve) => window.setTimeout(resolve, 30));

    expect(model.nodes).toHaveLength(20_000);
    expect(surface.querySelectorAll("canvas")).toHaveLength(1);
    expect(surface.querySelectorAll("svg, line, path")).toHaveLength(0);
    expect(surface.querySelectorAll("button")).toHaveLength(2);
    expect(context.fillRect).toHaveBeenCalled();
    expect((renderer as unknown as { camera2D: { zoom: number } }).camera2D.zoom).toBeGreaterThanOrEqual(0.38);
    expect((renderer as unknown as { projectedById: ReadonlyMap<string, unknown> }).projectedById.size).toBeLessThan(500);
    expect(context.bezierCurveTo.mock.calls.length).toBe(model.nodes.length - 1);
    expect(surface.querySelector(".folder-nodes-node-graph-edge-lod")).toBeNull();

    renderer.destroy();
    expect(surface.querySelectorAll("canvas, button")).toHaveLength(0);
    surface.remove();
    getContext.mockRestore();
  });

  it("keeps a visible child's structure edge when its parent endpoint is offscreen", async () => {
    const tree: NodeGraphTree = { id: "", children: [{ id: "A", children: [] }] };
    const model = buildNodeGraphModel(tree);
    const layout = {
      direction: "left-to-right" as const,
      edges: [{ source: "", target: "A" }],
      height: 646,
      nodeHeight: 46,
      nodes: [
        { depth: 0, id: "", width: 180, x: 0, y: 277 },
        { depth: 1, id: "A", width: 180, x: 1_000, y: 277 },
      ],
      maxNodeWidth: 180,
      width: 1_180,
    };
    const records = new Map(model.nodes.map(({ id }) => [id, {
      label: id === "" ? "Vault" : id,
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
      false,
      null,
      {
        label: () => "Large Node Graph",
        onOpen: vi.fn(),
        onSelect: vi.fn(),
        relationSummary: (structure, links) => `Structure ${structure} · Links ${links}`,
      },
    );
    await new Promise((resolve) => window.setTimeout(resolve, 30));
    context.bezierCurveTo.mockClear();
    renderer.restoreViewportState({
      camera2D: { panX: -590, panY: 0, zoom: 1 },
      camera3D: renderer.captureViewportState().camera3D,
      dimension: "2d",
    });
    await new Promise((resolve) => window.setTimeout(resolve, 30));

    const projected = (renderer as unknown as { projectedById: ReadonlyMap<string, unknown> }).projectedById;
    expect(projected.has("A")).toBe(true);
    expect(projected.has("")).toBe(false);
    expect(context.bezierCurveTo).toHaveBeenCalledTimes(1);

    context.bezierCurveTo.mockClear();
    renderer.restoreViewportState({
      camera2D: { panX: 410, panY: 0, zoom: 1 },
      camera3D: renderer.captureViewportState().camera3D,
      dimension: "2d",
    });
    await new Promise((resolve) => window.setTimeout(resolve, 30));
    expect(projected.has("")).toBe(true);
    expect(projected.has("A")).toBe(false);
    expect(context.bezierCurveTo).toHaveBeenCalledTimes(1);

    renderer.destroy();
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
      false,
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
      true,
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
    expect(surface.dataset.nodeGraphEdgeLod).toBeUndefined();
    expect(surface.querySelector(".folder-nodes-node-graph-edge-lod")).toBeNull();
    expect(context.stroke.mock.calls.length).toBeLessThanOrEqual(6);
    expect((renderer as unknown as { structureEdges: readonly unknown[] }).structureEdges).toHaveLength(499);
    expect((renderer as unknown as { overviewLinkEdges: readonly unknown[] }).overviewLinkEdges.length).toBeLessThanOrEqual(6_000);
    expect(context.quadraticCurveTo.mock.calls.length).toBeLessThanOrEqual(6_000);
    const overviewCount = (renderer as unknown as { drawnLinkEdges: () => readonly unknown[] }).drawnLinkEdges().length;

    context.lineTo.mockClear();
    context.quadraticCurveTo.mockClear();
    context.stroke.mockClear();
    renderer.setFocus("N000", false);
    await new Promise((resolve) => window.setTimeout(resolve, 30));
    expect(context.stroke.mock.calls.length).toBeLessThanOrEqual(6);
    expect((renderer as unknown as { drawnLinkEdges: () => readonly unknown[] }).drawnLinkEdges().length).toBeGreaterThan(overviewCount);
    expect((renderer as unknown as { drawnLinkEdges: () => readonly unknown[] }).drawnLinkEdges().length).toBeLessThanOrEqual(overviewCount + 499);

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
      false,
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
    const restoredCamera = {
      camera2D: { panX: 41, panY: -27, zoom: 1.4 },
      camera3D: { panX: 19, panY: 23, pitch: 0.2, yaw: -0.3, zoom: 0.9 },
      dimension: "3d" as const,
    };
    renderer.restoreViewportState(restoredCamera);
    expect(renderer.captureViewportState()).toEqual(restoredCamera);

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

  it("shows the hovered 3D card ahead of focus and restores the focus card on leave", () => {
    const tree: NodeGraphTree = { id: "", children: [{ id: "A", children: [] }, { id: "B", children: [] }] };
    const model = buildNodeGraphModel(tree);
    const layout = layoutNodeGraph(tree);
    const records = new Map(model.nodes.map(({ id }) => [id, {
      label: id === "" ? "Vault" : id,
      path: id,
      visual: { kind: "fallback", value: "folder", accent: null, inheritedFrom: null } as const,
    }]));
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
      false,
      "A",
      {
        label: (key) => key === "altBranchHint" ? "Hold Alt for branch" : key,
        onOpen: vi.fn(),
        onSelect: vi.fn(),
        relationSummary: (structure, links) => `Structure ${structure} · Links ${links}`,
      },
    );
    const points = new Map([
      ["A", { id: "A", scale: 1, x: 100, y: 100 }],
      ["B", { id: "B", scale: 1, x: 300, y: 100 }],
    ]);
    const internals = renderer as unknown as {
      showTooltip: (x: number, y: number) => void;
      updateFocusOverlay: (projected: ReadonlyMap<string, { readonly id: string; readonly scale: number; readonly x: number; readonly y: number }>) => void;
      visiblePoints: readonly { readonly id: string; readonly scale: number; readonly x: number; readonly y: number }[];
    };
    internals.visiblePoints = [...points.values()];
    internals.showTooltip(300, 100);
    internals.updateFocusOverlay(points);
    const overlay = surface.querySelector<HTMLElement>(".folder-nodes-node-graph-focus-overlay");
    expect(overlay?.dataset.nodePath).toBe("B");

    const leave = new PointerEvent("pointerleave", { bubbles: true });
    overlay?.dispatchEvent(leave);
    internals.updateFocusOverlay(points);
    expect(overlay?.dataset.nodePath).toBe("A");

    renderer.destroy();
    surface.remove();
    getContext.mockRestore();
  });

  it("uses the same dense 3D dot/card presentation for drawing and hit testing", () => {
    const children = Array.from({ length: 49 }, (_, index): NodeGraphTree => ({
      id: `N${String(index).padStart(3, "0")}`,
      children: [],
    }));
    const tree: NodeGraphTree = { id: "", children };
    const model = buildNodeGraphModel(tree);
    const layout = layoutNodeGraph(tree);
    const records = new Map(model.nodes.map(({ id }) => [id, {
      label: id === "" ? "Vault" : id,
      path: id,
      visual: { kind: "fallback", value: "folder", accent: null, inheritedFrom: null } as const,
    }]));
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
      false,
      null,
      {
        label: (key) => key === "altBranchHint" ? "Hold Alt to toggle the complete branch" : "Large Node Graph",
        onOpen: vi.fn(),
        onSelect: vi.fn(),
        relationSummary: (structure, links) => `Structure ${structure} · Links ${links}`,
      },
    );
    const point = { id: "N000", scale: 0.5, x: 100, y: 100 };
    const internals = renderer as unknown as {
      hitTest: (x: number, y: number) => string | null;
      presentationForPoint: (value: typeof point) => { readonly kind: "card" | "dot" };
      projectedById: Map<string, typeof point>;
      visiblePoints: readonly typeof point[];
    };
    internals.visiblePoints = [point];
    internals.projectedById.clear();
    internals.projectedById.set(point.id, point);

    expect(internals.presentationForPoint(point).kind).toBe("dot");
    renderer.setSearchMatches(records.keys());
    expect(internals.presentationForPoint(point).kind).toBe("dot");
    expect(internals.hitTest(103, 100)).toBe("N000");
    expect(internals.hitTest(106, 100)).toBeNull();

    renderer.setFocus("N000", false);
    expect(internals.presentationForPoint(point).kind).toBe("card");
    expect(internals.hitTest(130, 100)).toBe("N000");

    renderer.destroy();
    surface.remove();
    getContext.mockRestore();
  });

  it("draws a fixed 2D visual handle at the structure entry without consuming the label slot", async () => {
    const tree: NodeGraphTree = { id: "", children: [{ id: "A", children: [] }] };
    const model = buildNodeGraphModel(tree);
    const layout = layoutNodeGraph(tree);
    const records = new Map(model.nodes.map(({ id }) => [id, {
      label: id === "" ? "Vault" : id,
      path: id,
      visual: id === ""
        ? { kind: "emoji", value: "📁", accent: "#aa55ff", inheritedFrom: null } as const
        : { kind: "fallback", value: "folder", accent: null, inheritedFrom: null } as const,
    }]));
    const context = fakeContext();
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(context as never);
    const surface = document.body.createDiv();
    surface.style.setProperty("--folder-nodes-emoji-font", "Test Emoji");
    surface.style.setProperty("--folder-nodes-glyph-font", "Test Glyph");
    Object.defineProperties(surface, {
      clientHeight: { configurable: true, value: 600 },
      clientWidth: { configurable: true, value: 1_000 },
    });
    const renderer = new NodeGraphCanvasRenderer(
      surface,
      { layout, model, points3D: layoutNodeGraph3D(model), records },
      "2d",
      false,
      null,
      {
        label: () => "Large Node Graph",
        onOpen: vi.fn(),
        onSelect: vi.fn(),
        relationSummary: (structure, links) => `Structure ${structure} · Links ${links}`,
      },
    );
    await new Promise((resolve) => window.setTimeout(resolve, 30));

    expect(context.bezierCurveTo).toHaveBeenCalledTimes(1);
    expect(context.arc).toHaveBeenCalled();
    expect(context.fillText.mock.calls.some(([text]) => text === "📁")).toBe(true);
    expect(context.fillText.mock.calls.some(([text]) => text === "Vault")).toBe(true);
    expect((renderer as unknown as { palette: { emojiFont: string; glyphFont: string } }).palette).toMatchObject({
      emojiFont: "Test Emoji",
      glyphFont: "Test Glyph",
    });
    const cachedIcon = document.createElement("img");
    Object.defineProperties(cachedIcon, {
      complete: { configurable: true, value: true },
      naturalWidth: { configurable: true, value: 18 },
    });
    const internals = renderer as unknown as {
      drawVisualHandle: (record: {
        readonly label: string;
        readonly path: string;
        readonly visual: { readonly accent: null; readonly inheritedFrom: null; readonly kind: "lucide"; readonly value: string };
      }, presentation: { readonly box: { readonly height: number; readonly width: number; readonly x: number; readonly y: number } }) => void;
      visualImages: Map<string, HTMLImageElement>;
    };
    internals.visualImages.set("lucide\u0000folder-tree\u0000", cachedIcon);
    internals.drawVisualHandle({
      label: "Tree",
      path: "Tree",
      visual: { accent: null, inheritedFrom: null, kind: "lucide", value: "folder-tree" },
    }, { box: { height: 46, width: 180, x: 200, y: 100 } });
    expect(context.drawImage).toHaveBeenCalledWith(cachedIcon, 103, 93, 14, 14);
    renderer.refreshPalette();
    expect(internals.visualImages.size).toBe(0);

    renderer.destroy();
    surface.remove();
    getContext.mockRestore();
  });

  it("uses compact Canvas bounds, ellipsizes the drawn label, and keeps the full accessible title", async () => {
    const tree: NodeGraphTree = { id: "", children: [] };
    const model = buildNodeGraphModel(tree);
    const layout = layoutNodeGraph(tree, { nodeWidths: new Map([["", 144]]) });
    const fullLabel = "A deliberately long Canvas node title that must not be squeezed";
    const records = new Map([["", {
      label: fullLabel,
      path: "",
      visual: { kind: "fallback", value: "folder", accent: null, inheritedFrom: null } as const,
    }]]);
    const context = fakeContext();
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(context as never);
    const surface = document.body.createDiv();
    Object.defineProperties(surface, {
      clientHeight: { configurable: true, value: 600 },
      clientWidth: { configurable: true, value: 1_000 },
    });
    const renderer = new NodeGraphCanvasRenderer(
      surface,
      { layout, model, points3D: layoutNodeGraph3D(model, { nodeWidths: new Map([["", 144]]) }), records },
      "2d",
      false,
      "",
      {
        label: () => "Large Node Graph",
        onOpen: vi.fn(),
        onSelect: vi.fn(),
        relationSummary: (structure, links) => `Structure ${structure} · Links ${links}`,
      },
    );
    await new Promise((resolve) => window.setTimeout(resolve, 30));

    expect(context.fillText.mock.calls.some(([text]) => typeof text === "string" && text.endsWith("…"))).toBe(true);
    expect(context.fillText.mock.calls.some(([text]) => text === fullLabel)).toBe(false);
    const overlay = surface.querySelector<HTMLElement>(".folder-nodes-node-graph-focus-overlay");
    expect(overlay?.style.width).toBe("144px");
    expect(overlay?.getAttribute("title")).toContain(fullLabel);

    renderer.destroy();
    surface.remove();
    getContext.mockRestore();
  });

  it("provides initial keyboard focus, Space activation, context menus, and Alt branch toggles", () => {
    const tree: NodeGraphTree = { id: "", children: [{ id: "A", children: [] }] };
    const model = buildNodeGraphModel(tree);
    const layout = layoutNodeGraph(tree);
    const records = new Map(model.nodes.map(({ id }) => [id, {
      childCount: id === "" ? 1 : 0,
      expanded: false,
      label: id === "" ? "Vault" : id,
      path: id,
      visual: { kind: "fallback", value: "folder", accent: null, inheritedFrom: null } as const,
    }]));
    const onContextMenu = vi.fn();
    const onOpen = vi.fn();
    const onSelect = vi.fn();
    const onToggle = vi.fn();
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(fakeContext() as never);
    const surface = document.body.createDiv();
    Object.defineProperties(surface, {
      clientHeight: { configurable: true, value: 600 },
      clientWidth: { configurable: true, value: 1_000 },
    });
    const renderer = new NodeGraphCanvasRenderer(
      surface,
      { layout, model, points3D: layoutNodeGraph3D(model), records },
      "2d",
      false,
      null,
      {
        label: (key) => key === "altBranchHint" ? "Hold Alt to toggle the complete branch" : "Large Node Graph",
        onContextMenu,
        onOpen,
        onSelect,
        onToggle,
        relationSummary: (structure, links) => `Structure ${structure} · Links ${links}`,
      },
    );
    const point = { id: "", scale: 1, x: 100, y: 100 };
    const internals = renderer as unknown as {
      drag: { moved: boolean; pan: boolean; pointerId: number; travel: number; x: number; y: number } | null;
      finishPointer: (event: PointerEvent, allowSelection: boolean) => void;
      pointers: Map<number, { pointerType: string; x: number; y: number }>;
      projectedById: Map<string, typeof point>;
      visiblePoints: readonly typeof point[];
    };
    internals.visiblePoints = [point];
    internals.projectedById.clear();
    internals.projectedById.set(point.id, point);
    const canvas = surface.querySelector<HTMLCanvasElement>("canvas");

    canvas?.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Enter" }));
    expect(onSelect).toHaveBeenCalledWith("");
    expect(surface.querySelector("[role='status']")?.textContent).toContain("Vault");
    onSelect.mockClear();
    const escape = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "Escape" });
    canvas?.dispatchEvent(escape);
    expect(escape.defaultPrevented).toBe(true);
    expect(onSelect).toHaveBeenCalledWith(null);
    canvas?.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Enter" }));
    canvas?.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: " " }));
    expect(onOpen).toHaveBeenCalledWith("", false);
    const keyboardMenu = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "F10", shiftKey: true });
    canvas?.dispatchEvent(keyboardMenu);
    expect(keyboardMenu.defaultPrevented).toBe(true);
    expect(onContextMenu).toHaveBeenCalledWith("", expect.any(MouseEvent));
    onContextMenu.mockClear();

    const menuEvent = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
    Object.defineProperties(menuEvent, {
      offsetX: { configurable: true, value: 100 },
      offsetY: { configurable: true, value: 100 },
    });
    canvas?.dispatchEvent(menuEvent);
    expect(menuEvent.defaultPrevented).toBe(true);
    expect(onContextMenu).toHaveBeenCalledWith("", menuEvent);

    const pointerEvent = new PointerEvent("pointerup", { altKey: true, pointerId: 7, pointerType: "mouse" });
    Object.defineProperties(pointerEvent, {
      offsetX: { configurable: true, value: 180 },
      offsetY: { configurable: true, value: 100 },
    });
    internals.drag = { moved: false, pan: true, pointerId: 7, travel: 0, x: 180, y: 100 };
    internals.pointers.set(7, { pointerType: "mouse", x: 180, y: 100 });
    internals.finishPointer(pointerEvent, true);
    expect(onToggle).toHaveBeenCalledWith("", true);

    const overlay = surface.querySelector<HTMLElement>(".folder-nodes-node-graph-focus-overlay");
    (renderer as unknown as { updateFocusOverlay: (points: ReadonlyMap<string, typeof point>) => void })
      .updateFocusOverlay(new Map([[point.id, point]]));
    expect(overlay?.querySelector(".folder-nodes-node-graph-focus-overlay-body")?.getAttribute("aria-label"))
      .toContain("Vault");
    expect(overlay?.querySelector(".folder-nodes-node-graph-focus-overlay-toggle")?.getAttribute("aria-expanded"))
      .toBe("false");
    expect(overlay?.querySelector(".folder-nodes-node-graph-focus-overlay-toggle")?.getAttribute("title"))
      .toContain("Alt");
    (renderer as unknown as { showTooltip: (x: number, y: number) => void }).showTooltip(180, 100);
    expect(surface.querySelector(".folder-nodes-node-graph-canvas-tooltip")?.textContent).toContain("Alt");

    onSelect.mockClear();
    canvas?.dispatchEvent(new PointerEvent("pointerdown", {
      bubbles: true, clientX: 100, clientY: 100, pointerId: 8, pointerType: "touch",
    }));
    canvas?.dispatchEvent(new PointerEvent("pointermove", {
      bubbles: true, clientX: 104, clientY: 100, pointerId: 8, pointerType: "touch",
    }));
    expect(internals.drag?.moved).toBe(false);
    const touchUp = new PointerEvent("pointerup", {
      bubbles: true, clientX: 104, clientY: 100, pointerId: 8, pointerType: "touch",
    });
    Object.defineProperties(touchUp, {
      offsetX: { configurable: true, value: 100 },
      offsetY: { configurable: true, value: 100 },
    });
    canvas?.dispatchEvent(touchUp);
    expect(onSelect).toHaveBeenCalledWith("");

    onSelect.mockClear();
    canvas?.dispatchEvent(new PointerEvent("pointerdown", {
      bubbles: true, clientX: 500, clientY: 500, pointerId: 11, pointerType: "mouse",
    }));
    const backgroundUp = new PointerEvent("pointerup", {
      bubbles: true, clientX: 500, clientY: 500, pointerId: 11, pointerType: "mouse",
    });
    Object.defineProperties(backgroundUp, {
      offsetX: { configurable: true, value: 500 },
      offsetY: { configurable: true, value: 500 },
    });
    canvas?.dispatchEvent(backgroundUp);
    expect(onSelect).toHaveBeenCalledWith(null);

    onSelect.mockClear();
    canvas?.dispatchEvent(new PointerEvent("pointerdown", {
      bubbles: true, clientX: 90, clientY: 100, pointerId: 9, pointerType: "touch",
    }));
    canvas?.dispatchEvent(new PointerEvent("pointerdown", {
      bubbles: true, clientX: 110, clientY: 100, pointerId: 10, pointerType: "touch",
    }));
    canvas?.dispatchEvent(new PointerEvent("pointermove", {
      bubbles: true, clientX: 120, clientY: 100, pointerId: 10, pointerType: "touch",
    }));
    canvas?.dispatchEvent(new PointerEvent("pointerup", {
      bubbles: true, clientX: 90, clientY: 100, pointerId: 9, pointerType: "touch",
    }));
    canvas?.dispatchEvent(new PointerEvent("pointerup", {
      bubbles: true, clientX: 120, clientY: 100, pointerId: 10, pointerType: "touch",
    }));
    expect(onSelect).not.toHaveBeenCalled();

    const wheel = new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY: 100_000 });
    Object.defineProperties(wheel, {
      offsetX: { configurable: true, value: 100 },
      offsetY: { configurable: true, value: 100 },
    });
    canvas?.dispatchEvent(wheel);
    const readable = renderer as unknown as {
      camera2D: { readonly zoom: number };
      presentationForPoint: (candidate: typeof point) => { readonly label: boolean };
    };
    expect(readable.camera2D.zoom).toBe(0.38);
    expect(readable.presentationForPoint({ ...point, scale: readable.camera2D.zoom }).label).toBe(true);

    renderer.destroy();
    surface.remove();
    getContext.mockRestore();
  });
});
