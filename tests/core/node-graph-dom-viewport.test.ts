import { describe, expect, it } from "vitest";
import { nodeGraphDomViewport } from "../../src/core/node-graph-dom-viewport";

describe("DOM viewport camera representation", () => {
  it.each([0.38, 1, 4, 8])("represents offscreen and centered cameras at zoom %s without browser clamping", (zoom) => {
    for (const pan of [-5000, -24, 0, 300, 5000]) {
      for (const size of [100, 8000]) {
        const camera = { zoom, panX: pan, panY: -pan };
        const placement = nodeGraphDomViewport(camera, { width: size, height: size }, { width: 800, height: 600 });
        expect(placement.scrollLeft).toBeGreaterThanOrEqual(0);
        expect(placement.scrollTop).toBeGreaterThanOrEqual(0);
        expect(placement.scrollLeft).toBeLessThanOrEqual(placement.width - 800);
        expect(placement.scrollTop).toBeLessThanOrEqual(placement.height - 600);
        expect(placement.left - placement.scrollLeft).toBe(pan);
        expect(placement.top - placement.scrollTop).toBeCloseTo(-pan, 8);
        expect(placement.width).toBeGreaterThanOrEqual(placement.left + size * zoom);
        expect(placement.height).toBeGreaterThanOrEqual(placement.top + size * zoom);
      }
    }
  });
});
