import { Notice, TFile, TFolder } from "obsidian";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { NodeVisual } from "../../src/core/types";

const doubles = vi.hoisted(() => {
  class FakeBasePlugin {
    public readonly commands: Array<Record<string, unknown>> = [];
    public readonly cleanups: Array<() => void> = [];
    public readonly openNodeMenuCalls: Array<{ folderPath: string }> = [];
    public readonly registeredEvents: unknown[] = [];
    public readonly viewFactories = new Map<string, (leaf: unknown) => unknown>();
    public baseOnloadCalls = 0;
    public baseOnunloadCalls = 0;
    public baseReconcileCalls = 0;
    public baseLifecycleActive = true;
    public baseOnloadGate: Promise<void> | null = null;
    public service: unknown;
    public visuals: unknown;
    public settings = {
      nodeGraph: {
        enabled: true,
        defaultDimension: "2d",
        layoutDirection: "left-to-right",
        includedSubtrees: [] as string[],
        excludedNodes: [] as string[],
        excludedSubtrees: [] as string[],
        largeGraphThreshold: 500,
        overviewEdgeLimit: 6_000,
      },
    };
    protected readonly references = {
      sourcesForTarget: (path: string) => new Set(path === "A" ? ["Notes/Source.md"] : []),
      targetsForSource: (path: string) => Object.keys((this.app as {
        metadataCache: { resolvedLinks: Record<string, Record<string, number>> };
      }).metadataCache.resolvedLinks[path] ?? {}),
    };
    protected get pluginLifecycleActive(): boolean { return this.baseLifecycleActive; }

    public constructor(public readonly app: unknown) {}
    public async onload(): Promise<void> {
      this.baseOnloadCalls += 1;
      if (this.baseOnloadGate !== null) await this.baseOnloadGate;
    }
    public onunload(): void { this.baseLifecycleActive = false; this.baseOnunloadCalls += 1; }
    public async reconcileSettingsChange(): Promise<void> { this.baseReconcileCalls += 1; }
    public registerView(type: string, factory: (leaf: unknown) => unknown): void { this.viewFactories.set(type, factory); }
    public addCommand(command: Record<string, unknown>): void { this.commands.push(command); }
    public registerEvent(event: unknown): void { this.registeredEvents.push(event); }
    public register(cleanup: () => void): void { this.cleanups.push(cleanup); }
    public async saveSettings(): Promise<void> {}
    public openNodeMenu(_event: unknown, folder: { path: string }): void {
      this.openNodeMenuCalls.push({ folderPath: folder.path });
    }
  }

  class FakeGraphView {
    public readonly focusCalls: Array<string | null> = [];
    public readonly pathRemovalCalls: string[] = [];
    public readonly pathRemapCalls: Array<{ newPath: string; oldPath: string }> = [];
    public refreshCalls = 0;
    public readonly scopeCalls: unknown[] = [];
    public constructor(
      public readonly leaf: unknown,
      _service?: unknown,
      public readonly options?: Record<string, (...args: unknown[]) => unknown>,
    ) {}
    public refresh(): void { this.refreshCalls += 1; }
    public remapPathState(oldPath: string, newPath: string): void { this.pathRemapCalls.push({ newPath, oldPath }); }
    public removePathState(path: string): void { this.pathRemovalCalls.push(path); }
    public setFocus(path: string | null): void { this.focusCalls.push(path); }
    public setGraphScope(scope: unknown): void { this.scopeCalls.push(scope); }
  }

  class FakeContentsView {
    public readonly contentEl = document.createElement("div");
    public readonly extensions = new Map<string, () => void>();
    public setRenderExtension(key: string, extension: () => void): void {
      this.extensions.set(key, extension);
      extension();
    }
  }

  return { FakeBasePlugin, FakeContentsView, FakeGraphView };
});

vi.mock("../../src/app/plugin", () => ({ default: doubles.FakeBasePlugin }));
vi.mock("../../src/ui/node-graph-view", () => ({
  FolderNodeGraphView: doubles.FakeGraphView,
  NODE_GRAPH_VIEW_TYPE: "folder-nodes-node-graph",
}));
vi.mock("../../src/ui/contents-view", () => ({
  CONTENTS_VIEW_TYPE: "folder-nodes-contents",
  FolderNodeContentsView: doubles.FakeContentsView,
}));
vi.mock("../../src/app/layout-ready", () => ({
  onLayoutReadyOnce: (_host: unknown, callback: () => void) => callback(),
}));
vi.mock("../../src/ui/i18n", () => ({ resolvedLanguage: () => "en" }));

