import { Notice, type TFile, type TFolder } from "obsidian";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { NodeService } from "../../src/adapters/node-service";
import { DEFAULT_SETTINGS } from "../../src/shared/settings";
import type { NodeVisual } from "../../src/core/types";
import { VisualService } from "../../src/adapters/visual-service";
import { FakeObsidian } from "../helpers/fake-obsidian";
import { setLanguage } from "../../src/ui/i18n";

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
    protected registerCommand(command: Record<string, unknown>): void { this.addCommand(command); }
    protected localizedCommandNames(): Record<string, string> { return {}; }
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
    public folderPath = "";
    public constructor() { this.contentEl.createDiv({ cls: "folder-nodes-header-actions" }); }
    public currentFolderPath(): string { return this.folderPath; }
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

import FolderNodesWithNodeGraphPlugin from "../../src/app/node-graph-plugin";

const GRAPH_VIEW_TYPE = "folder-nodes-node-graph";
const CONTENTS_VIEW_TYPE = "folder-nodes-contents";
type TestRefreshReason = "active-leaf" | "full" | "metadata" | "path" | "reference";
type FakeBasePluginInstance = InstanceType<typeof doubles.FakeBasePlugin>;
type FakeGraphViewInstance = InstanceType<typeof doubles.FakeGraphView>;

