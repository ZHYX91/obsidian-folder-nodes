import { describe, expect, it } from "vitest";
import { graphKeyboardTarget } from "../../src/core/node-graph-keyboard";

describe("spatial graph keyboard navigation", () => {
  const points = [
    { id: "parent", x: 0, y: 0 }, { id: "node", x: 100, y: 0 },
    { id: "child", x: 200, y: 0 }, { id: "sibling-above", x: 100, y: -80 },
    { id: "sibling-below", x: 100, y: 80 },
  ];
  const order = points.map(({ id }) => id);
  it.each([["ArrowLeft", "parent"], ["ArrowRight", "child"], ["ArrowUp", "sibling-above"], ["ArrowDown", "sibling-below"]])(
    "follows %s toward %s", (key, target) => expect(graphKeyboardTarget(key, "node", order, points)).toBe(target),
  );
  it("uses vertical hierarchy coordinates and does not wrap at the graph edge", () => {
    const vertical = points.map(({ id, x, y }) => ({ id, x: y, y: x }));
    expect(graphKeyboardTarget("ArrowDown", "node", order, vertical)).toBe("child");
    expect(graphKeyboardTarget("ArrowUp", "node", order, vertical)).toBe("parent");
    expect(graphKeyboardTarget("ArrowUp", "parent", order, vertical)).toBe("parent");
  });
  it("retains deterministic initial, Home, End and empty-model behavior", () => {
    expect(graphKeyboardTarget("ArrowRight", null, order, points)).toBe("parent");
    expect(graphKeyboardTarget("Home", "child", order, points)).toBe("parent");
    expect(graphKeyboardTarget("End", null, order, points)).toBe("sibling-below");
    expect(graphKeyboardTarget("Home", null, [], [])).toBeNull();
    expect(graphKeyboardTarget("ArrowDown", "node", order, [])).toBe("node");
  });
});
