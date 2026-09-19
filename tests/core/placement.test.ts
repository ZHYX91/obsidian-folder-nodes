import { describe, expect, it } from "vitest";
import { gapAfter, gapBefore, insertionIndex, insertionMarker } from "../../src/core/placement";

describe("node placement gaps", () => {
  const siblings = ["P/A", "P/B", "P/C"];

  it("normalizes A-after and B-before to the same logical gap and marker", () => {
    const afterA = gapAfter(siblings, "P/A", "P");
    const beforeB = gapBefore(siblings, "P/B", "P");
    expect(afterA).toEqual(beforeB);
    expect(insertionMarker(afterA)).toEqual({ path: "P/B", edge: "before" });
    expect(insertionMarker(beforeB)).toEqual({ path: "P/B", edge: "before" });
  });

  it("validates adjacency instead of accepting stale anchors", () => {
    expect(insertionIndex(siblings, { parentPath: "P", previousSiblingPath: "P/A", nextSiblingPath: "P/B" })).toBe(1);
    expect(insertionIndex(siblings, { parentPath: "P", previousSiblingPath: "P/A", nextSiblingPath: "P/C" })).toBeNull();
    expect(insertionIndex(siblings, { parentPath: "P", previousSiblingPath: null, nextSiblingPath: "P/A" })).toBe(0);
    expect(insertionIndex(siblings, { parentPath: "P", previousSiblingPath: "P/C", nextSiblingPath: null })).toBe(3);
  });
});
