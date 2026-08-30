import { TFolder, type App, type TFile } from "obsidian";
import { expect, it } from "vitest";

import { NodeGraphIndex } from "../src/app/node-graph-index";
import { defaultNodeGraphCamera, layoutNodeGraph3D, projectNodeGraph3D } from "../src/core/node-graph-3d";
import { layoutNodeGraphForest, type NodeGraphTree } from "../src/core/node-graph-layout";
import { buildNodeGraphModelFromNodes } from "../src/core/node-graph-model";
import { summarizeNodeGraphSearch } from "../src/core/node-graph-search";
import { setNodeGraphRangeDepth } from "../src/core/node-graph-state";
import { createNodeGraphTopology } from "../src/core/node-graph-topology";
import { buildNodeGraphVisibleScene, type NodeGraphVisibleScene } from "../src/core/node-graph-visible";
import type { NodeGraphSettings, NodeVisual } from "../src/core/types";
import { DEFAULT_NODE_GRAPH_SETTINGS } from "../src/shared/settings";

const FALLBACK_VISUAL: NodeVisual = {
  accent: null,
  inheritedFrom: null,
  kind: "fallback",
  value: "folder",
};

it("builds, refreshes, searches, and lays out a large production Node Graph index", () => {
  const large = import.meta.env.MODE === "large";
  const size = large ? 100_000 : 20_000;
  const dirtyRootCount = large ? 128 : 32;
  const limits = large
    ? { initialBuild: 6_000, incrementalRefresh: 6_000, layout2D: 6_000, layout3D: 5_000, search: 3_000 }
    : { initialBuild: 2_000, incrementalRefresh: 2_000, layout2D: 4_000, layout3D: 2_000, search: 1_000 };
  const fixture = graphIndexFixture(size);

  const initialStarted = performance.now();
  const initial = fixture.index.snapshot(fixture.settings);
  const initialCompleted = performance.now();

  expect(initial.records).toHaveLength(size);
  expect(initial.links.size).toBeGreaterThan(0);
  expect(fixture.index.metrics()).toEqual({
    fullScans: 1,
    partialScans: 0,
    visitedFolders: size,
  });

  const dirtyRoots = selectDirtyRoots(fixture.nodePaths, dirtyRootCount);
  fixture.index.invalidatePaths(dirtyRoots);
  const incrementalStarted = performance.now();
  const refreshed = fixture.index.snapshot(fixture.settings);
  const incrementalCompleted = performance.now();

  expect(refreshed.records).toBe(initial.records);
  expect(refreshed.records).toHaveLength(size);
  expect(dirtyRoots).toHaveLength(dirtyRootCount);
  expect(fixture.index.metrics()).toEqual({
    fullScans: 1,
    partialScans: 1,
    visitedFolders: size + dirtyRootCount,
  });

  const searchStarted = performance.now();
  const searchCandidates = [...refreshed.records.values()]
    .map(({ label, path }) => ({ label, path }));
  const searchTarget = fixture.nodePaths[Math.floor(fixture.nodePaths.length * 0.73)];
  if (searchTarget === undefined) throw new Error("Node Graph benchmark lost its search target");
  const search = summarizeNodeGraphSearch(searchCandidates, searchTarget);
  const searchCompleted = performance.now();

  expect(searchCandidates).toHaveLength(size);
  expect(search.first).toEqual({ label: searchTarget, path: searchTarget, rank: 0 });
  expect([...search.bestPaths]).toEqual([searchTarget]);

  const layout2DStarted = performance.now();
  const topology = createNodeGraphTopology(
    [...refreshed.records.values()].map(({ parentPath, path }) => ({ id: path, parentId: parentPath })),
    refreshed.links,
  );
  const scope = { mode: "global" } as const;
  const scene = buildNodeGraphVisibleScene(
    topology,
    scope,
    setNodeGraphRangeDepth(topology, scope, "all"),
    { showLinks: true },
  );
  const layout = layoutNodeGraphForest(visibleForest(scene));
  const visibleLinks = visibleLinkMap(scene);
  const model = buildNodeGraphModelFromNodes(
    scene.nodes.map(({ depth, id }) => ({ depth, id })),
    scene.structureEdges,
    visibleLinks,
  );
  const layout2DCompleted = performance.now();

  const layout3DStarted = performance.now();
  const points3D = layoutNodeGraph3D(model);
  const projected = projectNodeGraph3D(points3D, defaultNodeGraphCamera(), 1_920, 1_080);
  const layout3DCompleted = performance.now();

  expect(topology.stats.scannedNodes).toBe(size);
  expect(scene.nodes).toHaveLength(size);
  expect(layout.nodes).toHaveLength(size);
  expect(layout.edges).toHaveLength(size - 1);
  expect(model.nodes).toHaveLength(size);
  expect(points3D).toHaveLength(size);
  expect(projected).toHaveLength(size);
  expect(projected.every(({ scale, x, y }) => Number.isFinite(x) && Number.isFinite(y) && scale > 0)).toBe(true);

  const timings = {
    initialBuild: initialCompleted - initialStarted,
    incrementalRefresh: incrementalCompleted - incrementalStarted,
    layout2D: layout2DCompleted - layout2DStarted,
    layout3D: layout3DCompleted - layout3DStarted,
    search: searchCompleted - searchStarted,
  };
  console.info(`[Node Graph ${large ? "large" : "quick"}] ${formatTimings(timings)}`);
  expect(timings.initialBuild).toBeLessThan(limits.initialBuild);
  expect(timings.incrementalRefresh).toBeLessThan(limits.incrementalRefresh);
  expect(timings.search).toBeLessThan(limits.search);
  expect(timings.layout2D).toBeLessThan(limits.layout2D);
  expect(timings.layout3D).toBeLessThan(limits.layout3D);
});

