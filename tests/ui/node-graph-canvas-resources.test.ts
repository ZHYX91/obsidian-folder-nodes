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
    clientWidth: { configurable: true, value: options.width ?? 3_840 }, clientHeight: { configurable: true, value: options.height ?? 2_160 },
  });
  const callbacks = {
    label: () => "Node Graph", onOpen: vi.fn(), onSelect: vi.fn(), onContextMenu: vi.fn(), relationSummary: () => "Structure 0 · Links 0",
  };
  const renderer = new NodeGraphCanvasRenderer(surface, { layout, model, records, points3D: layoutNodeGraph3D(model) }, "2d", false, null, callbacks);
  const move = (panX: number, panY = 0) => renderer.restoreViewportState({
    ...renderer.captureViewportState(), camera2D: { panX, panY, zoom: 1 },
  });
  move(0);
  return {
    renderer, surface, frames, move, callbacks,
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
  it.each([23, 120, 230])("keeps overflowing details outside the trigger at y=%s so node actions retain their target", (y) => {
    const current = fixture(1, { width: 140, height: 240, path: "long/path/".repeat(100) });
    const canvas = current.surface.querySelector<HTMLCanvasElement>("canvas")!;
    const tooltip = current.surface.querySelector<HTMLElement>(".folder-nodes-node-graph-canvas-tooltip")!;
    Object.defineProperties(tooltip, { scrollHeight: { value: 1_200 }, clientHeight: { value: 224 } });
    vi.spyOn(tooltip, "getBoundingClientRect").mockImplementation(() => ({
      width: 124, height: Math.min(224, Number.parseFloat(tooltip.style.maxHeight) || 224),
    }) as DOMRect);
    const event = (type: string): PointerEvent => {
      const result = new PointerEvent(type, { pointerId: 1, pointerType: "mouse", bubbles: true, clientX: 45, clientY: y });
      Object.defineProperties(result, { offsetX: { value: 45 }, offsetY: { value: y } });
      return result;
    };
    try {
      current.move(0, y - 23);
      current.flush();
      const show = (): void => { canvas.dispatchEvent(event("pointermove")); };
      show();
      const top = Number.parseFloat(tooltip.style.top);
      const height = tooltip.getBoundingClientRect().height;
      expect(y < top || y > top + height).toBe(true);
      expect(tooltip.tabIndex).toBe(0);
      canvas.dispatchEvent(event("pointerdown"));
      canvas.dispatchEvent(event("pointerup"));
      expect(current.callbacks.onSelect).toHaveBeenCalledOnce();
      expect(current.callbacks.onSelect).toHaveBeenCalledWith("long/path/".repeat(100));
      show();
      canvas.dispatchEvent(event("dblclick"));
      expect(current.callbacks.onOpen).toHaveBeenCalledOnce();
      expect(current.callbacks.onOpen).toHaveBeenCalledWith("long/path/".repeat(100), false);
      expect(tooltip.hidden).toBe(true);
      show();
      canvas.dispatchEvent(event("contextmenu"));
      expect(current.callbacks.onContextMenu).toHaveBeenCalledOnce();
      expect(current.callbacks.onContextMenu).toHaveBeenCalledWith("long/path/".repeat(100), expect.any(PointerEvent));
      expect(tooltip.hidden).toBe(true);
    } finally { current.dispose(); }
  });

  it("resets both scroll axes when changing the displayed node", () => {
    const current = fixture(2);
    const canvas = current.surface.querySelector<HTMLCanvasElement>("canvas")!;
    const tooltip = current.surface.querySelector<HTMLElement>(".folder-nodes-node-graph-canvas-tooltip")!;
    const show = (x: number): void => {
      const event = new PointerEvent("pointermove", { pointerType: "mouse" });
      Object.defineProperties(event, { offsetX: { value: x }, offsetY: { value: 23 } });
      canvas.dispatchEvent(event);
    };
    try {
      current.flush();
      show(45);
      tooltip.scrollTop = 500;
      tooltip.scrollLeft = 70;
      show(185);
      expect(tooltip.textContent).toContain("N1");
      expect(tooltip.scrollTop).toBe(0);
      expect(tooltip.scrollLeft).toBe(0);
    } finally { current.dispose(); }
  });

  it("resets a reopened detail when hidden scroll boxes ignore offset writes", () => {
    const current = fixture(2);
    const canvas = current.surface.querySelector<HTMLCanvasElement>("canvas")!;
    const tooltip = current.surface.querySelector<HTMLElement>(".folder-nodes-node-graph-canvas-tooltip")!;
    let top = 0;
    let left = 0;
    Object.defineProperties(tooltip, {
      scrollTop: { get: () => tooltip.hidden ? 0 : top, set: (value: number) => { if (!tooltip.hidden) top = value; } },
      scrollLeft: { get: () => tooltip.hidden ? 0 : left, set: (value: number) => { if (!tooltip.hidden) left = value; } },
    });
    const show = (x: number): void => {
      const move = new PointerEvent("pointermove", { pointerType: "mouse" });
      Object.defineProperties(move, { offsetX: { value: x }, offsetY: { value: 23 } });
      canvas.dispatchEvent(move);
    };
    try {
      current.flush();
      show(45);
      tooltip.scrollTop = 500;
      tooltip.scrollLeft = 70;
      tooltip.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      expect(tooltip.hidden).toBe(true);
      show(185);
      expect(tooltip.textContent).toContain("N1");
      expect(tooltip.scrollTop).toBe(0);
      expect(tooltip.scrollLeft).toBe(0);
      tooltip.scrollTop = 120;
      show(185);
      expect(tooltip.scrollTop).toBe(120);
      tooltip.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      show(185);
      expect(tooltip.scrollTop).toBe(0);
    } finally { current.dispose(); }
  });

  it("bridges empty Canvas space into details and cancels old dismissal on entry, focus, a new node and resize", () => {
    const current = fixture(2, { width: 400, height: 240 });
    const canvas = current.surface.querySelector<HTMLCanvasElement>("canvas")!;
    const tooltip = current.surface.querySelector<HTMLElement>(".folder-nodes-node-graph-canvas-tooltip")!;
    Object.defineProperties(tooltip, { scrollHeight: { value: 1_200 }, clientHeight: { value: 224 } });
    vi.spyOn(tooltip, "getBoundingClientRect").mockImplementation(() => ({
      width: 124, height: Math.min(224, Number.parseFloat(tooltip.style.maxHeight) || 224),
    }) as DOMRect);
    const move = (x: number): void => {
      const event = new PointerEvent("pointermove", { pointerType: "mouse" });
      Object.defineProperties(event, { offsetX: { value: x }, offsetY: { value: 23 } });
      canvas.dispatchEvent(event);
    };
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      current.flush();
      move(45);
      move(100); // Gap after N0, before N1 and the note.
      vi.advanceTimersByTime(100);
      expect(tooltip.hidden).toBe(false);
      tooltip.dispatchEvent(new PointerEvent("pointerenter"));
      vi.advanceTimersByTime(201);
      expect(tooltip.hidden).toBe(false);
      tooltip.dispatchEvent(new PointerEvent("pointerleave"));
      tooltip.focus();
      vi.advanceTimersByTime(201);
      expect(tooltip.hidden).toBe(false);
      tooltip.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      expect(document.activeElement).toBe(canvas);
      move(45);
      move(100);
      vi.advanceTimersByTime(100);
      move(185);
      vi.advanceTimersByTime(201);
      expect(tooltip.textContent).toContain("N1");
      expect(tooltip.hidden).toBe(false);
      move(100);
      Object.defineProperty(current.surface, "clientHeight", { value: 140 });
      current.renderer.resize();
      current.flush();
      vi.advanceTimersByTime(201);
      expect(tooltip.hidden).toBe(true);
      move(185);
      expect(tooltip.hidden).toBe(false);
      canvas.dispatchEvent(new PointerEvent("pointerleave"));
      vi.advanceTimersByTime(201);
      expect(tooltip.hidden).toBe(true);
    } finally { current.dispose(); vi.useRealTimers(); }
  });

  it.each(["pointer", "focus", "related-target"] as const)("keeps details open when returning to the node by %s", (transition) => {
    const current = fixture(1, { width: 140, height: 240 });
    const canvas = current.surface.querySelector<HTMLCanvasElement>("canvas")!;
    const overlay = current.surface.querySelector<HTMLElement>(".folder-nodes-node-graph-focus-overlay")!;
    const body = overlay.querySelector<HTMLButtonElement>("button")!;
    const tooltip = current.surface.querySelector<HTMLElement>(".folder-nodes-node-graph-canvas-tooltip")!;
    Object.defineProperties(tooltip, { scrollHeight: { value: 1_200 }, clientHeight: { value: 224 } });
    vi.spyOn(tooltip, "getBoundingClientRect").mockImplementation(() => ({
      width: 124, height: Math.min(224, Number.parseFloat(tooltip.style.maxHeight) || 224),
    }) as DOMRect);
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      current.flush();
      const move = new PointerEvent("pointermove", { pointerType: "mouse" });
      Object.defineProperties(move, { offsetX: { value: 45 }, offsetY: { value: 23 } });
      canvas.dispatchEvent(move);
      current.flush();
      expect(overlay.hidden).toBe(false);
      tooltip.dispatchEvent(new PointerEvent("pointerenter"));
      tooltip.dispatchEvent(new PointerEvent("pointerleave"));
      expect(vi.getTimerCount()).toBe(1);
      vi.advanceTimersByTime(100);
      if (transition === "pointer") overlay.dispatchEvent(new PointerEvent("pointerenter"));
      else if (transition === "focus") body.focus();
      else tooltip.dispatchEvent(new PointerEvent("pointerleave", { relatedTarget: body }));
      vi.advanceTimersByTime(201);
      expect(tooltip.hidden).toBe(false);
      expect(vi.getTimerCount()).toBe(0);
      overlay.dispatchEvent(new PointerEvent("pointerleave"));
      vi.advanceTimersByTime(201);
      expect(tooltip.hidden).toBe(true);
    } finally { current.dispose(); vi.useRealTimers(); }
  });

  it.each(["canvas", "overlay"] as const)("dismisses details before %s keyboard activation", (target) => {
    const current = fixture(1, { width: 140, height: 240 });
    const canvas = current.surface.querySelector<HTMLCanvasElement>("canvas")!;
    const body = current.surface.querySelector<HTMLButtonElement>(".folder-nodes-node-graph-focus-overlay-body")!;
    const tooltip = current.surface.querySelector<HTMLElement>(".folder-nodes-node-graph-canvas-tooltip")!;
    Object.defineProperties(tooltip, { scrollHeight: { value: 1_200 }, clientHeight: { value: 224 } });
    vi.spyOn(tooltip, "getBoundingClientRect").mockImplementation(() => ({
      width: 124, height: Math.min(224, Number.parseFloat(tooltip.style.maxHeight) || 224),
    }) as DOMRect);
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      current.renderer.setFocus("N0", false);
      current.flush();
      current.callbacks.onOpen.mockImplementation(() => {
        expect(tooltip.hidden).toBe(true);
        expect(vi.getTimerCount()).toBe(0);
      });
      for (const [key, ctrlKey, metaKey] of [["Enter", false, false], [" ", false, false], ["Spacebar", false, false], ["Enter", true, false], ["Enter", false, true]] as const) {
        const move = new PointerEvent("pointermove", { pointerType: "mouse" });
        Object.defineProperties(move, { offsetX: { value: 45 }, offsetY: { value: 23 } });
        canvas.dispatchEvent(move);
        current.flush();
        tooltip.dispatchEvent(new PointerEvent("pointerleave"));
        expect(tooltip.hidden).toBe(false);
        const event = new KeyboardEvent("keydown", { key, ctrlKey, metaKey, cancelable: true });
        (target === "canvas" ? canvas : body).dispatchEvent(event);
        expect(event.defaultPrevented).toBe(true);
        expect(current.callbacks.onOpen).toHaveBeenLastCalledWith("N0", ctrlKey || metaKey);
        vi.advanceTimersByTime(201);
        expect(tooltip.hidden).toBe(true);
      }
      expect(current.callbacks.onOpen).toHaveBeenCalledTimes(5);
    } finally { current.dispose(); vi.useRealTimers(); }
  });

  it("cancels the bridge in its owning window and rejects a retained callback after destruction", () => {
    const current = fixture(1, { width: 140, height: 240 });
    const canvas = current.surface.querySelector<HTMLCanvasElement>("canvas")!;
    const tooltip = current.surface.querySelector<HTMLElement>(".folder-nodes-node-graph-canvas-tooltip")!;
    const ownerWindow = current.surface.ownerDocument.defaultView!;
    Object.defineProperties(tooltip, { scrollHeight: { value: 1_200 }, clientHeight: { value: 224 } });
    vi.spyOn(tooltip, "getBoundingClientRect").mockImplementation(() => ({
      width: 124, height: Math.min(224, Number.parseFloat(tooltip.style.maxHeight) || 224),
    }) as DOMRect);
    let callback!: () => void;
    const schedule = vi.spyOn(ownerWindow, "setTimeout").mockImplementation((handler) => {
      callback = handler as () => void;
      return 913 as unknown as ReturnType<typeof ownerWindow.setTimeout>;
    });
    const clear = vi.spyOn(ownerWindow, "clearTimeout").mockImplementation(() => undefined);
    const foreign = { setTimeout: vi.fn(), clearTimeout: vi.fn() };
    try {
      vi.stubGlobal("window", foreign);
      current.flush();
      const event = new PointerEvent("pointermove", { pointerType: "mouse" });
      Object.defineProperties(event, { offsetX: { value: 45 }, offsetY: { value: 23 } });
      canvas.dispatchEvent(event);
      canvas.dispatchEvent(new PointerEvent("pointerleave"));
      expect(schedule).toHaveBeenCalledWith(expect.any(Function), 200);
      current.renderer.destroy();
      expect(clear).toHaveBeenCalledWith(913);
      const hidden = vi.spyOn(tooltip, "hidden", "set");
      callback();
      expect(hidden).not.toHaveBeenCalled();
      expect(current.frames.size).toBe(0);
      expect(foreign.setTimeout).not.toHaveBeenCalled();
      expect(foreign.clearTimeout).not.toHaveBeenCalled();
    } finally { vi.unstubAllGlobals(); schedule.mockRestore(); clear.mockRestore(); current.dispose(); }
  });

  it("keeps overflow details enterable, focusable and dismissible, and clears hover on resize", () => {
    const path = `${"中文العربية/".repeat(100)}note`;
    const current = fixture(1, { width: 140, height: 240, path });
    const canvas = current.surface.querySelector<HTMLCanvasElement>("canvas")!;
    const tooltip = current.surface.querySelector<HTMLElement>(".folder-nodes-node-graph-canvas-tooltip")!;
    Object.defineProperties(tooltip, { scrollHeight: { value: 1_200 }, clientHeight: { value: 224 } });
    vi.spyOn(tooltip, "getBoundingClientRect").mockImplementation(() => ({
      width: 124, height: Math.min(224, Number.parseFloat(tooltip.style.maxHeight) || 224),
    }) as DOMRect);
    const show = (): void => {
      const move = new PointerEvent("pointermove", { pointerType: "mouse" });
      Object.defineProperties(move, { offsetX: { value: 45 }, offsetY: { value: 23 } });
      canvas.dispatchEvent(move);
    };
    try {
      current.flush();
      show();
      expect(tooltip.hidden).toBe(false);
      expect(tooltip.textContent).toContain(path);
      expect(tooltip.classList.contains("is-scrollable")).toBe(true);
      expect(tooltip.tabIndex).toBe(0);
      canvas.dispatchEvent(new PointerEvent("pointerleave", { relatedTarget: tooltip }));
      expect(tooltip.hidden).toBe(false);
      tooltip.focus();
      expect(document.activeElement).toBe(tooltip);
      tooltip.dispatchEvent(new PointerEvent("pointerleave"));
      expect(tooltip.hidden).toBe(false);
      tooltip.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      expect(tooltip.hidden).toBe(true);
      expect(document.activeElement).toBe(canvas);
      show();
      expect(tooltip.hidden).toBe(false);
      Object.defineProperty(current.surface, "clientHeight", { value: 140 });
      current.renderer.resize();
      expect(tooltip.hidden).toBe(true);
      // The same node can produce a fresh hint after resize, instead of reusing
      // a stale hoveredPath/position from the old viewport.
      current.flush();
      show();
      expect(tooltip.hidden).toBe(false);
    } finally { current.dispose(); }
  });

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
