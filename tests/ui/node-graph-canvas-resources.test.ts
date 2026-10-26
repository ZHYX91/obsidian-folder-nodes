import { describe, expect, it, vi } from "vitest";

import { layoutNodeGraph3D } from "../../src/core/node-graph-3d";
import type { NodeGraphLayout } from "../../src/core/node-graph-layout";
import { buildNodeGraphModel } from "../../src/core/node-graph-model";
import { NodeGraphCanvasRenderer } from "../../src/ui/node-graph-canvas-renderer";

function fixture(count: number, options: { pages?: number; unique?: number; width?: number; height?: number; path?: string } = {}) {
  const pages = options.pages ?? 1;
  const ids = Array.from({ length: count * pages }, (_, index) => options.path ?? `N${index}`);
  const model = buildNodeGraphModel({ id: ids[0]!, children: ids.slice(1).map((id) => ({ id, children: [] })) });
  const records = new Map(ids.map((id, index) => [id, {
    label: id, path: id,
    visual: index % (options.unique ?? count * pages) % 2 === 0
      ? { kind: "image", value: `mock://visual/${index % (options.unique ?? count * pages)}`, accent: null, inheritedFrom: null } as const
      : { kind: "lucide", value: "folder-tree", accent: `#${(index % (options.unique ?? count * pages)).toString(16).padStart(6, "0")}`, inheritedFrom: null } as const,
  }]));
  const layout: NodeGraphLayout = {
    direction: "left-to-right", edges: [], height: 2_160, width: 3_840 + (pages - 1) * 5_000,
    maxNodeWidth: 90, nodeHeight: 46,
    nodes: ids.map((id, index) => ({
      id, depth: 0, width: 90,
      x: Math.floor(index / count) * 5_000 + index % count % 27 * 140,
      y: Math.floor(index % count / 27) * 100,
    })),
  };
  const context = Object.fromEntries([
    "arc", "beginPath", "bezierCurveTo", "clearRect", "clip", "roundRect", "fill", "fillRect", "fillText", "drawImage",
    "lineTo", "moveTo", "restore", "save", "setLineDash", "setTransform", "stroke", "strokeRect",
  ].map((name) => [name, vi.fn()]));
  context.measureText = vi.fn(() => ({ width: 20 }));
  const getContext = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(context as never);
  // Drive both successful and failed decoding explicitly, without host/network timing.
  const imageSource = vi.spyOn(HTMLImageElement.prototype, "src", "set").mockImplementation(() => undefined);
  const create = vi.spyOn(document, "createElement");
  let frameId = 0;
  const frames = new Map<number, FrameRequestCallback>();
  const request = vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    frames.set(++frameId, callback);
    return frameId;
  });
  const cancel = vi.spyOn(window, "cancelAnimationFrame").mockImplementation((id) => { frames.delete(id); });
  const surface = document.body.createDiv();
  Object.defineProperties(surface, {
    clientWidth: { value: options.width ?? 3_840 }, clientHeight: { value: options.height ?? 2_160 },
  });
  const renderer = new NodeGraphCanvasRenderer(surface, { layout, model, records, points3D: layoutNodeGraph3D(model) }, "2d", false, null, {
    label: () => "Node Graph", onOpen: vi.fn(), onSelect: vi.fn(), relationSummary: () => "Structure 0 · Links 0",
  });
  const move = (panX: number, panY = 0) => renderer.restoreViewportState({
    ...renderer.captureViewportState(), camera2D: { panX, panY, zoom: 1 },
  });
  move(0);
  return {
    renderer, surface, frames, move,
    images: () => create.mock.results.flatMap((result) => result.type === "return" && result.value instanceof HTMLImageElement ? [result.value] : []),
    cache: () => (renderer as unknown as { visualImages: Map<string, HTMLImageElement> }).visualImages,
    flush: () => {
      const pending = [...frames.values()];
      frames.clear();
      for (const callback of pending) callback(0);
    },
    dispose: () => {
      renderer.destroy(); surface.remove();
      getContext.mockRestore(); imageSource.mockRestore(); create.mockRestore(); request.mockRestore(); cancel.mockRestore();
    },
  };
}

function settle(images: readonly HTMLImageElement[], outcome: "load" | "error" | "mixed") {
  for (const [index, image] of images.entries()) {
    const success = outcome === "load" || outcome === "mixed" && index % 2 === 0;
    Object.defineProperties(image, {
      complete: { configurable: true, value: true }, naturalWidth: { configurable: true, value: success ? 18 : 0 },
    });
    image.dispatchEvent(new Event(success ? "load" : "error"));
  }
}

