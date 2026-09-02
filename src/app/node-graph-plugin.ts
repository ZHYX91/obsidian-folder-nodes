import { Notice, setIcon, TFile, TFolder } from "obsidian";

import FolderNodesPlugin from "./plugin";
import { FolderNodeContentsView, CONTENTS_VIEW_TYPE } from "../ui/contents-view";
import { FolderNodeGraphView, NODE_GRAPH_VIEW_TYPE } from "../ui/node-graph-view";
import { isCanonicalNodeNote, normalizeVaultPath } from "../core/paths";
import type { NodeGraphScope } from "../core/node-graph-scope";
import { resolvedLanguage } from "../ui/i18n";
import type { RefreshBatch } from "./refresh-scheduler";
import { onLayoutReadyOnce } from "./layout-ready";
import { NodeGraphIndex } from "./node-graph-index";
import type { NodeAction, NodeActionSurface } from "../ui/node-actions-modal";

export default class FolderNodesWithNodeGraphPlugin extends FolderNodesPlugin {
  private nodeGraphIndex!: NodeGraphIndex;

  public override async onload(): Promise<void> {
    await super.onload();
    if (!this.pluginLifecycleActive) return;
    this.nodeGraphIndex = new NodeGraphIndex(this.app, this.service, this.visuals, this.references);
    this.registerView(NODE_GRAPH_VIEW_TYPE, (leaf) => {
      const view = new FolderNodeGraphView(leaf, this.service, {
        getSettings: () => this.settings.nodeGraph,
        getIndexSnapshot: () => this.nodeGraphIndex.snapshot(this.settings.nodeGraph),
        onNodeMenu: (event, path) => {
          const folder = path === "" ? this.app.vault.getRoot() : this.service.getFolder(path);
          if (folder !== null) this.openNodeMenu(event, folder, "graph");
        },
      });
      return view;
    });
    this.addCommand({
      id: "open-node-graph",
      name: label("openGraph"),
      checkCallback: (checking) => {
        if (!this.settings.nodeGraph.enabled) return false;
        if (!checking) void this.openNodeGraph();
        return true;
      },
    });
    this.addCommand({
      id: "open-node-graph-subtree",
      name: label("openSubtreeGraph"),
      checkCallback: (checking) => this.checkOpenCurrentNodeGraph("subtree", checking),
    });
    this.addCommand({
      id: "open-node-graph-local",
      name: label("openLocalGraph"),
      checkCallback: (checking) => this.checkOpenCurrentNodeGraph("local", checking),
    });
    this.registerEvent(this.app.workspace.on("layout-change", () => this.decorateContentsViews()));
    this.registerEvent(this.app.workspace.on("active-leaf-change", () => this.decorateContentsViews()));
    this.registerEvent(this.app.vault.on("create", (entry) => {
      if (entry instanceof TFolder) {
        this.invalidateNodeGraphStructure();
        return;
      }
      if (entry instanceof TFile && this.service.isCanonicalFile(entry)) {
        this.invalidateNodeGraphPaths([entry.path]);
      }
    }));
    this.registerEvent(this.app.vault.on("rename", (entry, oldPath) => {
      if (entry instanceof TFolder) {
        for (const leaf of this.app.workspace.getLeavesOfType(NODE_GRAPH_VIEW_TYPE)) {
          if (leaf.view instanceof FolderNodeGraphView) leaf.view.remapPathState(oldPath, entry.path);
        }
        this.invalidateNodeGraphStructure();
        return;
      }
      if (!(entry instanceof TFile)) return;
      const wasCanonical = this.nodeGraphCanonicalNotePath(oldPath);
      const isCanonical = this.service.isCanonicalFile(entry);
      if (!wasCanonical && !isCanonical) return;
      this.invalidateNodeGraphPaths([oldPath, entry.path]);
    }));
    this.registerEvent(this.app.vault.on("delete", (entry) => {
      if (entry instanceof TFolder) {
        for (const leaf of this.app.workspace.getLeavesOfType(NODE_GRAPH_VIEW_TYPE)) {
          if (leaf.view instanceof FolderNodeGraphView) leaf.view.removePathState(entry.path);
        }
        this.invalidateNodeGraphStructure();
        return;
      }
      if (!(entry instanceof TFile) || !this.nodeGraphCanonicalNotePath(entry.path)) return;
      this.removeNodeGraphPathState(this.nodeGraphFolderPathForNote(entry.path));
      this.invalidateNodeGraphPaths([entry.path]);
    }));
    this.registerEvent(this.app.metadataCache.on("resolved", () => this.nodeGraphIndex.invalidateLinks()));
    this.decorateContentsViews();
    let graphPluginActive = true;
    this.register(() => { graphPluginActive = false; });
    onLayoutReadyOnce(this.app.workspace, () => {
      if (!graphPluginActive) return;
      if (!this.settings.nodeGraph.enabled) {
        for (const leaf of this.app.workspace.getLeavesOfType(NODE_GRAPH_VIEW_TYPE)) leaf.detach();
      } else {
        this.nodeGraphIndex.invalidateLinks();
        for (const leaf of this.app.workspace.getLeavesOfType(NODE_GRAPH_VIEW_TYPE)) {
          if (leaf.view instanceof FolderNodeGraphView) leaf.view.refresh();
        }
      }
      this.decorateContentsViews();
    });
  }