describe("Node Graph plugin integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setLanguage("en");
    (Notice as unknown as { messages: string[] }).messages.length = 0;
  });

  it("refreshes the existing graph entry label without duplicating its button", async () => {
    const fixture = pluginFixture();
    const contents = new doubles.FakeContentsView();
    fixture.leaves.set(CONTENTS_VIEW_TYPE, [{ view: contents }]);
    const plugin = fixture.createPlugin();
    await plugin.onload();
    const button = contents.contentEl.querySelector(".folder-nodes-node-graph-entry-button");
    expect(button?.getAttribute("aria-label")).toBe("Open Node Graph");
    setLanguage("zh-CN");
    await plugin.reconcileSettingsChange();
    expect(button?.getAttribute("aria-label")).toBe("打开节点图谱");
    setLanguage("en");
    await plugin.reconcileSettingsChange();
    expect(button?.getAttribute("aria-label")).toBe("Open Node Graph");
    expect(contents.contentEl.querySelectorAll(".folder-nodes-node-graph-entry-button")).toHaveLength(1);
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

  it("opens the graph for the node shown by Contents instead of the active editor", async () => {
    const fixture = pluginFixture();
    fixture.addNode("B");
    const contents = new doubles.FakeContentsView();
    contents.folderPath = "B";
    const graph = new doubles.FakeGraphView({});
    fixture.leaves.set(CONTENTS_VIEW_TYPE, [{ view: contents }]);
    fixture.leaves.set(GRAPH_VIEW_TYPE, [{ view: graph }]);
    const plugin = fixture.createPlugin();

    await plugin.onload();
    contents.contentEl.querySelector<HTMLButtonElement>(".folder-nodes-node-graph-entry-button")?.click();

    await vi.waitFor(() => expect(graph.focusCalls).toEqual(["B"]));
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
    contents.contentEl.querySelector(".folder-nodes-header-actions")?.createEl("button", { cls: "folder-nodes-node-graph-entry-button" });
    fixture.leaves.set(GRAPH_VIEW_TYPE, [graphLeaf]);
    fixture.leaves.set(CONTENTS_VIEW_TYPE, [{ view: contents }]);
    const plugin = fixture.createPlugin();
    plugin.settings.nodeGraph.enabled = false;

    await plugin.onload();

    expect(graphLeaf.detach).toHaveBeenCalledTimes(1);
    for (const command of plugin.commands.filter(({ id }) => String(id).startsWith("open-node-graph"))) {
      expect((command.checkCallback as (checking: boolean) => boolean)(true)).toBe(false);
    }
    expect(contents.contentEl.querySelector(".folder-nodes-node-graph-entry-button")).toBeNull();
  });

  it("rejects current-note graph commands for ordinary, unmanaged, or incomplete contexts and keeps canonical Root eligible", async () => {
    const fixture = pluginFixture();
    const ordinary = fixture.vault.addFile("A/Notes.md");
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

    fixture.setActiveFile(fixture.vault.requireFile("A/A.md"));
    expect(check()).toEqual([true, true]);
    fixture.settings.ignoredFolders = ["A"];
    expect(check()).toEqual([false, false]);
    fixture.settings.ignoredFolders = [];
    expect(check()).toEqual([true, true]);
    fixture.removeCanonical("A");
    expect(check()).toEqual([false, false]);
    await callOpenCurrent(plugin, "local");
    expect((Notice as unknown as { messages: string[] }).messages).toEqual([
      "The current note is not in a visible Folder Node.",
      "The current note is not in a visible Folder Node.",
    ]);

    fixture.setActiveFile(fixture.vault.requireFile("Test Vault.md"));
    expect(check()).toEqual([true, true]);
    const rootOrdinary = fixture.vault.addFile("Root notes.md");
    fixture.setActiveFile(rootOrdinary);
    expect(check()).toEqual([false, false]);
  });

  it("only offers scoped graph actions for nodes reachable in the current visibility session", async () => {
    const fixture = pluginFixture();
    const child = fixture.addNode("A/Child");
    fixture.setActiveFile(fixture.vault.requireFile("A/Child/Child.md"));
    const plugin = fixture.createPlugin();
    await plugin.onload();
    const commands = plugin.commands.filter(({ id }) =>
      id === "open-node-graph-subtree" || id === "open-node-graph-local");
    const available = () => commands.map(({ checkCallback }) => (checkCallback as (checking: boolean) => boolean)(true));
    const menuActions = (): unknown[] => {
      const actions: unknown[] = [];
      Reflect.get(plugin, "contributeNodeActions").call(plugin, actions, child, "contents");
      return actions;
    };
    await fixture.service.setNodeHidden(fixture.vault.requireFolder("A"), true);
    expect(available()).toEqual([false, false]);
    expect(menuActions()).toHaveLength(0);
    fixture.revealHidden();
    expect(available()).toEqual([true, true]);
    expect(menuActions()).toHaveLength(3);
    const duplicate = fixture.vault.addFile("A/a.MD");
    expect(available()).toEqual([false, false]);
    expect(menuActions()).toHaveLength(0);
    fixture.vault.remove(duplicate.path);
    expect(available()).toEqual([true, true]);
    fixture.removeCanonical("A");
    expect(available()).toEqual([false, false]);
    expect(menuActions()).toHaveLength(0);
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
    fixture.resolveVisual.mockClear();
    callRefresh(plugin, { full: true, paths: new Set(), reasons: new Set(["full"]) });
    view.options?.getIndexSnapshot?.();
    expect(fixture.children).not.toHaveBeenCalled();
    expect(fixture.resolveVisual).toHaveBeenCalledTimes(3);
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
    fixture.resolveVisual.mockClear();

    callRefresh(plugin, { full: true, paths: new Set(), reasons: new Set(["active-leaf"]) });
    const afterLeaf = view.options?.getIndexSnapshot?.() as { revision: number };
    expect(afterLeaf.revision).toBe(first.revision);
    expect(view.refreshCalls).toBe(0);
    expect(fixture.children).not.toHaveBeenCalled();
    expect(fixture.resolveVisual).not.toHaveBeenCalled();

    fixture.vault.addFile("A/Notes.md");
    callRefresh(plugin, {
      full: false,
      pathReasons: new Map<string, ReadonlySet<TestRefreshReason>>([
        ["A/Notes.md", new Set(["metadata"])],
      ]),
      paths: new Set(["A/Notes.md"]),
      reasons: new Set(["metadata"]),
    });
    const afterOrdinary = view.options?.getIndexSnapshot?.() as { revision: number };
    expect(afterOrdinary.revision).toBe(first.revision);
    expect(view.refreshCalls).toBe(0);
    expect(fixture.children).not.toHaveBeenCalled();
    expect(fixture.resolveVisual).not.toHaveBeenCalled();
  });

  it("refreshes graph links for a canonical reference-only batch without traversing structure", async () => {
    const fixture = pluginFixture();
    const plugin = fixture.createPlugin();
    await plugin.onload();
    const view = createRegisteredView(plugin);
    fixture.leaves.set(GRAPH_VIEW_TYPE, [{ view }]);
    const first = view.options?.getIndexSnapshot?.() as { revision: number };
    fixture.children.mockClear();
    fixture.resolveVisual.mockClear();
    fixture.app.metadataCache.resolvedLinks = { "A/A.md": { "Test Vault.md": 1 } };

    callRefresh(plugin, {
      full: false,
      pathReasons: new Map([["A/A.md", new Set(["reference"])]]),
      paths: new Set(["A/A.md"]),
      reasons: new Set(["reference"]),
    });
    const refreshed = view.options?.getIndexSnapshot?.() as {
      links: ReadonlyMap<string, ReadonlySet<string>>;
      revision: number;
    };

    expect(refreshed.revision).toBe(first.revision + 1);
    expect(refreshed.links.get("A")).toEqual(new Set([""]));
    expect(fixture.children).not.toHaveBeenCalled();
    expect(fixture.resolveVisual).not.toHaveBeenCalled();
    expect(view.refreshCalls).toBe(1);
  });

  it("refreshes one canonical metadata record and its graph links without collecting its subtree", async () => {
    const fixture = pluginFixture();
    const plugin = fixture.createPlugin();
    await plugin.onload();
    const view = createRegisteredView(plugin);
    fixture.leaves.set(GRAPH_VIEW_TYPE, [{ view }]);
    const first = view.options?.getIndexSnapshot?.() as { revision: number };
    fixture.children.mockClear();
    fixture.resolveVisual.mockClear();
    await fixture.visualService.set(fixture.vault.requireFolder("A"), ["#ff0000"]);
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
    expect(refreshed.records.get("A")?.visual).toMatchObject({ kind: "color", value: "#ff0000" });
    expect(refreshed.links.get("A")).toEqual(new Set([""]));
    expect(fixture.children).not.toHaveBeenCalled();
    expect(fixture.resolveVisual).toHaveBeenCalledTimes(1);
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
    await fixture.service.setChildOrderMode("", "manual");
    await fixture.service.reorder(fixture.vault.requireFolder("B"), -1);
    await fixture.service.setChildOrderMode("A", "manual");
    await fixture.service.reorder(fixture.vault.requireFolder("A/Two"), -1);
    fixture.children.mockClear();
    fixture.resolveVisual.mockClear();

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
    expect(fixture.resolveVisual).toHaveBeenCalledTimes(1);
  });

  it("re-resolves cached descendants when an ancestor's canonical visual changes", async () => {
    const fixture = pluginFixture();
    fixture.addNode("A/Child");
    const plugin = fixture.createPlugin();
    await plugin.onload();
    const view = createRegisteredView(plugin);
    fixture.leaves.set(GRAPH_VIEW_TYPE, [{ view }]);
    view.options?.getIndexSnapshot?.();
    await fixture.visualService.set(fixture.vault.requireFolder("A"), ["#ff0000"]);
    fixture.children.mockClear();
    fixture.resolveVisual.mockClear();

    callRefresh(plugin, {
      full: false,
      pathReasons: new Map([["A/A.md", new Set(["metadata"])]]),
      paths: new Set(["A/A.md"]),
      reasons: new Set(["metadata"]),
    });
    const refreshed = view.options?.getIndexSnapshot?.() as {
      records: ReadonlyMap<string, { visual: NodeVisual }>;
    };

    expect(refreshed.records.get("A")?.visual).toMatchObject({ inheritedFrom: null, kind: "color", value: "#ff0000" });
    expect(refreshed.records.get("A/Child")?.visual).toMatchObject({ inheritedFrom: "A", kind: "color", value: "#ff0000" });
    expect(fixture.children).not.toHaveBeenCalled();
    expect(fixture.resolveVisual).toHaveBeenCalledTimes(2);
  });

  it("honors full visual and structural path invalidation when they share one batch", async () => {
    const fixture = pluginFixture();
    const plugin = fixture.createPlugin();
    await plugin.onload();
    const view = createRegisteredView(plugin);
    fixture.leaves.set(GRAPH_VIEW_TYPE, [{ view }]);
    view.options?.getIndexSnapshot?.();
    fixture.children.mockClear();
    fixture.resolveVisual.mockClear();

    callRefresh(plugin, {
      full: true,
      paths: new Set(["A/A.md"]),
      reasons: new Set(["path", "full"]),
    });
    view.options?.getIndexSnapshot?.();

    expect(fixture.children).toHaveBeenCalled();
    expect(fixture.resolveVisual).toHaveBeenCalledTimes(3);
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

    const moved = fixture.vault.requireFolder("A");
    await fixture.vault.rename(moved, "Created/A");
    fixture.emit("rename", moved, "A");
    const afterRename = view.options?.getIndexSnapshot?.() as typeof first;
    expect(afterRename.records.has("A")).toBe(false);
    expect(afterRename.records.has("Created/A")).toBe(true);
    expect(view.pathRemapCalls).toEqual([{ newPath: "Created/A", oldPath: "A" }]);

    const deleted = fixture.vault.requireFolder("Created/A");
    fixture.vault.remove(deleted.path);
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

    const renamed = await fixture.renameNote("A/A.md", "A/Other.md");
    fixture.emit("rename", renamed.file, renamed.oldPath);
    const afterRename = view.options?.getIndexSnapshot?.() as typeof first;
    expect(afterRename.records.has("A")).toBe(false);
    expect(view.pathRemovalCalls).toEqual(["A"]);
    expect(view.refreshCalls).toBe(3);
  });

  it.each(["new conflict", "removed root note", "renamed root note"])("refreshes a cached graph after %s with variant spelling", async (change) => {
    const fixture = pluginFixture();
    fixture.removeCanonical("");
    const rootNote = fixture.vault.addFile("test vault.MD");
    const { service } = fixture;
    const plugin = fixture.createPlugin();
    await plugin.onload();
    const view = createRegisteredView(plugin);
    fixture.leaves.set(GRAPH_VIEW_TYPE, [{ view }]);
    const snapshot = () => view.options?.getIndexSnapshot?.() as { records: ReadonlyMap<string, { notePath: string | null }> };
    expect(snapshot().records.get("")?.notePath).toBe(rootNote.path);
    expect(snapshot().records.has("A")).toBe(true);

    if (change === "new conflict") {
      const duplicate = fixture.vault.addFile("A/a.MD");
      expect(service.nodeNoteRole(duplicate)).toBe("conflict");
      fixture.emit("create", duplicate);
      expect(snapshot().records.has("A")).toBe(false);
      const renamed = await fixture.renameNote("A/A.md", "A/Other.md");
      fixture.emit("rename", renamed.file, renamed.oldPath);
      expect(snapshot().records.get("A")?.notePath).toBe(duplicate.path);
    } else {
      const oldPath = rootNote.path;
      if (change === "removed root note") {
        fixture.vault.remove(oldPath);
        fixture.emit("delete", rootNote);
      } else {
        await fixture.vault.rename(rootNote, "other.md");
        fixture.emit("rename", rootNote, oldPath);
      }
      expect(service.getCanonicalFile("")).toBeNull();
      expect(snapshot().records.get("")?.notePath).toBeNull();
    }
  });

  it("preserves leaf state until a note-driven external rename remaps the folder", async () => {
    const fixture = pluginFixture();
    const plugin = fixture.createPlugin();
    await plugin.onload();
    const view = createRegisteredView(plugin);
    fixture.leaves.set(GRAPH_VIEW_TYPE, [{ view }]);
    view.options?.getIndexSnapshot?.();

    const noteRename = await fixture.renameNote("A/A.md", "A/Other.md");
    fixture.emit("rename", noteRename.file, noteRename.oldPath);
    expect(view.pathRemovalCalls).toEqual([]);

    const folderRename = fixture.vault.requireFolder("A");
    await fixture.vault.rename(folderRename, "Other");
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
  const vault = new FakeObsidian("Test Vault");
  const settings = structuredClone(DEFAULT_SETTINGS);
  let showHidden = false;
  const service = new NodeService(vault.app, () => settings, () => showHidden);
  const visualService = new VisualService(vault.app, service, () => true);
  const children = vi.spyOn(service, "children");
  const resolveVisual = vi.spyOn(visualService, "resolve");
  const addCanonical = (path: string): TFile => vault.addFile(service.notePathForFolder(path));
  const addNode = (path: string): TFolder => {
    const folder = vault.addFolder(path);
    addCanonical(path);
    return folder;
  };
  const removeCanonical = (path: string): TFile => {
    const note = vault.requireFile(service.notePathForFolder(path));
    vault.remove(note.path);
    return note;
  };
  const renameNote = async (oldPath: string, path: string): Promise<{ file: TFile; oldPath: string }> => {
    const file = vault.requireFile(oldPath);
    await vault.rename(file, path);
    return { file, oldPath };
  };
  addNode("");
  addNode("A");
  let activeFile: TFile | null = vault.requireFile("A/A.md");
  const leaves = new Map<string, Array<{ detach?: () => void; view: unknown }>>();
  const events: Array<{ callback: (...args: never[]) => unknown; name: string }> = [];
  const observe = (name: string, callback: (...args: never[]) => unknown) => {
    events.push({ callback, name });
    return () => undefined;
  };
  const app = {
    metadataCache: { ...vault.app.metadataCache, on: observe, resolvedLinks: {} as Record<string, Record<string, number>> },
    vault: { ...vault.app.vault, on: observe },
    workspace: {
      getActiveFile: () => activeFile,
      getLeaf: () => ({ setViewState: async () => undefined, view: null }),
      getLeavesOfType: (type: string) => leaves.get(type) ?? [],
      on: observe,
      revealLeaf: async () => undefined,
    },
  };
  const createPlugin = () => {
    const plugin = new FolderNodesWithNodeGraphPlugin(app as never, {} as never);
    plugin.service = service;
    plugin.visuals = visualService;
    return plugin as unknown as FolderNodesWithNodeGraphPlugin & FakeBasePluginInstance;
  };
  const emit = (name: string, ...args: unknown[]): void => {
    for (const event of events.filter((candidate) => candidate.name === name)) {
      event.callback(...args as never[]);
    }
  };
  return {
    addCanonical, addNode, app, children, createPlugin, emit, events, leaves, removeCanonical,
    renameNote, resolveVisual, service, settings, vault, visualService,
    revealHidden: () => { showHidden = true; },
    setActiveFile: (file: TFile | null) => { activeFile = file; },
  };
}