import FolderNodesWithNodeGraphPlugin from "../../src/app/node-graph-plugin";

const GRAPH_VIEW_TYPE = "folder-nodes-node-graph";
const CONTENTS_VIEW_TYPE = "folder-nodes-contents";
type TestRefreshReason = "active-leaf" | "full" | "metadata" | "path" | "reference";
type FakeBasePluginInstance = InstanceType<typeof doubles.FakeBasePlugin>;
type FakeGraphViewInstance = InstanceType<typeof doubles.FakeGraphView>;

describe("Node Graph plugin integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (Notice as unknown as { messages: string[] }).messages.length = 0;
  });

  it("registers the real extension entry and passes one shared index through view options", async () => {
    const fixture = pluginFixture();
    const contents = new doubles.FakeContentsView();
    fixture.leaves.set(CONTENTS_VIEW_TYPE, [{ view: contents }]);
    const plugin = fixture.createPlugin();

    await plugin.onload();

    expect(plugin.baseOnloadCalls).toBe(1);
    expect([...plugin.viewFactories.keys()]).toContain(GRAPH_VIEW_TYPE);
    expect(plugin.commands.map(({ id }) => id)).toEqual(expect.arrayContaining([
      "open-node-graph",
      "open-node-graph-subtree",
      "open-node-graph-local",
    ]));
    for (const command of plugin.commands.filter(({ id }) => String(id).startsWith("open-node-graph"))) {
      expect((command.checkCallback as (checking: boolean) => boolean)(true)).toBe(true);
    }
    expect(contents.extensions.has("node-graph")).toBe(true);
    expect(contents.contentEl.querySelector(".folder-nodes-node-graph-entry-button")).not.toBeNull();

    const view = createRegisteredView(plugin);
    expect(view.options?.getSettings?.()).toBe(plugin.settings.nodeGraph);
    const first = view.options?.getIndexSnapshot?.() as {
      links: ReadonlyMap<string, ReadonlySet<string>>;
      records: ReadonlyMap<string, unknown>;
      revision: number;
    };
    const second = view.options?.getIndexSnapshot?.() as typeof first;
    expect([...first.records.keys()]).toEqual(["", "A"]);
    expect(second.revision).toBe(first.revision);
    view.options?.onNodeMenu?.(new MouseEvent("contextmenu"), "A" as never);
    expect(plugin.openNodeMenuCalls).toEqual([{ folderPath: "A" }]);

    fixture.app.metadataCache.resolvedLinks = { "A/A.md": { "Test Vault.md": 1 } };
    const resolved = fixture.events.find(({ name }) => name === "resolved");
    if (resolved === undefined) throw new Error("Metadata Cache resolved event was not registered");
    resolved.callback();
    const linksOnly = view.options?.getIndexSnapshot?.() as typeof first;
    expect(linksOnly.records).toBe(first.records);
    expect(linksOnly.links.get("A")).toEqual(new Set([""]));
    expect(linksOnly.revision).toBe(first.revision + 1);
  });

  it("exits immediately when unload wins while the base plugin is still starting", async () => {
    const fixture = pluginFixture();
    const plugin = fixture.createPlugin();
    let finishStartup: (() => void) | undefined;
    plugin.baseOnloadGate = new Promise<void>((resolve) => { finishStartup = resolve; });

    const loading = plugin.onload();
    await vi.waitFor(() => { expect(plugin.baseOnloadCalls).toBe(1); });
    plugin.onunload();
    finishStartup?.();
    await loading;

    expect(plugin.baseOnunloadCalls).toBe(1);
    expect(plugin.viewFactories.size).toBe(0);
    expect(plugin.commands).toHaveLength(0);
    expect(plugin.registeredEvents).toHaveLength(0);
  });

  it("keeps commands unavailable and detaches existing graph leaves while disabled", async () => {
    const fixture = pluginFixture();
    const graphLeaf = { detach: vi.fn(), view: new doubles.FakeGraphView({}) };
    const contents = new doubles.FakeContentsView();
    contents.contentEl.className = "folder-nodes-node-graph-entry";
    fixture.leaves.set(GRAPH_VIEW_TYPE, [graphLeaf]);
    fixture.leaves.set(CONTENTS_VIEW_TYPE, [{ view: contents }]);
    const plugin = fixture.createPlugin();
    plugin.settings.nodeGraph.enabled = false;

    await plugin.onload();

    expect(graphLeaf.detach).toHaveBeenCalledTimes(1);
    for (const command of plugin.commands.filter(({ id }) => String(id).startsWith("open-node-graph"))) {
      expect((command.checkCallback as (checking: boolean) => boolean)(true)).toBe(false);
    }
    expect(contents.contentEl.querySelector(".folder-nodes-node-graph-entry")).toBeNull();
  });

  it("rejects current-note graph commands for ordinary, unmanaged, or incomplete contexts and keeps canonical Root eligible", async () => {
    const fixture = pluginFixture();
    const ordinary = fixture.addOrdinary("A/Notes.md");
    fixture.setActiveFile(ordinary);
    const plugin = fixture.createPlugin();
    await plugin.onload();
    const currentCommands = plugin.commands.filter(({ id }) =>
      id === "open-node-graph-subtree" || id === "open-node-graph-local");
    const check = (): boolean[] => currentCommands.map(({ checkCallback }) =>
      (checkCallback as (checking: boolean) => boolean)(true));

    expect(check()).toEqual([false, false]);
    await callOpenCurrent(plugin, "subtree");
    expect((Notice as unknown as { messages: string[] }).messages).toEqual([
      "The current note is not in a visible Folder Node.",
    ]);

    fixture.ignorePath("A");
    expect(check()).toEqual([false, false]);
    fixture.managePath("A");
    fixture.removeCanonical("A");
    expect(check()).toEqual([false, false]);
    await callOpenCurrent(plugin, "local");
    expect((Notice as unknown as { messages: string[] }).messages).toEqual([
      "The current note is not in a visible Folder Node.",
      "The current note is not in a visible Folder Node.",
    ]);

    fixture.setActiveFile(fixture.notes.get("") ?? null);
    expect(check()).toEqual([true, true]);
    const rootOrdinary = fixture.addOrdinary("Root notes.md");
    fixture.setActiveFile(rootOrdinary);
    expect(check()).toEqual([false, false]);
  });

  it("routes refresh batches to partial index invalidation and cached visual refresh", async () => {
    const fixture = pluginFixture();
    const plugin = fixture.createPlugin();
    await plugin.onload();
    const view = createRegisteredView(plugin);
    const graphLeaf = { detach: vi.fn(), view };
    fixture.leaves.set(GRAPH_VIEW_TYPE, [graphLeaf]);
    const first = view.options?.getIndexSnapshot?.() as { revision: number };
    expect(fixture.children).toHaveBeenCalled();

    fixture.addNode("A/Child");
    callRefresh(plugin, { full: false, paths: new Set(["A/Child/Child.md"]), reasons: new Set(["path"]) });
    const partial = view.options?.getIndexSnapshot?.() as { records: ReadonlyMap<string, unknown>; revision: number };
    expect(partial.records.has("A/Child")).toBe(true);
    expect(partial.revision).toBeGreaterThan(first.revision);
    expect(view.refreshCalls).toBe(1);

    fixture.children.mockClear();
    fixture.visuals.resolve.mockClear();
    callRefresh(plugin, { full: true, paths: new Set(), reasons: new Set(["full"]) });
    view.options?.getIndexSnapshot?.();
    expect(fixture.children).not.toHaveBeenCalled();
    expect(fixture.visuals.resolve).toHaveBeenCalledTimes(3);
    expect(view.refreshCalls).toBe(2);

    plugin.settings.nodeGraph.enabled = false;
    callRefresh(plugin, { full: true, paths: new Set(), reasons: new Set(["full"]) });
    expect(graphLeaf.detach).toHaveBeenCalledTimes(1);
    expect(view.refreshCalls).toBe(2);
  });

  it("invalidates the catalog after settings reconciliation and tears down views on unload", async () => {
    const fixture = pluginFixture();
    const plugin = fixture.createPlugin();
    await plugin.onload();
    const view = createRegisteredView(plugin);
    const graphLeaf = { detach: vi.fn(), view };
    fixture.leaves.set(GRAPH_VIEW_TYPE, [graphLeaf]);
    const first = view.options?.getIndexSnapshot?.() as { revision: number };

    await plugin.reconcileSettingsChange();
    const rebuilt = view.options?.getIndexSnapshot?.() as { revision: number };
    expect(plugin.baseReconcileCalls).toBe(1);
    expect(rebuilt.revision).toBeGreaterThan(first.revision);

    plugin.onunload();
    expect(graphLeaf.detach).toHaveBeenCalledTimes(1);
    expect(plugin.baseOnunloadCalls).toBe(1);
  });

  it("keeps active-leaf and ordinary Markdown refreshes out of the graph index", async () => {
    const fixture = pluginFixture();
    const plugin = fixture.createPlugin();
    await plugin.onload();
    const view = createRegisteredView(plugin);
    fixture.leaves.set(GRAPH_VIEW_TYPE, [{ view }]);
    const first = view.options?.getIndexSnapshot?.() as { revision: number };
    fixture.children.mockClear();
    fixture.visuals.resolve.mockClear();

    callRefresh(plugin, { full: true, paths: new Set(), reasons: new Set(["active-leaf"]) });
    const afterLeaf = view.options?.getIndexSnapshot?.() as { revision: number };
    expect(afterLeaf.revision).toBe(first.revision);
    expect(view.refreshCalls).toBe(0);
    expect(fixture.children).not.toHaveBeenCalled();
    expect(fixture.visuals.resolve).not.toHaveBeenCalled();

    fixture.addOrdinary("A/Notes.md");
    callRefresh(plugin, {
      full: false,
      pathReasons: new Map<string, ReadonlySet<TestRefreshReason>>([
        ["A/Notes.md", new Set(["metadata"])],
        ["A/A.md", new Set(["reference"])],
      ]),
      paths: new Set(["A/Notes.md", "A/A.md"]),
      reasons: new Set(["metadata", "reference"]),
    });
    const afterOrdinary = view.options?.getIndexSnapshot?.() as { revision: number };
    expect(afterOrdinary.revision).toBe(first.revision);
    expect(view.refreshCalls).toBe(0);
    expect(fixture.children).not.toHaveBeenCalled();
    expect(fixture.visuals.resolve).not.toHaveBeenCalled();
  });

  it("refreshes one canonical metadata record and its graph links without collecting its subtree", async () => {
    const fixture = pluginFixture();
    const plugin = fixture.createPlugin();
    await plugin.onload();
    const view = createRegisteredView(plugin);
    fixture.leaves.set(GRAPH_VIEW_TYPE, [{ view }]);
    const first = view.options?.getIndexSnapshot?.() as { revision: number };
    fixture.children.mockClear();
    fixture.visuals.resolve.mockClear();
    fixture.setVisual("A", "🚀");
    fixture.app.metadataCache.resolvedLinks = { "A/A.md": { "Test Vault.md": 1 } };

    callRefresh(plugin, {
      full: false,
      pathReasons: new Map([["A/A.md", new Set(["metadata"])]]),
      paths: new Set(["A/A.md"]),
      reasons: new Set(["metadata"]),
    });
    const refreshed = view.options?.getIndexSnapshot?.() as {
      links: ReadonlyMap<string, ReadonlySet<string>>;
      records: ReadonlyMap<string, { visual: { kind: string; value: string } }>;
      revision: number;
    };

    expect(refreshed.revision).toBe(first.revision + 2);
    expect(refreshed.records.get("A")?.visual).toMatchObject({ kind: "emoji", value: "🚀" });
    expect(refreshed.links.get("A")).toEqual(new Set([""]));
    expect(fixture.children).not.toHaveBeenCalled();
    expect(fixture.visuals.resolve).toHaveBeenCalledTimes(1);
    expect(view.refreshCalls).toBe(1);
  });

  it("reorders only the metadata owner's siblings and direct children", async () => {
    const fixture = pluginFixture();
    fixture.addNode("B");
    fixture.addNode("A/One");
    fixture.addNode("A/Two");
    const plugin = fixture.createPlugin();
    await plugin.onload();
    const view = createRegisteredView(plugin);
    fixture.leaves.set(GRAPH_VIEW_TYPE, [{ view }]);
    view.options?.getIndexSnapshot?.();
    fixture.setChildOrder("", ["B", "A"]);
    fixture.setChildOrder("A", ["A/Two", "A/One"]);
    fixture.children.mockClear();
    fixture.visuals.resolve.mockClear();

    callRefresh(plugin, {
      full: false,
      pathReasons: new Map([["A/A.md", new Set(["metadata"])]]),
      paths: new Set(["A/A.md"]),
      reasons: new Set(["metadata"]),
    });
    const refreshed = view.options?.getIndexSnapshot?.() as {
      records: ReadonlyMap<string, { parentPath: string | null; path: string }>;
    };
    const directChildren = (parentPath: string): string[] => [...refreshed.records.values()]
      .filter((record) => record.parentPath === parentPath)
      .map(({ path }) => path);

    expect(directChildren("")).toEqual(["B", "A"]);
    expect(directChildren("A")).toEqual(["A/Two", "A/One"]);
    expect(new Set(fixture.children.mock.calls.map(([path]) => path))).toEqual(new Set(["", "A"]));
    expect(fixture.visuals.resolve).toHaveBeenCalledTimes(1);
  });

  it("re-resolves cached descendants when an ancestor's canonical visual changes", async () => {
    const fixture = pluginFixture();
    fixture.addNode("A/Child");
    const plugin = fixture.createPlugin();
    await plugin.onload();
    const view = createRegisteredView(plugin);
    fixture.leaves.set(GRAPH_VIEW_TYPE, [{ view }]);
    view.options?.getIndexSnapshot?.();
    fixture.setVisual("A", "🚀");
    fixture.children.mockClear();
    fixture.visuals.resolve.mockClear();

    callRefresh(plugin, {
      full: false,
      pathReasons: new Map([["A/A.md", new Set(["metadata"])]]),
      paths: new Set(["A/A.md"]),
      reasons: new Set(["metadata"]),
    });
    const refreshed = view.options?.getIndexSnapshot?.() as {
      records: ReadonlyMap<string, { visual: NodeVisual }>;
    };

    expect(refreshed.records.get("A")?.visual).toMatchObject({ inheritedFrom: null, kind: "emoji", value: "🚀" });
    expect(refreshed.records.get("A/Child")?.visual).toMatchObject({ inheritedFrom: "A", kind: "emoji", value: "🚀" });
    expect(fixture.children).not.toHaveBeenCalled();
    expect(fixture.visuals.resolve).toHaveBeenCalledTimes(2);
  });

  it("honors full visual and structural path invalidation when they share one batch", async () => {
    const fixture = pluginFixture();
    const plugin = fixture.createPlugin();
    await plugin.onload();
    const view = createRegisteredView(plugin);
    fixture.leaves.set(GRAPH_VIEW_TYPE, [{ view }]);
    view.options?.getIndexSnapshot?.();
    fixture.children.mockClear();
    fixture.visuals.resolve.mockClear();

    callRefresh(plugin, {
      full: true,
      paths: new Set(["A/A.md"]),
      reasons: new Set(["path", "full"]),
    });
    view.options?.getIndexSnapshot?.();

    expect(fixture.children).toHaveBeenCalled();
    expect(fixture.visuals.resolve).toHaveBeenCalledTimes(3);
    expect(view.refreshCalls).toBe(1);
  });

  it("invalidates the shared index and preserves leaf state across external folder lifecycle events", async () => {
    const fixture = pluginFixture();
    const plugin = fixture.createPlugin();
    await plugin.onload();
    const view = createRegisteredView(plugin);
    fixture.leaves.set(GRAPH_VIEW_TYPE, [{ view }]);
    const first = view.options?.getIndexSnapshot?.() as { records: ReadonlyMap<string, unknown>; revision: number };
    expect([...first.records.keys()]).toEqual(["", "A"]);

    const created = fixture.addNode("Created");
    fixture.emit("create", created);
    const afterCreate = view.options?.getIndexSnapshot?.() as typeof first;
    expect(afterCreate.records.has("Created")).toBe(true);
    expect(afterCreate.revision).toBeGreaterThan(first.revision);

    const moved = fixture.moveNode("A", "Created");
    fixture.emit("rename", moved, "A");
    const afterRename = view.options?.getIndexSnapshot?.() as typeof first;
    expect(afterRename.records.has("A")).toBe(false);
    expect(afterRename.records.has("Created/A")).toBe(true);
    expect(view.pathRemapCalls).toEqual([{ newPath: "Created/A", oldPath: "A" }]);

    const deleted = fixture.removeNode("Created/A");
    fixture.emit("delete", deleted);
    const afterDelete = view.options?.getIndexSnapshot?.() as typeof first;
    expect(afterDelete.records.has("Created/A")).toBe(false);
    expect(view.pathRemovalCalls).toEqual(["Created/A"]);

    expect(view.refreshCalls).toBe(3);
  });

  it("invalidates node records for external canonical Markdown create, delete, and rename events", async () => {
    const fixture = pluginFixture();
    const plugin = fixture.createPlugin();
    await plugin.onload();
    const view = createRegisteredView(plugin);
    fixture.leaves.set(GRAPH_VIEW_TYPE, [{ view }]);
    const first = view.options?.getIndexSnapshot?.() as { records: ReadonlyMap<string, unknown>; revision: number };
    expect(first.records.has("A")).toBe(true);
    expect(fixture.app.metadataCache.resolvedLinks).toEqual({});

    const deleted = fixture.removeCanonical("A");
    fixture.emit("delete", deleted);
    const afterDelete = view.options?.getIndexSnapshot?.() as typeof first;
    expect(afterDelete.records.has("A")).toBe(false);

    const created = fixture.addCanonical("A");
    fixture.emit("create", created);
    const afterCreate = view.options?.getIndexSnapshot?.() as typeof first;
    expect(afterCreate.records.has("A")).toBe(true);

    const renamed = fixture.renameCanonical("A", "Other.md");
    fixture.emit("rename", renamed.file, renamed.oldPath);
    const afterRename = view.options?.getIndexSnapshot?.() as typeof first;
    expect(afterRename.records.has("A")).toBe(false);
    expect(view.pathRemovalCalls).toEqual(["A"]);
    expect(view.refreshCalls).toBe(3);
  });

  it("preserves leaf state until a note-driven external rename remaps the folder", async () => {
    const fixture = pluginFixture();
    const plugin = fixture.createPlugin();
    await plugin.onload();
    const view = createRegisteredView(plugin);
    fixture.leaves.set(GRAPH_VIEW_TYPE, [{ view }]);
    view.options?.getIndexSnapshot?.();

    const noteRename = fixture.renameCanonical("A", "Other.md");
    fixture.emit("rename", noteRename.file, noteRename.oldPath);
    expect(view.pathRemovalCalls).toEqual([]);

    const folderRename = fixture.renameNode("A", "Other");
    fixture.emit("rename", folderRename, "A");
    const renamed = view.options?.getIndexSnapshot?.() as { records: ReadonlyMap<string, unknown> };
    expect(renamed.records.has("A")).toBe(false);
    expect(renamed.records.has("Other")).toBe(true);
    expect(view.pathRemapCalls).toEqual([{ newPath: "Other", oldPath: "A" }]);
    expect(view.pathRemovalCalls).toEqual([]);
  });
});

