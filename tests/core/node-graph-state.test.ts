import { describe, expect, it } from "vitest";

import {
  captureNodeGraphSearchSnapshot,
  createNodeGraphExpansionSession,
  expandNodeGraphAncestors,
  nodeGraphDefaultExpansion,
  nodeGraphExpansionForScope,
  nodeGraphScopeKey,
  nodeGraphShowLinksFromPersistedState,
  restoreNodeGraphSearchSnapshot,
  setNodeGraphRangeDepth,
  toggleNodeGraphBranch,
  toggleNodeGraphNode,
  withNodeGraphExpansion,
} from "../../src/core/node-graph-state";
import { createNodeGraphTopology } from "../../src/core/node-graph-topology";
import { buildNodeGraphVisibleScene, estimateNodeGraphRangeNodeCount } from "../../src/core/node-graph-visible";

const topology = createNodeGraphTopology(
  [
    { id: "", parentId: null },
    { id: "Work", parentId: "" },
    { id: "Personal", parentId: "" },
    { id: "Work/A", parentId: "Work" },
    { id: "Work/B", parentId: "Work" },
    { id: "Work/A/One", parentId: "Work/A" },
    { id: "Work/A/Two", parentId: "Work/A" },
    { id: "Work/A/One/Deep", parentId: "Work/A/One" },
    { id: "Personal/Home", parentId: "Personal" },
  ],
  new Map([
    ["Work/A", new Set(["Personal/Home"])],
    ["Work/A/One", new Set(["Work/B"])],
  ]),
);

