import { describe, expect, it } from "vitest";

import {
  fitNodeGraphCardLabel,
  nodeGraphCardWidthForLabels,
  nodeGraphSiblingCardWidths,
} from "../../src/core/node-graph-card-width";

describe("Node Graph sibling card widths", () => {
  it("keeps siblings equal while allowing cousin groups and roots to size independently", () => {
    const widths = nodeGraphSiblingCardWidths([
      { id: "root", label: "Root", parentId: null },
      { id: "detached", label: "A detached root with a deliberately long title", parentId: null },
      { id: "A", label: "短", parentId: "root" },
      { id: "B", label: "这是一个较长标题", parentId: "root" },
      { id: "A/one", label: "One", parentId: "A" },
    ]);

    expect(widths.get("root")).toBe(144);
    expect(widths.get("detached")).toBe(220);
    expect(widths.get("A")).toBe(220);
    expect(widths.get("B")).toBe(220);
    expect(widths.get("A/one")).toBe(144);
  });

  it("snaps label demand to compact, regular, and wide stable sizes", () => {
    expect(nodeGraphCardWidthForLabels(["Short"])).toBe(144);
    expect(nodeGraphCardWidthForLabels(["中等长度标题"])).toBe(180);
    expect(nodeGraphCardWidthForLabels(["这是一个明显更长的节点标题"])).toBe(220);
    expect(nodeGraphCardWidthForLabels(["👨‍👩‍👧‍👦👨‍👩‍👧‍👦"])).toBe(144);
    expect(nodeGraphCardWidthForLabels(["éééé"])).toBe(144);
  });

  it("truncates Canvas labels without splitting grapheme clusters", () => {
    const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
    const measure = (text: string): number => Array.from(segmenter.segment(text)).length * 10;
    expect(fitNodeGraphCardLabel("ABCD", 35, measure)).toBe("AB…");
    expect(fitNodeGraphCardLabel("A👨‍👩‍👧‍👦B", 25, measure)).toBe("A…");
    expect(fitNodeGraphCardLabel("Short", 60, measure)).toBe("Short");
  });

  it("fails closed on duplicate visible card ids", () => {
    expect(() => nodeGraphSiblingCardWidths([
      { id: "A", label: "A", parentId: null },
      { id: "A", label: "Again", parentId: null },
    ])).toThrow("Duplicate Node Graph card id: A");
  });

  it("sizes a 100k sibling group without spreading call arguments", () => {
    expect(nodeGraphCardWidthForLabels(Array.from({ length: 100_000 }, () => "Node"))).toBe(144);
  });
});