function graphIndexFixture(size: number): {
  readonly index: NodeGraphIndex;
  readonly nodePaths: readonly string[];
  readonly settings: NodeGraphSettings;
} {
  const root = folder("");
  const folders = new Map<string, TFolder>([["", root]]);
  const notes = new Map<string, TFile>();
  const targets = new Map<string, readonly string[]>();
  const nodePaths = Array.from({ length: size - 1 }, (_, index) => nodePath(index + 1, size));
  const children = nodePaths.map((childPath) => ({ childPath }));
  notes.set("", note("Benchmark Vault.md"));

  for (const [offset, path] of nodePaths.entries()) {
    const child = folder(path, root);
    root.children.push(child);
    folders.set(path, child);
    const notePath = `${path}/${path}.md`;
    notes.set(path, note(notePath));
    if ((offset + 1) % 16 === 0) {
      const targetPath = nodePaths[((offset + 1) * 17) % nodePaths.length];
      if (targetPath !== undefined) targets.set(notePath, [`${targetPath}/${targetPath}.md`]);
    }
  }

  const app = {
    vault: {
      getAbstractFileByPath: (path: string) => folders.get(path) ?? null,
      getName: () => "Benchmark Vault",
      getRoot: () => root,
    },
  } as unknown as App;
  const service = {
    children: (path: string) => path === "" ? children : [],
    folderForFile: (file: TFile | null) => file?.parent ?? null,
    getCanonicalFile: (path: string) => notes.get(path) ?? null,
    getFolder: (path: string) => folders.get(path) ?? null,
    isCanonicalFile: () => false,
  };
  const visuals = { resolve: () => FALLBACK_VISUAL };
  const references = { targetsForSource: (path: string) => targets.get(path) ?? [] };
  return {
    index: new NodeGraphIndex(app, service, visuals, references),
    nodePaths,
    settings: structuredClone(DEFAULT_NODE_GRAPH_SETTINGS),
  };
}

function visibleForest(scene: NodeGraphVisibleScene): NodeGraphTree[] {
  const trees = new Map(scene.nodes.map(({ id }) => [id, { id, children: [] as NodeGraphTree[] }]));
  for (const { id, parentId } of scene.nodes) {
    if (parentId === null) continue;
    const child = trees.get(id);
    const parent = trees.get(parentId);
    if (child !== undefined && parent !== undefined) parent.children.push(child);
  }
  return scene.rootIds.flatMap((id) => {
    const tree = trees.get(id);
    return tree === undefined ? [] : [tree];
  });
}

function visibleLinkMap(scene: NodeGraphVisibleScene): ReadonlyMap<string, ReadonlySet<string>> {
  const links = new Map<string, Set<string>>();
  for (const { source, target } of scene.linkEdges) {
    const targets = links.get(source) ?? new Set<string>();
    targets.add(target);
    links.set(source, targets);
  }
  return links;
}

function selectDirtyRoots(paths: readonly string[], count: number): ReadonlySet<string> {
  const roots = new Set<string>();
  for (let index = 0; index < count; index += 1) {
    const path = paths[Math.floor((index + 0.5) * paths.length / count)];
    if (path !== undefined) roots.add(path);
  }
  return roots;
}

function nodePath(index: number, size: number): string {
  return `Node-${index.toString().padStart(size.toString().length, "0")}`;
}

function folder(path: string, parent: TFolder | null = null): TFolder {
  return Object.assign(new TFolder(), {
    children: [],
    name: path,
    parent,
    path,
  });
}

function note(path: string): TFile {
  return { parent: null, path } as TFile;
}

function formatTimings(timings: Readonly<Record<string, number>>): string {
  return Object.entries(timings)
    .map(([name, duration]) => `${name}=${duration.toFixed(1)}ms`)
    .join(" ");
}