function createRegisteredView(plugin: FakeBasePluginInstance): FakeGraphViewInstance {
  const factory = plugin.viewFactories.get(GRAPH_VIEW_TYPE);
  if (factory === undefined) throw new Error("Node Graph view was not registered");
  return factory({ app: plugin.app }) as InstanceType<typeof doubles.FakeGraphView>;
}

function callRefresh(
  plugin: FakeBasePluginInstance,
  batch: {
    full: boolean;
    pathReasons?: ReadonlyMap<string, ReadonlySet<TestRefreshReason>>;
    paths: ReadonlySet<string>;
    reasons: ReadonlySet<TestRefreshReason>;
  },
): void {
  const pathReasons = batch.pathReasons ?? new Map([...batch.paths].map((path) => [path, new Set(batch.reasons)]));
  const value = { ...batch, pathReasons };
  (plugin as unknown as { refreshExtensionViews(input: typeof value): void }).refreshExtensionViews(value);
}

async function callOpenCurrent(plugin: FakeBasePluginInstance, mode: "local" | "subtree"): Promise<void> {
  await (plugin as unknown as { openCurrentNodeGraph(value: typeof mode): Promise<void> }).openCurrentNodeGraph(mode);
}

function pluginFixture() {
  const root = Object.assign(new TFolder(), { children: [] as Array<TFile | TFolder>, name: "", path: "" });
  const entries = new Map<string, TFile | TFolder>([["", root]]);
  const notes = new Map<string, TFile>();
  const childOrder = new Map<string, readonly string[]>();
  const ignoredPaths = new Set<string>();
  const ownVisuals = new Map<string, string>();
  let activeFile: TFile | null = null;
  const addNode = (path: string): TFolder => {
    const parentPath = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
    const parent = entries.get(parentPath);
    if (!(parent instanceof TFolder)) throw new Error(`Missing parent: ${parentPath}`);
    const name = path.slice(path.lastIndexOf("/") + 1) || "Test Vault";
    const folder = path === "" ? root : Object.assign(new TFolder(), {
      children: [] as Array<TFile | TFolder>, name, parent, path,
    });
    if (path !== "") {
      parent.children.push(folder);
      entries.set(path, folder);
    }
    const notePath = path === "" ? "Test Vault.md" : `${path}/${name}.md`;
    const note = Object.assign(new TFile(), {
      basename: name, extension: "md", name: `${name}.md`, parent: folder, path: notePath,
    });
    folder.children.push(note);
    entries.set(notePath, note);
    notes.set(path, note);
    return folder;
  };
  addNode("");
  addNode("A");
  activeFile = notes.get("A") ?? null;

  const addOrdinary = (path: string): TFile => {
    const slash = path.lastIndexOf("/");
    const parent = entries.get(slash < 0 ? "" : path.slice(0, slash));
    if (!(parent instanceof TFolder)) throw new Error(`Missing parent for: ${path}`);
    const name = path.slice(slash + 1);
    const dot = name.lastIndexOf(".");
    const file = Object.assign(new TFile(), {
      basename: dot < 0 ? name : name.slice(0, dot),
      extension: dot < 0 ? "" : name.slice(dot + 1),
      name,
      parent,
      path,
    });
    parent.children.push(file);
    entries.set(path, file);
    return file;
  };

  const addCanonical = (path: string): TFile => {
    const folder = entries.get(path);
    if (!(folder instanceof TFolder)) throw new Error(`Missing folder: ${path}`);
    const name = path === "" ? "Test Vault" : folder.name;
    const notePath = path === "" ? "Test Vault.md" : `${path}/${name}.md`;
    const note = Object.assign(new TFile(), {
      basename: name, extension: "md", name: `${name}.md`, parent: folder, path: notePath,
    });
    folder.children.push(note);
    entries.set(notePath, note);
    notes.set(path, note);
    return note;
  };

  const removeCanonical = (path: string): TFile => {
    const note = notes.get(path);
    if (note === undefined) throw new Error(`Missing canonical note: ${path}`);
    note.parent?.children.splice(note.parent.children.indexOf(note), 1);
    entries.delete(note.path);
    notes.delete(path);
    return note;
  };

  const renameCanonical = (path: string, name: string): { file: TFile; oldPath: string } => {
    const file = notes.get(path);
    if (file === undefined) throw new Error(`Missing canonical note: ${path}`);
    const oldPath = file.path;
    entries.delete(oldPath);
    notes.delete(path);
    file.path = path === "" ? name : `${path}/${name}`;
    file.name = name;
    const dot = name.lastIndexOf(".");
    file.basename = dot < 0 ? name : name.slice(0, dot);
    file.extension = dot < 0 ? "" : name.slice(dot + 1);
    entries.set(file.path, file);
    return { file, oldPath };
  };

  const moveNode = (path: string, parentPath: string): TFolder => {
    const folder = entries.get(path);
    const nextParent = entries.get(parentPath);
    if (!(folder instanceof TFolder) || !(nextParent instanceof TFolder)) throw new Error(`Cannot move node: ${path}`);
    const nextPath = parentPath === "" ? folder.name : `${parentPath}/${folder.name}`;
    folder.parent?.children.splice(folder.parent.children.indexOf(folder), 1);
    nextParent.children.push(folder);
    folder.parent = nextParent;
    const affectedEntries = [...entries.entries()]
      .filter(([candidate]) => candidate === path || candidate.startsWith(`${path}/`));
    for (const [candidate] of affectedEntries) entries.delete(candidate);
    for (const [candidate, entry] of affectedEntries) {
      const target = candidate === path ? nextPath : `${nextPath}${candidate.slice(path.length)}`;
      entry.path = target;
      entries.set(target, entry);
    }
    const affectedNotes = [...notes.entries()]
      .filter(([candidate]) => candidate === path || candidate.startsWith(`${path}/`));
    for (const [candidate] of affectedNotes) notes.delete(candidate);
    for (const [candidate, note] of affectedNotes) {
      const target = candidate === path ? nextPath : `${nextPath}${candidate.slice(path.length)}`;
      notes.set(target, note);
    }
    return folder;
  };

  const removeNode = (path: string): TFolder => {
    const folder = entries.get(path);
    if (!(folder instanceof TFolder)) throw new Error(`Missing node: ${path}`);
    folder.parent?.children.splice(folder.parent.children.indexOf(folder), 1);
    for (const candidate of [...entries.keys()]) {
      if (candidate === path || candidate.startsWith(`${path}/`)) entries.delete(candidate);
    }
    for (const candidate of [...notes.keys()]) {
      if (candidate === path || candidate.startsWith(`${path}/`)) notes.delete(candidate);
    }
    return folder;
  };

  const renameNode = (path: string, name: string): TFolder => {
    const folder = entries.get(path);
    if (!(folder instanceof TFolder)) throw new Error(`Missing node: ${path}`);
    const parentPath = folder.parent?.path ?? "";
    const nextPath = parentPath === "" ? name : `${parentPath}/${name}`;
    const affectedEntries = [...entries.entries()]
      .filter(([candidate]) => candidate === path || candidate.startsWith(`${path}/`));
    for (const [candidate] of affectedEntries) entries.delete(candidate);
    for (const [candidate, entry] of affectedEntries) {
      const target = candidate === path ? nextPath : `${nextPath}${candidate.slice(path.length)}`;
      entry.path = target;
      if (entry === folder) entry.name = name;
      entries.set(target, entry);
    }
    for (const [candidate, note] of [...notes.entries()]) {
      if (candidate !== path && !candidate.startsWith(`${path}/`)) continue;
      notes.delete(candidate);
      const target = candidate === path ? nextPath : `${nextPath}${candidate.slice(path.length)}`;
      notes.set(target, note);
    }
    const canonical = folder.children.find((entry): entry is TFile =>
      entry instanceof TFile && entry.basename === name && entry.extension.toLocaleLowerCase() === "md");
    if (canonical !== undefined) notes.set(nextPath, canonical);
    return folder;
  };

  const leaves = new Map<string, Array<{ detach?: () => void; view: unknown }>>();
  const events: Array<{ callback: (...args: never[]) => unknown; name: string }> = [];
  const children = vi.fn((path: string) => {
    const folder = entries.get(path);
    if (!(folder instanceof TFolder)) return [];
    const available = folder.children.flatMap((entry) =>
      entry instanceof TFolder && notes.has(entry.path) ? [entry.path] : []);
    const ordered = childOrder.get(path);
    if (ordered === undefined) return available.map((childPath) => ({ childPath }));
    const configured = ordered.filter((childPath) => available.includes(childPath));
    return [...configured, ...available.filter((childPath) => !configured.includes(childPath))]
      .map((childPath) => ({ childPath }));
  });
  const service = {
    children,
    folderForFile: (file: TFile | null) => file?.parent ?? null,
    getCanonicalFile: (path: string) => notes.get(path) ?? null,
    getFolder: (path: string) => {
      const entry = entries.get(path);
      return entry instanceof TFolder ? entry : null;
    },
    isCanonicalFile: (file: TFile) => notes.get(file.parent?.path ?? "") === file,
    isIgnoredPath: (path: string) => ignoredPaths.has(path),
    rootNotePath: () => "Test Vault.md",
  };
  const visuals = { resolve: vi.fn<(folder: TFolder) => NodeVisual>((folder) => {
    let current: TFolder | null = folder;
    while (current !== null) {
      const value = ownVisuals.get(current.path);
      if (value !== undefined) {
        return { accent: null, inheritedFrom: current === folder ? null : current.path, kind: "emoji", value };
      }
      current = current.parent;
    }
    return { accent: null, inheritedFrom: null, kind: "fallback", value: "folder" };
  }) };
  const app = {
    metadataCache: {
      on: (name: string, callback: (...args: never[]) => unknown) => {
        events.push({ callback, name });
        return () => undefined;
      },
      resolvedLinks: {},
    },
    vault: {
      getAbstractFileByPath: (path: string) => entries.get(path) ?? null,
      getName: () => "Test Vault",
      getRoot: () => root,
      on: (name: string, callback: (...args: never[]) => unknown) => {
        events.push({ callback, name });
        return () => undefined;
      },
    },
    workspace: {
      getActiveFile: () => activeFile,
      getLeaf: () => ({ setViewState: async () => undefined, view: null }),
      getLeavesOfType: (type: string) => leaves.get(type) ?? [],
      on: (name: string, callback: (...args: never[]) => unknown) => {
        events.push({ callback, name });
        return () => undefined;
      },
      revealLeaf: async () => undefined,
    },
  };
  const createPlugin = () => {
    const plugin = new FolderNodesWithNodeGraphPlugin(app as never, {} as never);
    plugin.service = service as never;
    plugin.visuals = visuals as never;
    return plugin as unknown as FolderNodesWithNodeGraphPlugin & FakeBasePluginInstance;
  };
  const emit = (name: string, ...args: unknown[]): void => {
    for (const event of events.filter((candidate) => candidate.name === name)) {
      event.callback(...args as never[]);
    }
  };
  return {
    addCanonical,
    addNode,
    addOrdinary,
    app,
    children,
    createPlugin,
    emit,
    entries,
    events,
    ignorePath: (path: string) => { ignoredPaths.add(path); },
    leaves,
    managePath: (path: string) => { ignoredPaths.delete(path); },
    moveNode,
    notes,
    removeCanonical,
    removeNode,
    renameCanonical,
    renameNode,
    setActiveFile: (file: TFile | null) => { activeFile = file; },
    setChildOrder: (path: string, ordered: readonly string[]) => { childOrder.set(path, ordered); },
    setVisual: (path: string, value: string) => { ownVisuals.set(path, value); },
    service,
    visuals,
  };
}
