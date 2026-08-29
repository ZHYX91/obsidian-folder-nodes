import { describe, expect, it } from "vitest";

import { normalizeNodeGraphLinks } from "../../src/core/node-graph-links";

describe("Node Graph link normalization", () => {
  it("keeps only resolved canonical Node Note targets and collapses repeated link counts", () => {
    const sources = [
      { nodeId: "A", notePath: "A/A.md" },
      { nodeId: "B", notePath: "B/B.md" },
    ];
    const noteToNode = new Map([
      ["A/A.md", "A"],
      ["B/B.md", "B"],
    ]);
    const links = normalizeNodeGraphLinks(sources, {
      "A/A.md": {
        "A/A.md": 1,
        "B/B.md": 4,
        "Loose.md": 2,
      },
      "B/B.md": {},
    }, noteToNode);
    expect([...links.entries()].map(([source, targets]) => [source, [...targets]])).toEqual([
      ["A", ["B"]],
    ]);
  });

  it("ignores unresolved sources because they are absent from Metadata Cache resolvedLinks", () => {
    const links = normalizeNodeGraphLinks(
      [{ nodeId: "A", notePath: "A/A.md" }],
      {},
      new Map([["A/A.md", "A"]]),
    );
    expect(links.size).toBe(0);
  });
});
