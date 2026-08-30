import { Menu, Notice, setIcon, TAbstractFile, TFile, TFolder } from "obsidian";

import NODE_GRAPH_STYLES from "../ui/node-graph.css";
import FolderNodesPlugin from "./plugin";
import { FolderNodeContentsView, CONTENTS_VIEW_TYPE } from "../ui/contents-view";
import { PolishedFolderNodeGraphView } from "../ui/node-graph-polish-view";
import { FolderNodeGraphView, NODE_GRAPH_VIEW_TYPE } from "../ui/node-graph-view";
import { normalizeVaultPath } from "../core/paths";
import { isWithin, nodeGraphPathIsConfigured, type NodeGraphScope } from "../core/node-graph-scope";
import { resolvedLanguage } from "../ui/i18n";
import { RuntimeStyles } from "../ui/runtime-styles";
import type { RefreshBatch } from "./refresh-scheduler";
import { onLayoutReadyOnce } from "./layout-ready";

export default class FolderNodesWithNodeGraphPlugin extends FolderNodesPlugin {
  private readonly nodeGraphStyles = new RuntimeStyles(NODE_GRAPH_STYLES);

  public override async onload(): Promise<void> {
    await super.onload();
    this.registerView(NODE_GRAPH_VIEW_TYPE, (leaf) => {
      const view = new PolishedFolderNodeGraphView(leaf, this.service, this.visuals, {
        getSettings: () => this.settings.nodeGraph,
        getInboundSources: (targetPath) => this.references.sourcesForTarget(targetPath),
      });
      this.nodeGraphStyles.install(view.containerEl.ownerDocument);
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
    this.registerEvent(this.app.workspace.on("file-menu", (menu, entry) => this.addNodeGraphMenu(menu, entry)));
    this.registerEvent(this.app.workspace.on("layout-change", () => this.decorateContentsViews()));
    this.registerEvent(this.app.workspace.on("active-leaf-change", () => this.decorateContentsViews()));
    this.registerEvent(this.app.workspace.on("window-open", (_workspaceWindow, window) => this.nodeGraphStyles.install(window.document)));
    this.nodeGraphStyles.install(this.app.workspace.rootSplit.win.document);
    this.decorateContentsViews();
    let graphPluginActive = true;
    this.register(() => { graphPluginActive = false; });
    onLayoutReadyOnce(this.app.workspace, () => {
      if (!graphPluginActive) return;
      if (!this.settings.nodeGraph.enabled) {
        for (const leaf of this.app.workspace.getLeavesOfType(NODE_GRAPH_VIEW_TYPE)) leaf.detach();
      }
      this.decorateContentsViews();
    });
  }

  public override onunload(): void {
    for (const leaf of this.app.workspace.getLeavesOfType(NODE_GRAPH_VIEW_TYPE)) leaf.detach();
    this.nodeGraphStyles.removeAll();
    super.onunload();
  }

  protected override refreshExtensionViews(batch: RefreshBatch): void {
    void batch;
    if (!this.settings.nodeGraph.enabled) {
      for (const leaf of this.app.workspace.getLeavesOfType(NODE_GRAPH_VIEW_TYPE)) leaf.detach();
      this.decorateContentsViews();
      return;
    }
    for (const leaf of this.app.workspace.getLeavesOfType(NODE_GRAPH_VIEW_TYPE)) {
      if (leaf.view instanceof FolderNodeGraphView) leaf.view.refresh();
    }
    this.decorateContentsViews();
  }

  public override async reconcileSettingsChange(): Promise<void> {
    await super.reconcileSettingsChange();
    if (!this.settings.nodeGraph.enabled) {
      for (const leaf of this.app.workspace.getLeavesOfType(NODE_GRAPH_VIEW_TYPE)) leaf.detach();
    }
    this.decorateContentsViews();
  }

  protected override addOwnedNodeMenuItems(menu: Menu, folder: TFolder): void {
    this.addNodeGraphItem(menu, folder);
  }

  private async openNodeGraph(path: string | null = null, scope: NodeGraphScope = { mode: "global" }): Promise<void> {
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
    const active = this.app.workspace.getActiveFile();
    const folder = active === null ? null : this.service.folderForFile(active);
    if (folder === null || !nodeGraphPathIsConfigured(folder.path, this.settings.nodeGraph)) {
      new Notice(label("noGraphNode"));
      return;
    }
    await this.openNodeGraph(folder.path, { mode, rootPath: folder.path });
  }

  private checkOpenCurrentNodeGraph(mode: "local" | "subtree", checking: boolean): boolean {
    if (!this.settings.nodeGraph.enabled) return false;
    const active = this.app.workspace.getActiveFile();
    const folder = active === null ? null : this.service.folderForFile(active);
    if (folder === null || !nodeGraphPathIsConfigured(folder.path, this.settings.nodeGraph)) return false;
    if (!checking) void this.openCurrentNodeGraph(mode);
    return true;
  }

  private addNodeGraphMenu(menu: Menu, entry: TAbstractFile): void {
    if (!this.settings.nodeGraph.enabled) return;
    const folder = this.graphFolder(entry);
    if (folder === null) return;
    menu.addSeparator();
    this.addNodeGraphItem(menu, folder);
  }

  private addNodeGraphItem(menu: Menu, folder: TFolder): void {
    if (!this.settings.nodeGraph.enabled) return;
    const path = normalizeVaultPath(folder.path);
    const configured = nodeGraphPathIsConfigured(path, this.settings.nodeGraph);
    menu.addItem((item) => item
      .setTitle(label("openInGraph"))
      .setIcon("git-fork")
      .setDisabled(!configured)
      .onClick(() => void this.openNodeGraph(folder.path)));
    menu.addItem((item) => item
      .setTitle(label("openSubtreeGraph"))
      .setIcon("git-branch")
      .setDisabled(!configured)
      .onClick(() => void this.openNodeGraph(folder.path, { mode: "subtree", rootPath: folder.path })));
    menu.addItem((item) => item
      .setTitle(label("openLocalGraph"))
      .setIcon("focus")
      .setDisabled(!configured)
      .onClick(() => void this.openNodeGraph(folder.path, { mode: "local", rootPath: folder.path })));
    if (path === "") return;
    const hidden = this.settings.nodeGraph.excludedNodes.includes(path);
    const hiddenSubtree = this.settings.nodeGraph.excludedSubtrees.includes(path);
    const hiddenByParent = this.settings.nodeGraph.excludedSubtrees.some((root) => root !== path && isWithin(path, root));
    const outsideIncludedScope = this.settings.nodeGraph.includedSubtrees.length > 0
      && !this.settings.nodeGraph.includedSubtrees.some((root) => isWithin(path, root));
    menu.addSeparator();
    if (hidden || hiddenSubtree) {
      menu.addItem((item) => item
        .setTitle(label("restoreGraphNode"))
        .setIcon("eye")
        .onClick(() => void this.updateGraphExclusion(path, "restore")));
      return;
    }
    if (hiddenByParent) {
      menu.addItem((item) => item
        .setTitle(label("hiddenByParent"))
        .setIcon("eye-off")
        .setDisabled(true));
      return;
    }
    if (outsideIncludedScope) {
      menu.addItem((item) => item
        .setTitle(label("includeGraphSubtree"))
        .setIcon("list-tree")
        .onClick(() => void this.includeGraphSubtree(path)));
      return;
    }
    menu.addItem((item) => item
      .setTitle(label("hideGraphNode"))
      .setIcon("eye-off")
      .onClick(() => void this.updateGraphExclusion(path, "node")));
    menu.addItem((item) => item
      .setTitle(label("hideGraphSubtree"))
      .setIcon("folder-x")
      .onClick(() => void this.updateGraphExclusion(path, "subtree")));
  }

  private async includeGraphSubtree(path: string): Promise<void> {
    const included = this.settings.nodeGraph.includedSubtrees;
    if (!included.includes(path)) included.push(path);
    included.sort((left, right) => left.localeCompare(right, "en"));
    await this.saveSettings();
    await this.reconcileSettingsChange();
  }

  private async updateGraphExclusion(path: string, action: "node" | "restore" | "subtree"): Promise<void> {
    const settings = this.settings.nodeGraph;
    settings.excludedNodes = settings.excludedNodes.filter((candidate) => candidate !== path);
    settings.excludedSubtrees = settings.excludedSubtrees.filter((candidate) => candidate !== path);
    if (action === "node") settings.excludedNodes.push(path);
    if (action === "subtree") settings.excludedSubtrees.push(path);
    settings.excludedNodes.sort((left, right) => left.localeCompare(right, "en"));
    settings.excludedSubtrees.sort((left, right) => left.localeCompare(right, "en"));
    await this.saveSettings();
    await this.reconcileSettingsChange();
  }

  private graphFolder(entry: TAbstractFile): TFolder | null {
    if (entry instanceof TFolder) {
      if (this.service.isIgnoredPath(entry.path) || this.service.getCanonicalFile(entry.path) === null) return null;
      return entry;
    }
    if (!(entry instanceof TFile) || !this.service.isCanonicalFile(entry)) return null;
    const folder = this.service.folderForFile(entry);
    if (folder === null || this.service.isIgnoredPath(folder.path)) return null;
    return folder;
  }

  private decorateContentsViews(): void {
    for (const leaf of this.app.workspace.getLeavesOfType(CONTENTS_VIEW_TYPE)) {
      if (!(leaf.view instanceof FolderNodeContentsView)) continue;
      const view = leaf.view;
      this.nodeGraphStyles.install(view.contentEl.ownerDocument);
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
      const focus = folder !== null && !this.service.isIgnoredPath(folder.path) && this.service.getCanonicalFile(folder.path) !== null
        ? normalizeVaultPath(folder.path)
        : null;
      void this.openNodeGraph(focus);
    });
    view.contentEl.prepend(entry);
  }
}

function label(
  key: "graphDisabled" | "hiddenByParent" | "hideGraphNode" | "hideGraphSubtree" | "includeGraphSubtree" | "noGraphNode" | "nodeGraph" | "openGraph" | "openInGraph" | "openLocalGraph" | "openSubtreeGraph" | "restoreGraphNode",
): string {
  const zh = resolvedLanguage() === "zh-CN";
  if (key === "nodeGraph") return zh ? "节点图谱" : "Node Graph";
  if (key === "openInGraph") return zh ? "在节点图谱中打开" : "Open in Node Graph";
  if (key === "openSubtreeGraph") return zh ? "打开此节点的子图谱" : "Open subtree Node Graph";
  if (key === "openLocalGraph") return zh ? "打开此节点的局部图谱" : "Open local Node Graph";
  if (key === "hideGraphNode") return zh ? "从节点图谱隐藏" : "Hide from Node Graph";
  if (key === "hideGraphSubtree") return zh ? "从节点图谱隐藏整个子树" : "Hide subtree from Node Graph";
  if (key === "hiddenByParent") return zh ? "已由上级子树规则隐藏" : "Hidden by a parent subtree rule";
  if (key === "includeGraphSubtree") return zh ? "将此子树加入节点图谱范围" : "Include subtree in Node Graph";
  if (key === "restoreGraphNode") return zh ? "恢复到节点图谱" : "Restore to Node Graph";
  if (key === "graphDisabled") return zh ? "节点图谱已在设置中关闭。" : "Node Graph is disabled in settings.";
  if (key === "noGraphNode") return zh ? "当前笔记不属于可显示的 Folder Node。" : "The current note is not in a visible Folder Node.";
  return zh ? "打开节点图谱" : "Open Node Graph";
}
