import { Menu, setIcon, TAbstractFile, TFile, TFolder } from "obsidian";

import FolderNodesPlugin from "./plugin";
import { FolderNodeContentsView, CONTENTS_VIEW_TYPE } from "../ui/contents-view";
import { FolderNodeGraphView, NODE_GRAPH_VIEW_TYPE } from "../ui/node-graph-view";
import { normalizeVaultPath } from "../core/paths";
import { resolvedLanguage } from "../ui/i18n";

export default class FolderNodesWithNodeGraphPlugin extends FolderNodesPlugin {
  public override async onload(): Promise<void> {
    await super.onload();
    this.registerView(NODE_GRAPH_VIEW_TYPE, (leaf) => new FolderNodeGraphView(leaf, this.service, this.visuals));
    this.addCommand({
      id: "open-node-graph",
      name: label("openGraph"),
      callback: () => void this.openNodeGraph(),
    });
    this.registerEvent(this.app.workspace.on("file-menu", (menu, entry) => this.addNodeGraphMenu(menu, entry)));
    this.registerEvent(this.app.workspace.on("layout-change", () => this.decorateContentsViews()));
    this.registerEvent(this.app.workspace.on("active-leaf-change", () => this.decorateContentsViews()));
    this.decorateContentsViews();
  }

  public override onunload(): void {
    for (const leaf of this.app.workspace.getLeavesOfType(NODE_GRAPH_VIEW_TYPE)) leaf.detach();
    const documents = new Set<Document>([this.app.workspace.rootSplit.win.document]);
    this.app.workspace.iterateAllLeaves((leaf) => documents.add(leaf.view.containerEl.ownerDocument));
    for (const document of documents) {
      document.querySelector("style[data-folder-nodes-node-graph]")?.remove();
      document.querySelector("style[data-folder-nodes-node-graph-entry]")?.remove();
    }
    super.onunload();
  }

  public override refreshVisuals(path?: string): void {
    super.refreshVisuals(path);
    for (const leaf of this.app.workspace.getLeavesOfType(NODE_GRAPH_VIEW_TYPE)) {
      if (leaf.view instanceof FolderNodeGraphView) leaf.view.refresh();
    }
  }

  private async openNodeGraph(path: string | null = null): Promise<void> {
    let leaf = this.app.workspace.getLeavesOfType(NODE_GRAPH_VIEW_TYPE)[0];
    if (leaf === undefined) {
      leaf = this.app.workspace.getLeaf(true);
      await leaf.setViewState({ type: NODE_GRAPH_VIEW_TYPE, active: true });
    }
    await this.app.workspace.revealLeaf(leaf);
    if (leaf.view instanceof FolderNodeGraphView) leaf.view.setFocus(path);
  }

  private addNodeGraphMenu(menu: Menu, entry: TAbstractFile): void {
    const folder = this.graphFolder(entry);
    if (folder === null) return;
    menu.addSeparator();
    menu.addItem((item) => item
      .setTitle(label("openInGraph"))
      .setIcon("git-fork")
      .onClick(() => void this.openNodeGraph(folder.path)));
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
      this.ensureContentsEntry(view);
      if (view.contentEl.dataset.nodeGraphObserver === "true") continue;
      view.contentEl.dataset.nodeGraphObserver = "true";
      const observer = new MutationObserver(() => this.ensureContentsEntry(view));
      observer.observe(view.contentEl, { childList: true });
      this.register(() => observer.disconnect());
    }
  }

  private ensureContentsEntry(view: FolderNodeContentsView): void {
    if (view.contentEl.querySelector(":scope > .folder-nodes-node-graph-entry") !== null) return;
    ensureEntryStyles(view.contentEl.ownerDocument);
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

function label(key: "nodeGraph" | "openGraph" | "openInGraph"): string {
  const zh = resolvedLanguage() === "zh-CN";
  if (key === "nodeGraph") return zh ? "节点图谱" : "Node Graph";
  if (key === "openInGraph") return zh ? "在节点图谱中打开" : "Open in Node Graph";
  return zh ? "打开节点图谱" : "Open Node Graph";
}

function ensureEntryStyles(document: Document): void {
  if (document.querySelector("style[data-folder-nodes-node-graph-entry]") !== null) return;
  const style = document.createElement("style");
  style.setAttribute("data-folder-nodes-node-graph-entry", "true");
  style.textContent = `
.folder-nodes-node-graph-entry{display:flex;justify-content:flex-end;padding:8px 12px 0}.folder-nodes-node-graph-entry-button{width:auto;padding-inline:8px}.folder-nodes-node-graph-entry-label{margin-inline-start:6px}
`;
  document.head.append(style);
}
