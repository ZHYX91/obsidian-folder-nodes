import { describe, expect, it } from "vitest";

import {
  fitNodeGraphCanvasCamera,
  hitTestNodeGraphCanvas,
  nodeGraphCanvasGeometry,
  panNodeGraphCanvasCamera,
  pointIsVisible,
  selectNodeGraphCanvasOverviewEdges,
  shouldUseNodeGraphCanvas,
  zoomNodeGraphCanvasCamera,
} from "../../src/core/node-graph-canvas";

describe("Node Graph canvas math", () => {
  it("uses a stable adaptive boundary", () => {
    expect(shouldUseNodeGraphCanvas(500)).toBe(false);
    expect(shouldUseNodeGraphCanvas(501)).toBe(true);
    expect(shouldUseNodeGraphCanvas(400, 500)).toBe(false);
    expect(shouldUseNodeGraphCanvas(400, 501)).toBe(true);
    expect(shouldUseNodeGraphCanvas(11, 0, 10)).toBe(true);
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
    expect(pointIsVisible(points[0]!, { width: 100, height: 100 })).toBe(true);
    expect(pointIsVisible(points[1]!, { width: 100, height: 100 })).toBe(false);
    expect(hitTestNodeGraphCanvas(points, 52, 48)).toBe("A");
    expect(hitTestNodeGraphCanvas(points, 200, 200)).toBeNull();
  });

  it("hit-tests the topmost drawn node when projections overlap", () => {
    const back = { id: "back", x: 100, y: 100, scale: 0.65 };
    const front = { id: "front", x: 101, y: 101, scale: 1.2 };
    expect(hitTestNodeGraphCanvas([back, front], 100, 100)).toBe("front");
  });

  it("uses the same low-detail geometry for drawing bounds, culling, and hit testing", () => {
    const far = { id: "far", x: -2, y: 50, scale: 0.01 };
    expect(nodeGraphCanvasGeometry(far.scale)).toMatchObject({ kind: "dot", label: false, radius: 4 });
    expect(pointIsVisible(far, { width: 100, height: 100 }, 0)).toBe(true);
    expect(hitTestNodeGraphCanvas([far], 1, 50)).toBe("far");
    expect(hitTestNodeGraphCanvas([far], 3, 50)).toBeNull();
  });

  it("selects a deterministic bounded overview from an edge-dense model", () => {
    const edges = Array.from({ length: 124_750 }, (_, index) => index);
    const overview = selectNodeGraphCanvasOverviewEdges(edges);
    expect(overview).toHaveLength(5_941);
    expect(overview[0]).toBe(0);
    expect(overview[1]).toBe(21);
    expect(overview.at(-1)).toBe(124_740);
    expect(selectNodeGraphCanvasOverviewEdges([1, 2, 3], 3)).toEqual([1, 2, 3]);
  });
});