  public override onunload(): void {
    for (const leaf of this.app.workspace.getLeavesOfType(NODE_GRAPH_VIEW_TYPE)) leaf.detach();
    super.onunload();
  }

  protected override refreshExtensionViews(batch: RefreshBatch): void {
    const structuralPaths = new Set([...batch.pathReasons]
      .filter(([, reasons]) => reasons.has("path"))
      .map(([path]) => path)
      .filter((path) => this.nodeGraphPathAffectsIndex(path)));
    const metadataFolderPaths = new Set([...batch.pathReasons]
      .filter(([, reasons]) => reasons.has("metadata"))
      .map(([path]) => this.nodeGraphMetadataFolderPath(path))
      .filter((path): path is string => path !== null));
    if (structuralPaths.size === 0 && metadataFolderPaths.size === 0 && !batch.reasons.has("full")) return;
    if (!this.settings.nodeGraph.enabled) {
      for (const leaf of this.app.workspace.getLeavesOfType(NODE_GRAPH_VIEW_TYPE)) leaf.detach();
      this.decorateContentsViews();
      return;
    }
    if (structuralPaths.size > 0) this.nodeGraphIndex.invalidatePaths(structuralPaths);
    if (metadataFolderPaths.size > 0 && this.nodeGraphIndex.invalidateRecordMetadata(metadataFolderPaths)) {
      this.nodeGraphIndex.invalidateLinks();
    }
    if (batch.reasons.has("full")) this.nodeGraphIndex.invalidateVisuals();
    for (const leaf of this.app.workspace.getLeavesOfType(NODE_GRAPH_VIEW_TYPE)) {
      if (leaf.view instanceof FolderNodeGraphView) leaf.view.refresh();
    }
    this.decorateContentsViews();
  }

  public override async reconcileSettingsChange(): Promise<void> {
    await super.reconcileSettingsChange();
    this.nodeGraphIndex.invalidateAll();
    if (!this.settings.nodeGraph.enabled) {
      for (const leaf of this.app.workspace.getLeavesOfType(NODE_GRAPH_VIEW_TYPE)) leaf.detach();
    }
    this.decorateContentsViews();
  }

  protected override contributeNodeActions(actions: NodeAction[], folder: TFolder, surface: NodeActionSurface): void {
    if (!this.settings.nodeGraph.enabled || surface === "graph") return;
    actions.push(
      { id: "node-graph", group: "open", icon: "git-fork", title: label("openInGraph"), run: () => this.openNodeGraph(folder.path) },
      { id: "node-graph-subtree", group: "open", icon: "git-branch", title: label("openSubtreeGraph"), run: () => this.openNodeGraph(folder.path, { mode: "subtree", rootPath: folder.path }) },
      { id: "node-graph-local", group: "open", icon: "focus", title: label("openLocalGraph"), run: () => this.openNodeGraph(folder.path, { mode: "local", rootPath: folder.path }) },
    );
  }

  private invalidateNodeGraphStructure(): void {
    this.nodeGraphIndex.invalidateAll();
    this.refreshNodeGraphViews();
  }

  private nodeGraphCanonicalNotePath(path: string): boolean {
    return normalizeVaultPath(path) === normalizeVaultPath(this.service.rootNotePath()) || isCanonicalNodeNote(path);
  }

  private nodeGraphPathAffectsIndex(path: string): boolean {
    const entry = this.app.vault.getAbstractFileByPath(path);
    if (entry instanceof TFile) return this.service.isCanonicalFile(entry);
    if (entry instanceof TFolder) return true;
    return this.nodeGraphCanonicalNotePath(path) || !path.toLocaleLowerCase().endsWith(".md");
  }

  private nodeGraphMetadataFolderPath(path: string): string | null {
    const entry = this.app.vault.getAbstractFileByPath(path);
    if (!(entry instanceof TFile) || !this.service.isCanonicalFile(entry)) return null;
    const folder = this.service.folderForFile(entry);
    return folder === null ? null : normalizeVaultPath(folder.path);
  }

  private nodeGraphFolderPathForNote(path: string): string {
    const normalized = normalizeVaultPath(path);
    if (normalized === normalizeVaultPath(this.service.rootNotePath())) return "";
    const slash = normalized.lastIndexOf("/");
    return slash < 0 ? "" : normalized.slice(0, slash);
  }

  private removeNodeGraphPathState(path: string): void {
    if (path === "") return;
    for (const leaf of this.app.workspace.getLeavesOfType(NODE_GRAPH_VIEW_TYPE)) {
      if (leaf.view instanceof FolderNodeGraphView) leaf.view.removePathState(path);
    }
  }

  private invalidateNodeGraphPaths(paths: readonly string[]): void {
    this.nodeGraphIndex.invalidatePaths(new Set(paths));
    this.refreshNodeGraphViews();
  }

