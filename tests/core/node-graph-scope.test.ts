import { describe, expect, it } from "vitest";

import {
  isWithin,
  nodeGraphPathIsConfigured,
  nodeGraphTraversalRoots,
  normalizeNodeGraphScope,
  remapNodeGraphSettingPaths,
} from "../../src/core/node-graph-scope";
import { DEFAULT_NODE_GRAPH_SETTINGS } from "../../src/shared/settings";

function settings() { return structuredClone(DEFAULT_NODE_GRAPH_SETTINGS); }

describe("Node Graph scope rules", () => {
  it("applies include rules before exact and subtree exclusions", () => {
    const value = settings();
    value.includedSubtrees = ["Work"];
    value.excludedNodes = ["Work/Private"];
    value.excludedSubtrees = ["Work/Archive"];
    expect(nodeGraphPathIsConfigured("Work/Project", value)).toBe(true);
    expect(nodeGraphPathIsConfigured("Work/Private", value)).toBe(false);
    expect(nodeGraphPathIsConfigured("Work/Private/Child", value)).toBe(true);
    expect(nodeGraphPathIsConfigured("Work/Archive/2025", value)).toBe(false);
    expect(nodeGraphPathIsConfigured("Personal", value)).toBe(false);
  });

  it("intersects configured roots with a subtree view and removes nested duplicates", () => {
    const value = settings();
    value.includedSubtrees = ["Work", "Work/Project", "Personal"];
    expect(nodeGraphTraversalRoots({ mode: "global" }, value)).toEqual(["Personal", "Work"]);
    expect(nodeGraphTraversalRoots({ mode: "subtree", rootPath: "Work/Project" }, value)).toEqual(["Work/Project"]);
    expect(nodeGraphTraversalRoots({ mode: "subtree", rootPath: "Missing" }, value)).toEqual([]);
  });

  it("normalizes persisted view state and remaps paths after folder moves", () => {
    expect(normalizeNodeGraphScope({ mode: "subtree", rootPath: "/Work/Project/" })).toEqual({ mode: "subtree", rootPath: "Work/Project" });
    expect(normalizeNodeGraphScope({ mode: "local", rootPath: "/" })).toEqual({ mode: "local", rootPath: "" });
    expect(normalizeNodeGraphScope({ mode: "broken", rootPath: "Work" })).toEqual({ mode: "global" });
    const value = settings();
    value.includedSubtrees = ["Work/Project"];
    value.excludedNodes = ["Work/Project/Private"];
    expect(remapNodeGraphSettingPaths(value, "Work/Project", "Archive/Project", true)).toBe(true);
    expect(value.includedSubtrees).toEqual(["Archive/Project"]);
    expect(value.excludedNodes).toEqual(["Archive/Project/Private"]);
    expect(isWithin("Archive/Project/Private", "Archive/Project")).toBe(true);
  });

  it("deduplicates rules that converge after a folder move", () => {
    const value = settings();
    value.excludedNodes = ["Work/Old", "Work/New"];
    expect(remapNodeGraphSettingPaths(value, "Work/Old", "Work/New", true)).toBe(true);
    expect(value.excludedNodes).toEqual(["Work/New"]);
  });
});
