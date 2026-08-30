import { describe, expect, it } from "vitest";

import {
  nodeGraphBoxContains,
  nodeGraphBoxFromCenter,
  nodeGraphBoxFromTopLeft,
  nodeGraphLinkGeometry,
  nodeGraphStructureGeometry,
} from "../../src/core/node-graph-geometry";

describe("shared Node Graph scene geometry", () => {
  const source = nodeGraphBoxFromTopLeft(10, 20, 180, 46);
  const target = nodeGraphBoxFromTopLeft(262, 80, 180, 46);

  it("connects right-to-left structure handles in LTR and rotates them for TTB", () => {
    const leftToRight = nodeGraphStructureGeometry(source, target, "left-to-right");
    expect(leftToRight).toMatchObject({
      source: { x: 190, y: 43 },
      target: { x: 262, y: 103 },
    });
    expect(leftToRight.control1.x).toBe(leftToRight.control2.x);

    const topToBottom = nodeGraphStructureGeometry(source, target, "top-to-bottom");
    expect(topToBottom).toMatchObject({
      source: { x: 100, y: 66 },
      target: { x: 352, y: 80 },
    });
    expect(topToBottom.control1.y).toBe(topToBottom.control2.y);
  });

  it("clips links to card edges and offsets them independently from structure edges", () => {
    const horizontalTarget = nodeGraphBoxFromTopLeft(262, 20, 180, 46);
    const direct = nodeGraphLinkGeometry(source, horizontalTarget);
    expect(direct.source).toEqual({ x: 190, y: 43 });
    expect(direct.target).toEqual({ x: 262, y: 43 });
    const offset = nodeGraphLinkGeometry(source, horizontalTarget, 4);
    expect(offset.source).toEqual({ x: 190, y: 47 });
    expect(offset.target).toEqual({ x: 262, y: 47 });
    expect(offset.control.y).toBeGreaterThan(47);
  });

  it("uses the same centered presentation box for dot and card hit testing", () => {
    const dot = nodeGraphBoxFromCenter(50, 50, 4, 4);
    const card = nodeGraphBoxFromCenter(50, 50, 90, 23);
    expect(nodeGraphBoxContains(dot, { x: 54, y: 50 })).toBe(true);
    expect(nodeGraphBoxContains(dot, { x: 55, y: 50 })).toBe(false);
    expect(nodeGraphBoxContains(card, { x: 120, y: 60 })).toBe(true);
  });
});
