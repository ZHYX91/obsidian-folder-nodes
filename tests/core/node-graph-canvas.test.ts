import { describe, expect, it } from "vitest";

import {
  fitNodeGraphCanvasCamera,
  hitTestNodeGraphCanvas,
  panNodeGraphCanvasCamera,
  pointIsVisible,
  shouldUseNodeGraphCanvas,
  zoomNodeGraphCanvasCamera,
} from "../../src/core/node-graph-canvas";

describe("Node Graph canvas math", () => {
  it("uses a stable adaptive boundary", () => {
    expect(shouldUseNodeGraphCanvas(500)).toBe(false);
    expect(shouldUseNodeGraphCanvas(501)).toBe(true);
    expect(shouldUseNodeGraphCanvas(11, 10)).toBe(true);
  });

  it("fits, pans, and zooms around the pointer without losing the anchored world point", () => {
    const fitted = fitNodeGraphCanvasCamera({ width: 4_000_000, height: 2_000 }, { width: 1_000, height: 600 });
    expect(fitted.zoom).toBeGreaterThan(0);
    expect(fitted.zoom).toBeLessThan(0.001);
    const panned = panNodeGraphCanvasCamera(fitted, 12, -8);
    expect(panned).toMatchObject({ panX: fitted.panX + 12, panY: fitted.panY - 8 });

    const anchor = { x: 320, y: 240 };
    const worldBefore = {
      x: (anchor.x - panned.panX) / panned.zoom,
      y: (anchor.y - panned.panY) / panned.zoom,
    };
    const zoomed = zoomNodeGraphCanvasCamera(panned, -400, anchor.x, anchor.y);
    expect((anchor.x - zoomed.panX) / zoomed.zoom).toBeCloseTo(worldBefore.x, 6);
    expect((anchor.y - zoomed.panY) / zoomed.zoom).toBeCloseTo(worldBefore.y, 6);
  });

  it("culls and hit-tests projected nodes deterministically", () => {
    const points = [
      { id: "A", x: 50, y: 50, scale: 1 },
      { id: "B", x: 500, y: 500, scale: 1 },
    ];
    expect(pointIsVisible(points[0]!, { width: 100, height: 100 }, 20, 10)).toBe(true);
    expect(pointIsVisible(points[1]!, { width: 100, height: 100 }, 20, 10)).toBe(false);
    expect(hitTestNodeGraphCanvas(points, 52, 48, 20, 10)).toBe("A");
    expect(hitTestNodeGraphCanvas(points, 200, 200, 20, 10)).toBeNull();
  });
});