describe("Canvas visual working set", () => {
  it.each([
    [256, "load"], [257, "load"], [513, "load"], [513, "error"], [513, "mixed"],
  ] as const)("settles %s distinct visible visuals after %s without further input", (count, outcome) => {
    const current = fixture(count);
    try {
      current.flush();
      expect(current.images()).toHaveLength(count);
      expect(current.cache().size).toBe(count);
      settle(current.images(), outcome);
      expect(current.frames.size).toBe(1);
      current.flush();
      expect(current.images()).toHaveLength(count);
      expect(current.frames.size).toBe(0);
      // A subsequent input-driven frame reuses successful and failed resources.
      current.move(1);
      current.flush();
      expect(current.images()).toHaveLength(count);
      expect(current.frames.size).toBe(0);
    } finally { current.dispose(); }
  });

  it("shares image resources between visible nodes with the same visual", () => {
    const current = fixture(513, { unique: 17 });
    try {
      current.flush();
      expect(current.images()).toHaveLength(17);
      settle(current.images(), "mixed");
      current.flush();
      expect(current.cache().size).toBe(17);
      expect(current.images()).toHaveLength(17);
      expect(current.frames.size).toBe(0);
    } finally { current.dispose(); }
  });

  it("releases the previous viewport and ignores its late completions after panning", () => {
    const current = fixture(513, { pages: 2 });
    try {
      current.flush();
      const previous = current.images();
      const lateLoad = previous[0]!.onload!;
      current.move(-5_000);
      current.flush();
      expect(current.cache().size).toBe(513);
      expect(current.images()).toHaveLength(1_026);
      expect(previous.every((image) => image.onload === null && image.onerror === null)).toBe(true);
      lateLoad.call(previous[0]!, new Event("load"));
      settle(previous, "mixed");
      expect(current.frames.size).toBe(0);
      settle(current.images().slice(513), "mixed");
      current.flush();
      expect(current.images()).toHaveLength(1_026);
      expect(current.frames.size).toBe(0);
      current.move(0);
      current.flush();
      expect(current.cache().size).toBe(513);
      settle(current.images().slice(1_026), "load");
      current.flush();
      expect(current.images()).toHaveLength(1_539);
      expect(current.frames.size).toBe(0);
    } finally { current.dispose(); }
  });

  it("detaches pending visual callbacks on palette invalidation and destroy", () => {
    const current = fixture(257);
    try {
      current.flush();
      const first = current.images();
      const lateLoad = first[0]!.onload!;
      current.renderer.refreshPalette();
      expect(current.cache().size).toBe(0);
      expect(first.every((image) => image.onload === null && image.onerror === null)).toBe(true);
      current.flush();
      const next = current.images().slice(257);
      const lateError = next[0]!.onerror!;
      current.renderer.destroy();
      expect(current.cache().size).toBe(0);
      expect(next.every((image) => image.onload === null && image.onerror === null)).toBe(true);
      lateLoad.call(first[0]!, new Event("load"));
      lateError.call(next[0]!, new Event("error"));
      expect(current.frames.size).toBe(0);
      expect(current.surface.querySelector("canvas")).toBeNull();
    } finally { current.dispose(); }
  });
});

describe("Canvas tooltip bounds", () => {
  it.each(["ltr", "rtl"] as const)("keeps measured tooltips inside every corner in %s", (direction) => {
    for (const width of [140, 800]) {
      const path = `${"很长的中文目录/المجلد-العربي/".repeat(8)}note`;
      const current = fixture(1, { width, height: 240, path });
      current.surface.style.direction = direction;
      current.surface.style.fontSize = "200%";
      const tooltip = current.surface.querySelector<HTMLElement>(".folder-nodes-node-graph-canvas-tooltip")!;
      const tooltipWidth = Math.min(360, width - 16);
      const tooltipHeight = 180;
      vi.spyOn(tooltip, "getBoundingClientRect").mockImplementation(() => {
        expect(tooltip.hidden).toBe(false);
        return { width: tooltipWidth, height: tooltipHeight } as DOMRect;
      });
      try {
        for (const [x, y] of [[1, 1], [width - 1, 1], [1, 239], [width - 1, 239]]) {
          current.move(x! - 45, y! - 23);
          current.flush();
          const canvas = current.surface.querySelector<HTMLCanvasElement>("canvas")!;
          canvas.dispatchEvent(new PointerEvent("pointerleave"));
          const event = new PointerEvent("pointermove", { pointerType: "mouse" });
          Object.defineProperties(event, { offsetX: { value: x }, offsetY: { value: y } });
          canvas.dispatchEvent(event);
          expect(tooltip.hidden).toBe(false);
          expect(tooltip.textContent).toContain(path);
          const left = Number.parseFloat(tooltip.style.left);
          const top = Number.parseFloat(tooltip.style.top);
          expect(left).toBeGreaterThanOrEqual(8);
          expect(left + tooltipWidth).toBeLessThanOrEqual(width - 8);
          expect(top).toBeGreaterThanOrEqual(8);
          expect(top + tooltipHeight).toBeLessThanOrEqual(232);
        }
      } finally { current.dispose(); }
    }
  });
});
