import { TFile, TFolder } from "obsidian";
import { describe, expect, it, vi } from "vitest";

import { NodeGraphIndex } from "../../src/app/node-graph-index";
import { layoutNodeGraph3D } from "../../src/core/node-graph-3d";
import { buildNodeGraphModelFromNodes } from "../../src/core/node-graph-model";
import { summarizeNodeGraphSearch } from "../../src/core/node-graph-search";
import { nodeGraphDefaultExpansion, setNodeGraphRangeDepth } from "../../src/core/node-graph-state";
import { createNodeGraphTopology } from "../../src/core/node-graph-topology";
import { buildNodeGraphVisibleScene } from "../../src/core/node-graph-visible";
import type { NodeGraphSettings, NodeVisual } from "../../src/core/types";
import { DEFAULT_NODE_GRAPH_SETTINGS } from "../../src/shared/settings";
import { FakeObsidian } from "../helpers/fake-obsidian";

const FALLBACK_VISUAL: NodeVisual = {
  accent: null,
  inheritedFrom: null,
  kind: "fallback",
  value: "folder",
};

describe("Node Graph index", () => {
  it("builds once and reuses the same catalog for scope, search, and expansion", () => {
    const fixture = graphIndexFixture();
    const first = fixture.index.snapshot(fixture.settings);
    expect([...first.records.keys()]).toEqual(["", "Work", "Work/One", "Personal"]);
    expect(first.records.get("")?.visual).toMatchObject({ kind: "fallback", value: "home" });
    expect(first.links.get("Work")).toEqual(new Set(["Personal"]));
    expect(fixture.references.targetsForSource).toHaveBeenCalledWith("Work/Work.md");
    expect(fixture.index.metrics()).toEqual({ fullScans: 1, partialScans: 0, visitedFolders: 4 });
    expect(fixture.visuals.resolve).toHaveBeenCalledTimes(4);

    const topology = createNodeGraphTopology(
      [...first.records.values()].map(({ parentPath, path }) => ({ id: path, parentId: parentPath })),
      first.links,
    );
    const global = { mode: "global" } as const;
    const defaultScene = buildNodeGraphVisibleScene(
      topology,
      global,
      nodeGraphDefaultExpansion(topology, global),
    );
    const expandedScene = buildNodeGraphVisibleScene(
      topology,
      global,
      setNodeGraphRangeDepth(topology, global, "all"),
    );
    expect(defaultScene.nodes.map(({ id }) => id)).toEqual(["", "Work", "Personal"]);
    expect(expandedScene.nodes).toHaveLength(4);
    expect(summarizeNodeGraphSearch([...first.records.values()], "one").first?.path).toBe("Work/One");

    const second = fixture.index.snapshot(fixture.settings);
    expect(second.revision).toBe(first.revision);
    expect(second.records).toBe(first.records);
    expect(second.links).toBe(first.links);
    expect(fixture.index.metrics()).toEqual({ fullScans: 1, partialScans: 0, visitedFolders: 4 });
    expect(fixture.visuals.resolve).toHaveBeenCalledTimes(4);
  });

  it("prunes hidden subtrees and restores them after a metadata invalidation", () => {
    const fixture = graphIndexFixture();
    const first = fixture.index.snapshot(fixture.settings);
    expect(first.records.has("Work/One")).toBe(true);
    fixture.fake.frontmatters.set("Work/Work.md", { folderNodeHidden: true });

    expect(fixture.index.invalidateRecordMetadata(new Set(["Work"]))).toBe(false);
    const hidden = fixture.index.snapshot(fixture.settings);
    expect([...hidden.records.keys()]).toEqual(["", "Personal"]);

    fixture.fake.frontmatters.set("Work/Work.md", {});
    expect(fixture.index.invalidateRecordMetadata(new Set(["Work"]))).toBe(false);
    const restored = fixture.index.snapshot(fixture.settings);
    expect(new Set(restored.records.keys())).toEqual(new Set(["", "Work", "Work/One", "Personal"]));
  });

  it("retains explicit and inherited hidden status only during session reveal", () => {
    const fixture = graphIndexFixture();
    fixture.fake.frontmatters.set("Work/Work.md", { folderNodeHidden: true });
    fixture.setRevealHidden(true);
    const revealed = fixture.index.snapshot(fixture.settings);

    expect(revealed.records.get("Work")).toMatchObject({ hiddenExplicit: true, hiddenSourcePath: "Work" });
    expect(revealed.records.get("Work/One")).toMatchObject({ hiddenExplicit: false, hiddenSourcePath: "Work" });
  });

  it("rescans only the affected folder for a canonical path invalidation", () => {
    const fixture = graphIndexFixture();
    const first = fixture.index.snapshot(fixture.settings);
    fixture.addNode("Work/Two");

    fixture.index.invalidatePaths(new Set(["/Work/Two/Two.md"]));
    const second = fixture.index.snapshot(fixture.settings);

    expect(second.records.get("Work/Two")).toMatchObject({
      label: "Two",
      notePath: "Work/Two/Two.md",
      parentPath: "Work",
    });
    expect(second.records).toBe(first.records);
    expect(second.revision).toBeGreaterThan(first.revision);
    expect(fixture.index.metrics()).toEqual({ fullScans: 1, partialScans: 1, visitedFolders: 5 });
    expect(fixture.visuals.resolve).toHaveBeenCalledTimes(5);
  });

  it("preserves configured sibling order across a partial invalidation", () => {
    const fixture = graphIndexFixture();
    fixture.addNode("Work/Two");
    const first = fixture.index.snapshot(fixture.settings);
    const before = createNodeGraphTopology(
      [...first.records.values()].map(({ parentPath, path }) => ({ id: path, parentId: parentPath })),
    );
    expect(before.nodes.get("Work")?.children).toEqual(["Work/One", "Work/Two"]);

    fixture.index.invalidatePaths(new Set(["Work/One/One.md"]));
    const second = fixture.index.snapshot(fixture.settings);
    const after = createNodeGraphTopology(
      [...second.records.values()].map(({ parentPath, path }) => ({ id: path, parentId: parentPath })),
    );
    expect(after.nodes.get("Work")?.children).toEqual(before.nodes.get("Work")?.children);
    expect(fixture.index.metrics()).toEqual({ fullScans: 1, partialScans: 1, visitedFolders: 6 });
  });

  it("keeps 3D coordinates identical to a full rebuild after partial subtree refresh", () => {
    const fixture = graphIndexFixture();
    fixture.addNode("Personal/Home");
    const first = fixture.index.snapshot(fixture.settings);
    fixture.index.invalidatePaths(new Set(["Work/One/One.md"]));
    const partial = fixture.index.snapshot(fixture.settings);
    const rebuilt = new NodeGraphIndex(
      fixture.fake.app,
      fixture.service,
      fixture.visuals,
      fixture.references,
    ).snapshot(fixture.settings);

    expect(graph3DPoints(partial)).toEqual(graph3DPoints(rebuilt));
    expect(graph3DPoints(partial)).toEqual(graph3DPoints(first));
  });

  it("refreshes multiple minimal dirty roots in one incremental batch", () => {
    const fixture = graphIndexFixture();
    const first = fixture.index.snapshot(fixture.settings);
    fixture.addNode("Work/Two");
    fixture.addNode("Work/Three");
    fixture.addNode("Personal/Home");
    fixture.children.mockClear();

    fixture.index.invalidatePaths(new Set([
      "Work/Two/Two.md",
      "Work/Three/Three.md",
      "Personal/Home/Home.md",
    ]));
    const second = fixture.index.snapshot(fixture.settings);

    expect(second.records).toBe(first.records);
    expect([...second.records.keys()]).toEqual([
      "", "Work", "Work/One", "Personal", "Work/Two", "Work/Three", "Personal/Home",
    ]);
    expect(fixture.children.mock.calls.filter(([path]) => path === "Work")).toHaveLength(2);
    expect(fixture.index.metrics()).toEqual({ fullScans: 1, partialScans: 1, visitedFolders: 7 });
  });

  it("matches a full rebuild when deleting a canonical note makes its subtree unreachable", () => {
    const fixture = graphIndexFixture();
    fixture.addNode("Work/One/Deep");
    const first = fixture.index.snapshot(fixture.settings);
    expect([...first.records.keys()]).toContain("Work/One/Deep");

    fixture.removeCanonical("Work/One");
    fixture.index.invalidatePaths(new Set(["Work/One/One.md"]));
    const partial = fixture.index.snapshot(fixture.settings);
    const rebuilt = new NodeGraphIndex(
      fixture.fake.app,
      fixture.service,
      fixture.visuals,
      fixture.references,
    ).snapshot(fixture.settings);

    expect([...partial.records.entries()]).toEqual([...rebuilt.records.entries()]);
    expect([...partial.links.entries()]).toEqual([...rebuilt.links.entries()]);
    expect(partial.records.has("Work/One")).toBe(false);
    expect(partial.records.has("Work/One/Deep")).toBe(false);
  });

  it("ignores ordinary Markdown metadata changes without scanning or revising the index", () => {
    const fixture = graphIndexFixture();
    const first = fixture.index.snapshot(fixture.settings);
    fixture.addOrdinary("Work/Notes.md");
    fixture.children.mockClear();
    fixture.visuals.resolve.mockClear();

    fixture.index.invalidatePaths(new Set(["Work/Notes.md"]));
    const second = fixture.index.snapshot(fixture.settings);

    expect(second.revision).toBe(first.revision);
    expect(second.records).toBe(first.records);
    expect(second.links).toBe(first.links);
    expect(fixture.children).not.toHaveBeenCalled();
    expect(fixture.visuals.resolve).not.toHaveBeenCalled();
    expect(fixture.index.metrics()).toEqual({ fullScans: 1, partialScans: 0, visitedFolders: 4 });
  });

  it("does not let stale included roots bypass managed canonical traversal", () => {
    const incomplete = graphIndexFixture();
    incomplete.removeCanonical("Work/One");
    const includedIncomplete = { ...incomplete.settings, includedSubtrees: ["Work/One"] };
    expect([...incomplete.index.snapshot(includedIncomplete).records.keys()]).toEqual([]);

    const unmanaged = graphIndexFixture();
    unmanaged.ignorePath("Work");
    const includedUnmanaged = { ...unmanaged.settings, includedSubtrees: ["Work/One"] };
    expect([...unmanaged.index.snapshot(includedUnmanaged).records.keys()]).toEqual([]);
  });

  it("keeps manual sibling order for multiple included roots across full and partial builds", () => {
    const fixture = graphIndexFixture();
    fixture.setChildOrder("", ["Work", "Personal"]);
    const settings = { ...fixture.settings, includedSubtrees: ["Personal", "Work"] };
    const directRoots = (records: ReadonlyMap<string, { parentPath: string | null; path: string }>): string[] =>
      [...records.values()].filter(({ parentPath }) => parentPath === "").map(({ path }) => path);
    const first = fixture.index.snapshot(settings);
    expect(directRoots(first.records)).toEqual(["Work", "Personal"]);

    fixture.index.invalidatePaths(new Set(["Work/Work.md"]));
    const partial = fixture.index.snapshot(settings);
    const rebuilt = new NodeGraphIndex(
      fixture.fake.app,
      fixture.service,
      fixture.visuals,
      fixture.references,
    ).snapshot(settings);

    expect(directRoots(partial.records)).toEqual(["Work", "Personal"]);
    expect([...partial.records.entries()]).toEqual([...rebuilt.records.entries()]);
  });

  it("keeps cross-parent included forest roots and 3D coordinates stable after partial refresh", () => {
    const fixture = graphIndexFixture();
    fixture.addNode("Personal/Home");
    const settings = { ...fixture.settings, includedSubtrees: ["Work/One", "Personal/Home"] };
    const first = fixture.index.snapshot(settings);
    expect([...first.records.keys()]).toEqual(["Work/One", "Personal/Home"]);

    fixture.index.invalidatePaths(new Set(["Personal/Home/Home.md"]));
    const partial = fixture.index.snapshot(settings);
    const rebuilt = new NodeGraphIndex(
      fixture.fake.app,
      fixture.service,
      fixture.visuals,
      fixture.references,
    ).snapshot(settings);

    expect([...partial.records.entries()]).toEqual([...rebuilt.records.entries()]);
    expect(graph3DPoints(partial)).toEqual(graph3DPoints(rebuilt));
  });

  it("places a genuinely new included forest root in full-build hierarchy order", () => {
    const fixture = graphIndexFixture();
    fixture.addNode("A");
    fixture.addNode("B");
    fixture.addNode("B/Child");
    const settings = { ...fixture.settings, includedSubtrees: ["A/New", "B/Child"] };
    const first = fixture.index.snapshot(settings);
    expect([...first.records.keys()]).toEqual(["B/Child"]);

    fixture.addNode("A/New");
    fixture.index.invalidatePaths(new Set(["A/New/New.md"]));
    const partial = fixture.index.snapshot(settings);
    const rebuilt = new NodeGraphIndex(
      fixture.fake.app,
      fixture.service,
      fixture.visuals,
      fixture.references,
    ).snapshot(settings);

    expect([...partial.records.keys()]).toEqual(["A/New", "B/Child"]);
    expect([...partial.records.entries()]).toEqual([...rebuilt.records.entries()]);
    expect(graph3DPoints(partial)).toEqual(graph3DPoints(rebuilt));
  });

  it("ignores invalidations disjoint from every included traversal root", () => {
    const fixture = graphIndexFixture();
    const settings = { ...fixture.settings, includedSubtrees: ["Work"] };
    const first = fixture.index.snapshot(settings);
    const metrics = fixture.index.metrics();
    fixture.children.mockClear();
    fixture.visuals.resolve.mockClear();

    fixture.index.invalidatePaths(new Set(["Personal/Personal.md"]));
    const second = fixture.index.snapshot(settings);

    expect(second.revision).toBe(first.revision);
    expect(second.records).toBe(first.records);
    expect(second.links).toBe(first.links);
    expect(fixture.index.metrics()).toEqual(metrics);
    expect(fixture.children).not.toHaveBeenCalled();
    expect(fixture.visuals.resolve).not.toHaveBeenCalled();
  });

  it("matches a full rebuild when excluded ancestor metadata reorders and restyles visible descendants", () => {
    const fixture = graphIndexFixture();
    fixture.addNode("Work/Two");
    const settings = { ...fixture.settings, excludedNodes: ["Work"] };
    const first = fixture.index.snapshot(settings);
    expect(first.records.has("Work")).toBe(false);
    fixture.setChildOrder("Work", ["Work/Two", "Work/One"]);
    fixture.visuals.resolve.mockImplementation((folder) => folder.path.startsWith("Work/")
      ? { accent: null, inheritedFrom: "Work", kind: "emoji", value: "🚀" }
      : FALLBACK_VISUAL);

    expect(fixture.index.invalidateRecordMetadata(new Set(["Work"]))).toBe(true);
    const partial = fixture.index.snapshot(settings);
    const rebuilt = new NodeGraphIndex(
      fixture.fake.app,
      fixture.service,
      fixture.visuals,
      fixture.references,
    ).snapshot(settings);
    const children = (snapshot: typeof partial): string[] => [...snapshot.records.values()]
      .filter(({ parentPath }) => parentPath === "Work")
      .map(({ path }) => path);

    expect(children(partial)).toEqual(["Work/Two", "Work/One"]);
    expect(partial.records.get("Work/One")?.visual).toMatchObject({ inheritedFrom: "Work", value: "🚀" });
    expect([...partial.records.entries()]).toEqual([...rebuilt.records.entries()]);
  });

  it("rebuilds links without walking folders or replacing records", () => {
    const fixture = graphIndexFixture();
    const first = fixture.index.snapshot(fixture.settings);
    expect(first.links.get("Work")).toEqual(new Set(["Personal"]));

    fixture.fake.app.metadataCache.resolvedLinks = {};
    fixture.index.invalidateLinks();
    const second = fixture.index.snapshot(fixture.settings);

    expect(second.records).toBe(first.records);
    expect(second.links.size).toBe(0);
    expect(second.revision).toBe(first.revision + 1);
    expect(fixture.index.metrics()).toEqual({ fullScans: 1, partialScans: 0, visitedFolders: 4 });
    expect(fixture.visuals.resolve).toHaveBeenCalledTimes(4);
  });

  it("distinguishes structural settings invalidation from render-only settings", () => {
    const fixture = graphIndexFixture();
    const first = fixture.index.snapshot(fixture.settings);
    const renderOnly = { ...fixture.settings, largeGraphThreshold: 900 };
    const unchanged = fixture.index.snapshot(renderOnly);
    expect(unchanged.revision).toBe(first.revision);
    expect(fixture.index.metrics().fullScans).toBe(1);

    const structural = { ...renderOnly, excludedSubtrees: ["Work"] };
    const rebuilt = fixture.index.snapshot(structural);
    expect([...rebuilt.records.keys()]).toEqual(["", "Personal"]);
    expect(fixture.index.metrics()).toEqual({ fullScans: 2, partialScans: 0, visitedFolders: 7 });
  });

  it("re-resolves cached visuals without traversing child collections", () => {
    const fixture = graphIndexFixture();
    const first = fixture.index.snapshot(fixture.settings);
    fixture.children.mockClear();
    fixture.visuals.resolve.mockClear();

    fixture.index.invalidateVisuals();
    const second = fixture.index.snapshot(fixture.settings);

    expect(second.revision).toBe(first.revision + 1);
    expect(fixture.children).not.toHaveBeenCalled();
    expect(fixture.visuals.resolve).toHaveBeenCalledTimes(4);
    expect(fixture.index.metrics()).toEqual({ fullScans: 1, partialScans: 0, visitedFolders: 4 });
  });
});