  private refreshNodeGraphViews(): void {
    if (!this.settings.nodeGraph.enabled) return;
    for (const leaf of this.app.workspace.getLeavesOfType(NODE_GRAPH_VIEW_TYPE)) {
      if (leaf.view instanceof FolderNodeGraphView) leaf.view.refresh();
    }
  }

  protected async openNodeGraph(path: string | null = null, scope: NodeGraphScope = { mode: "global" }): Promise<void> {
    if (!this.settings.nodeGraph.enabled) {
      new Notice(label("graphDisabled"));
      return;
    }
    let leaf = this.app.workspace.getLeavesOfType(NODE_GRAPH_VIEW_TYPE)[0];
    if (leaf === undefined) {
      leaf = this.app.workspace.getLeaf(true);
      await leaf.setViewState({ type: NODE_GRAPH_VIEW_TYPE, active: true });
    }
    await this.app.workspace.revealLeaf(leaf);
    if (leaf.view instanceof FolderNodeGraphView) {
      leaf.view.setGraphScope(scope);
      leaf.view.setFocus(path);
    }
  }

  private async openCurrentNodeGraph(mode: "local" | "subtree"): Promise<void> {
    const folder = this.currentGraphFolder();
    if (folder === null) {
      new Notice(label("noGraphNode"));
      return;
    }
    await this.openNodeGraph(folder.path, { mode, rootPath: folder.path });
  }

  private checkOpenCurrentNodeGraph(mode: "local" | "subtree", checking: boolean): boolean {
    if (!this.settings.nodeGraph.enabled) return false;
    const folder = this.currentGraphFolder();
    if (folder === null) return false;
    if (!checking) void this.openCurrentNodeGraph(mode);
    return true;
  }

  private graphFolder(entry: TFile | TFolder): TFolder | null {
    if (entry instanceof TFolder) {
      return this.graphFolderIsEligible(entry) ? entry : null;
    }
    if (!(entry instanceof TFile) || !this.service.isCanonicalFile(entry)) return null;
    const folder = this.service.folderForFile(entry);
    return folder !== null && this.graphFolderIsEligible(folder) ? folder : null;
  }

  private currentGraphFolder(): TFolder | null {
    const active = this.app.workspace.getActiveFile();
    return active === null ? null : this.graphFolder(active);
  }

  private graphFolderIsEligible(folder: TFolder): boolean {
    const path = normalizeVaultPath(folder.path);
    return path === "" || (!this.service.isIgnoredPath(path) && this.service.getCanonicalFile(path) !== null);
  }

  private decorateContentsViews(): void {
    for (const leaf of this.app.workspace.getLeavesOfType(CONTENTS_VIEW_TYPE)) {
      if (!(leaf.view instanceof FolderNodeContentsView)) continue;
      const view = leaf.view;
      view.setRenderExtension("node-graph", () => this.ensureContentsEntry(view));
    }
  }

  private ensureContentsEntry(view: FolderNodeContentsView): void {
    const existing = view.contentEl.querySelector<HTMLElement>(":scope > .folder-nodes-node-graph-entry");
    if (!this.settings.nodeGraph.enabled) {
      existing?.remove();
      return;
    }
    if (existing !== null) return;
    const entry = view.contentEl.ownerDocument.createElement("div");
    entry.className = "folder-nodes-node-graph-entry";
    const button = entry.createEl("button", {
      cls: "clickable-icon folder-nodes-node-graph-entry-button",
      attr: { "aria-label": label("openGraph") },
    });
    setIcon(button, "git-fork");
    button.createSpan({ cls: "folder-nodes-node-graph-entry-label", text: label("nodeGraph") });
    button.addEventListener("click", () => {
      const active = this.app.workspace.getActiveFile();
      const folder = active === null ? null : this.service.folderForFile(active);
      const focus = folder !== null && this.graphFolderIsEligible(folder)
        ? normalizeVaultPath(folder.path)
        : null;
      void this.openNodeGraph(focus);
    });
    view.contentEl.prepend(entry);
  }
}

function label(
  key: "graphDisabled" | "noGraphNode" | "nodeGraph" | "openGraph" | "openInGraph" | "openLocalGraph" | "openSubtreeGraph",
): string {
  const zh = resolvedLanguage() === "zh-CN";
  if (key === "nodeGraph") return zh ? "节点图谱" : "Node Graph";
  if (key === "openInGraph") return zh ? "在节点图谱中打开" : "Open in Node Graph";
  if (key === "openSubtreeGraph") return zh ? "打开此节点的子图谱" : "Open subtree Node Graph";
  if (key === "openLocalGraph") return zh ? "打开此节点的局部图谱" : "Open local Node Graph";
  if (key === "graphDisabled") return zh ? "节点图谱已在设置中关闭。" : "Node Graph is disabled in settings.";
  if (key === "noGraphNode") return zh ? "当前笔记不属于可显示的 Folder Node。" : "The current note is not in a visible Folder Node.";
  return zh ? "打开节点图谱" : "Open Node Graph";
}