describe("Node Graph progressive state", () => {
  it("starts every scope at the frozen one-level default", () => {
    const global = buildNodeGraphVisibleScene(topology, { mode: "global" }, nodeGraphDefaultExpansion(topology, { mode: "global" }));
    expect(global.nodes.map(({ id }) => id)).toEqual(["", "Work", "Personal"]);

    const subtreeScope = { mode: "subtree", rootPath: "Work" } as const;
    const subtree = buildNodeGraphVisibleScene(topology, subtreeScope, nodeGraphDefaultExpansion(topology, subtreeScope));
    expect(subtree.nodes.map(({ id }) => id)).toEqual(["Work", "Work/A", "Work/B"]);

    const localScope = { mode: "local", rootPath: "Work/A" } as const;
    const local = buildNodeGraphVisibleScene(topology, localScope, nodeGraphDefaultExpansion(topology, localScope));
    expect(local.nodes.map(({ id }) => id)).toEqual(["Work", "Work/A", "Work/A/One", "Work/A/Two"]);
    expect(local.structureEdges).toEqual([
      { source: "Work", target: "Work/A" },
      { source: "Work/A", target: "Work/A/One" },
      { source: "Work/A", target: "Work/A/Two" },
    ]);
  });

  it("keeps multiple independently expanded branches and supports Alt whole-branch toggles", () => {
    const scope = { mode: "global" } as const;
    let expansion = nodeGraphDefaultExpansion(topology, scope);
    expansion = toggleNodeGraphNode(topology, expansion, "Work");
    expansion = toggleNodeGraphNode(topology, expansion, "Personal");
    expect(buildNodeGraphVisibleScene(topology, scope, expansion).nodes.map(({ id }) => id)).toEqual([
      "", "Work", "Personal", "Work/A", "Work/B", "Personal/Home",
    ]);

    expansion = toggleNodeGraphBranch(topology, expansion, "Work/A");
    expect(expansion.expandedIds).toEqual(new Set(["", "Work", "Personal", "Work/A", "Work/A/One"]));
    expect(buildNodeGraphVisibleScene(topology, scope, expansion).nodeIds.has("Work/A/One/Deep")).toBe(true);

    expansion = toggleNodeGraphBranch(topology, expansion, "Work/A");
    expect(expansion.expandedIds).toEqual(new Set(["", "Work", "Personal"]));
  });

  it("sets exact 1/2/3/all ranges from the scope anchor and collapses to level one", () => {
    const scope = { mode: "local", rootPath: "Work/A" } as const;
    expect(buildNodeGraphVisibleScene(topology, scope, setNodeGraphRangeDepth(topology, scope, 1)).nodes.map(({ id }) => id)).toEqual([
      "Work", "Work/A", "Work/A/One", "Work/A/Two",
    ]);
    expect(buildNodeGraphVisibleScene(topology, scope, setNodeGraphRangeDepth(topology, scope, 2)).nodes.map(({ id }) => id)).toEqual([
      "Work", "Work/A", "Work/A/One", "Work/A/Two", "Work/A/One/Deep",
    ]);
    expect(setNodeGraphRangeDepth(topology, scope, 3)).toEqual(setNodeGraphRangeDepth(topology, scope, "all"));
    expect(setNodeGraphRangeDepth(topology, scope, "collapse")).toEqual(setNodeGraphRangeDepth(topology, scope, 1));
    expect(estimateNodeGraphRangeNodeCount(topology, scope, "all")).toBe(5);
    expect(estimateNodeGraphRangeNodeCount(topology, scope, "all", true)).toBe(7);
  });

  it("adds direct link neighbors only in Local while other scopes keep links inside the visible structure", () => {
    const scope = { mode: "local", rootPath: "Work/A" } as const;
    const expansion = nodeGraphDefaultExpansion(topology, scope);
    const withoutLinks = buildNodeGraphVisibleScene(topology, scope, expansion);
    const withLinks = buildNodeGraphVisibleScene(topology, scope, expansion, { showLinks: true });
    expect(withoutLinks.nodeIds).toEqual(new Set(["Work", "Work/A", "Work/A/One", "Work/A/Two"]));
    expect(withLinks.linkedNeighborIds).toEqual(new Set(["Personal/Home", "Work/B"]));
    expect(withLinks.nodeIds.has("Personal")).toBe(false);
    expect(withLinks.linkEdges).toEqual([
      { source: "Personal/Home", target: "Work/A" },
      { source: "Work/A/One", target: "Work/B" },
    ]);
    expect(withLinks.structureEdges).toEqual([
      { source: "Work", target: "Work/A" },
      { source: "Work/A", target: "Work/A/One" },
      { source: "Work/A", target: "Work/A/Two" },
    ]);

    for (const structuralScope of [
      { mode: "global" } as const,
      { mode: "subtree", rootPath: "Work/A" } as const,
    ]) {
      const structuralExpansion = nodeGraphDefaultExpansion(topology, structuralScope);
      const structuralScene = buildNodeGraphVisibleScene(topology, structuralScope, structuralExpansion, { showLinks: true });
      expect(structuralScene.linkedNeighborIds).toEqual(new Set());
      expect(structuralScene.nodeIds).toEqual(
        buildNodeGraphVisibleScene(topology, structuralScope, structuralExpansion).nodeIds,
      );
    }
  });

  it("captures search state once, reveals ancestor chains, and restores only in the same scope", () => {
    const scope = { mode: "global" } as const;
    const initial = nodeGraphDefaultExpansion(topology, scope);
    const snapshot = captureNodeGraphSearchSnapshot(scope, initial, "Personal", { panX: 2, panY: 3 });
    const searching = expandNodeGraphAncestors(topology, scope, initial, ["Work/A/One/Deep"]);
    expect(searching.expandedIds).toEqual(new Set(["", "Work", "Work/A", "Work/A/One"]));
    expect(buildNodeGraphVisibleScene(topology, scope, searching).nodeIds.has("Work/A/One/Deep")).toBe(true);
    expect(restoreNodeGraphSearchSnapshot(snapshot, scope)).toEqual({
      camera: { panX: 2, panY: 3 },
      expansion: initial,
      focusId: "Personal",
    });
    expect(restoreNodeGraphSearchSnapshot(snapshot, { mode: "subtree", rootPath: "Work" })).toBeNull();
  });

  it("keeps expansion session state separate per scope and never serializes it into view state", () => {
    const global = { mode: "global" } as const;
    const subtree = { mode: "subtree", rootPath: "Work" } as const;
    let session = createNodeGraphExpansionSession();
    const globalExpansion = toggleNodeGraphNode(topology, nodeGraphExpansionForScope(session, topology, global), "Work");
    session = withNodeGraphExpansion(session, global, globalExpansion);
    expect(nodeGraphExpansionForScope(session, topology, global).expandedIds.has("Work")).toBe(true);
    expect(nodeGraphExpansionForScope(session, topology, subtree)).toEqual(nodeGraphDefaultExpansion(topology, subtree));
    expect(nodeGraphScopeKey(subtree)).toBe("subtree:Work");
    expect(Object.keys(session)).toEqual(["scopes"]);
  });

  it("opens a leaf anchor by default when its first child appears after a topology revision", () => {
    const scope = { mode: "global" } as const;
    const leaf = createNodeGraphTopology([{ id: "", parentId: null }]);
    const withFirstChild = createNodeGraphTopology([
      { id: "", parentId: null },
      { id: "First", parentId: "" },
    ]);
    let session = createNodeGraphExpansionSession();
    const initial = nodeGraphExpansionForScope(session, leaf, scope);
    expect(initial.expandedIds).toEqual(new Set());
    session = withNodeGraphExpansion(session, scope, initial);

    const refreshed = nodeGraphExpansionForScope(session, withFirstChild, scope);
    expect(refreshed.expandedIds).toEqual(new Set([""]));
    expect(buildNodeGraphVisibleScene(withFirstChild, scope, refreshed).nodes.map(({ id }) => id)).toEqual([
      "", "First",
    ]);
  });

  it("keeps an explicitly collapsed anchor closed across topology revisions", () => {
    const scope = { mode: "global" } as const;
    const initialTopology = createNodeGraphTopology([
      { id: "", parentId: null },
      { id: "First", parentId: "" },
    ]);
    const revisedTopology = createNodeGraphTopology([
      { id: "", parentId: null },
      { id: "First", parentId: "" },
      { id: "Second", parentId: "" },
    ]);
    let session = createNodeGraphExpansionSession();
    const defaultExpansion = nodeGraphExpansionForScope(session, initialTopology, scope);
    const collapsed = toggleNodeGraphNode(initialTopology, defaultExpansion, "");
    expect(collapsed.expandedIds).toEqual(new Set());
    expect(collapsed.collapsedIds).toEqual(new Set([""]));
    session = withNodeGraphExpansion(session, scope, collapsed);

    const refreshed = nodeGraphExpansionForScope(session, revisedTopology, scope);
    expect(refreshed.expandedIds).toEqual(new Set());
    expect(refreshed.collapsedIds).toEqual(new Set([""]));
    expect(buildNodeGraphVisibleScene(revisedTopology, scope, refreshed).nodes.map(({ id }) => id)).toEqual([""]);
  });

  it("keeps explicit expansion provenance while a node temporarily becomes a leaf", () => {
    const scope = { mode: "global" } as const;
    const withChild = createNodeGraphTopology([
      { id: "", parentId: null },
      { id: "Work", parentId: "" },
      { id: "Work/Child", parentId: "Work" },
    ]);
    const withoutChild = createNodeGraphTopology([
      { id: "", parentId: null },
      { id: "Work", parentId: "" },
    ]);
    let session = createNodeGraphExpansionSession();
    const expanded = toggleNodeGraphNode(
      withChild,
      nodeGraphExpansionForScope(session, withChild, scope),
      "Work",
    );
    session = withNodeGraphExpansion(session, scope, expanded);
    const temporaryLeaf = nodeGraphExpansionForScope(session, withoutChild, scope);
    expect(temporaryLeaf.expandedIds).toEqual(new Set(["", "Work"]));
    session = withNodeGraphExpansion(session, scope, temporaryLeaf);

    const restored = nodeGraphExpansionForScope(session, withChild, scope);
    expect(restored.expandedIds).toEqual(new Set(["", "Work"]));
    expect(buildNodeGraphVisibleScene(withChild, scope, restored).nodes.map(({ id }) => id)).toEqual([
      "", "Work", "Work/Child",
    ]);
  });

  it("migrates only persisted workspace relation state and lets explicit showLinks win", () => {
    expect(nodeGraphShowLinksFromPersistedState({ relationMode: "structure" }, true)).toBe(false);
    expect(nodeGraphShowLinksFromPersistedState({ relationMode: "links" })).toBe(true);
    expect(nodeGraphShowLinksFromPersistedState({ relationMode: "hybrid" })).toBe(true);
    expect(nodeGraphShowLinksFromPersistedState({ showLinks: false, relationMode: "hybrid" }, true)).toBe(false);
    expect(nodeGraphShowLinksFromPersistedState({ defaultRelationMode: "links" })).toBe(false);
  });

  it("builds and filters a 20k-node progressive scene iteratively without rescanning its source", () => {
    const records = Array.from({ length: 20_000 }, (_, index) => ({
      id: `node-${index}`,
      parentId: index === 0 ? null : `node-${index - 1}`,
    }));
    const large = createNodeGraphTopology(records);
    const scope = { mode: "global" } as const;
    const expansion = setNodeGraphRangeDepth(large, scope, "all");
    expect(buildNodeGraphVisibleScene(large, scope, expansion).nodes).toHaveLength(20_000);
    expect(buildNodeGraphVisibleScene(large, scope, expansion).nodes).toHaveLength(20_000);
    expect(large.stats).toEqual({ scannedLinkTargets: 0, scannedNodes: 20_000 });
  });
});
