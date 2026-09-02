import { describe, expect, it } from "vitest";

import {
  isWithin,
  nodeGraphParentPath,
  nodeGraphPathDepth,
  nodeGraphTraversalRoots,
  normalizeNodeGraphScope,
} from "../../src/core/node-graph-scope";

describe("Node Graph runtime scopes", () => {
  it("uses exactly one traversal root without persistent include or exclusion rules", () => {
    expect(nodeGraphTraversalRoots({ mode: "global" })).toEqual([""]);
    expect(nodeGraphTraversalRoots({ mode: "subtree", rootPath: "/Work/Project/" })).toEqual(["Work/Project"]);
    expect(nodeGraphTraversalRoots({ mode: "local", rootPath: "Work" })).toEqual(["Work"]);
  });

  it("normalizes persisted view state and exposes path relationships", () => {
    expect(normalizeNodeGraphScope({ mode: "subtree", rootPath: "/Work/Project/" })).toEqual({ mode: "subtree", rootPath: "Work/Project" });
    expect(normalizeNodeGraphScope({ mode: "local", rootPath: "/" })).toEqual({ mode: "local", rootPath: "" });
    expect(normalizeNodeGraphScope({ mode: "broken", rootPath: "Work" })).toEqual({ mode: "global" });
    expect(isWithin("Archive/Project/Private", "Archive/Project")).toBe(true);
    expect(isWithin("Archive", "Archive/Project")).toBe(false);
    expect(nodeGraphParentPath("Archive/Project/Private")).toBe("Archive/Project");
    expect(nodeGraphPathDepth("Archive/Project/Private")).toBe(3);
  });
});