function graph3DPoints(snapshot: {
  readonly links: ReadonlyMap<string, ReadonlySet<string>>;
  readonly records: ReadonlyMap<string, { readonly parentPath: string | null; readonly path: string }>;
}): ReturnType<typeof layoutNodeGraph3D> {
  const topology = createNodeGraphTopology(
    [...snapshot.records.values()].map(({ parentPath, path }) => ({ id: path, parentId: parentPath })),
    snapshot.links,
  );
  const scope = { mode: "global" } as const;
  const scene = buildNodeGraphVisibleScene(topology, scope, setNodeGraphRangeDepth(topology, scope, "all"));
  return layoutNodeGraph3D(buildNodeGraphModelFromNodes(scene.nodes, scene.structureEdges));
}

function graphIndexFixture() {
  const fake = new FakeObsidian("Test Vault");
  const notes = new Map<string, TFile>();
  const ignoredPaths = new Set<string>();
  const addNode = (path: string): void => {
    const folder = path === "" ? fake.root : fake.addFolder(path);
    const name = path === "" ? "Test Vault" : folder.name;
    const notePath = path === "" ? `${name}.md` : `${path}/${name}.md`;
    notes.set(path, fake.addFile(notePath));
  };
  const removeCanonical = (path: string): void => {
    const note = notes.get(path);
    if (note === undefined) throw new Error(`Missing canonical note: ${path}`);
    fake.remove(note.path);
    notes.delete(path);
  };
  const addOrdinary = (path: string): TFile => fake.addFile(path);
  const ignorePath = (path: string): void => { ignoredPaths.add(path); };
  const setChildOrder = (parentPath: string, orderedPaths: readonly string[]): void => {
    const parent = fake.requireFolder(parentPath);
    const positions = new Map(orderedPaths.map((path, index) => [path, index]));
    parent.children.sort((left, right) => {
      if (!(left instanceof TFolder) || !(right instanceof TFolder)) return 0;
      return (positions.get(left.path) ?? Number.MAX_SAFE_INTEGER) - (positions.get(right.path) ?? Number.MAX_SAFE_INTEGER);
    });
  };
  addNode("");
  addNode("Work");
  addNode("Work/One");
  addNode("Personal");
  fake.app.metadataCache.resolvedLinks = {
    "Work/Work.md": { "Personal/Personal.md": 1 },
  };

  const children = vi.fn((path: string) => fake.requireFolder(path).children.flatMap((entry) =>
    entry instanceof TFolder && notes.has(entry.path) && ![...ignoredPaths].some((ignored) =>
      entry.path === ignored || entry.path.startsWith(`${ignored}/`)) ? [{ childPath: entry.path }] : []));
  const hiddenSource = (path: string): string | null => {
    let current = path;
    while (current !== "") {
      const note = notes.get(current);
      if (note !== undefined && fake.frontmatters.get(note.path)?.folderNodeHidden === true) return current;
      const slash = current.lastIndexOf("/");
      current = slash < 0 ? "" : current.slice(0, slash);
    }
    return null;
  };
  let revealHidden = false;
  const service = {
    children,
    folderForFile: (file: TFile | null) => file?.parent ?? null,
    getCanonicalFile: (path: string) => notes.get(path) ?? null,
    getFolder: (path: string) => {
      const entry = fake.files.get(path);
      return entry instanceof TFolder ? entry : null;
    },
    isCanonicalFile: (file: TFile) => notes.get(file.parent?.path ?? "") === file,
    isIgnoredPath: (path: string) => [...ignoredPaths].some((ignored) => path === ignored || path.startsWith(`${ignored}/`)),
    isNodeVisible: (path: string) => revealHidden || hiddenSource(path) === null,
    hiddenState: (path: string) => ({ explicit: hiddenSource(path) === path, sourcePath: hiddenSource(path) }),
    revealingHiddenNodes: () => revealHidden,
  };
  const visuals = { resolve: vi.fn<(folder: TFolder) => NodeVisual>(() => FALLBACK_VISUAL) };
  const references = {
    targetsForSource: vi.fn((path: string) => Object.keys(fake.app.metadataCache.resolvedLinks[path] ?? {})),
  };
  const settings: NodeGraphSettings = structuredClone(DEFAULT_NODE_GRAPH_SETTINGS);
  const index = new NodeGraphIndex(fake.app, service, visuals, references);
  const setRevealHidden = (value: boolean): void => { revealHidden = value; index.invalidateAll(); };
  return { addNode, addOrdinary, children, fake, ignorePath, index, references, removeCanonical, service, setChildOrder, setRevealHidden, settings, visuals };
}
