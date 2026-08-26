import { type Editor, ItemView, Notice, setIcon, TAbstractFile, TFile, TFolder, WorkspaceLeaf } from "obsidian";

import {
  breadcrumbItems,
  contentDragPolicy,
  type ContentLinkItem,
  formatContentLinks,
  filesSectionKey,
  isContextMenuKey,
  nodeEntryVisual,
  selectionRange,
  siblingDropAxis,
  siblingDropZone,
  type SiblingDropAxis,
} from "./contents-interactions";
import { t } from "./i18n";
import { dirname, isCanonicalNodeNote, normalizeVaultPath } from "../core/paths";
import type { ChildOrderRecord, NodeVisual } from "../core/types";
import { renderVisual } from "../presentation/render-visual";
import type { ReferenceIndex } from "../core/reference-index";

const IMAGE_EXTENSIONS = new Set(["avif", "bmp", "gif", "heic", "heif", "jpeg", "jpg", "png", "svg", "webp"]);
const VIDEO_EXTENSIONS = new Set(["m4v", "mkv", "mov", "mp4", "webm"]);
const FILE_ICONS: Record<string, string> = {
  md: "file-text", pdf: "file-text", mp3: "audio-lines", m4a: "audio-lines", ogg: "audio-lines",
  opus: "audio-lines", wav: "audio-lines", flac: "audio-lines", heic: "image", heif: "image",
};

interface ContentsService {
  getFolder(path: string): TFolder | null;
  getFile(path: string): TFile | null;
  getCanonicalFile(folderPath: string): TFile | null;
  isCanonicalFile(file: TFile): boolean;
  notePathForFolder(path: string): string;
  isIgnoredPath(path: string): boolean;
  isIgnoredRootPath(path: string): boolean;
  isLeafNoteExempt(path: string): boolean;
  children(path: string): ChildOrderRecord[];
  openFolderNode(path: string, newLeaf?: boolean): Promise<void>;
  placeNode(folder: TFolder, targetParentPath: string, targetIndex: number): Promise<TFolder>;
  moveFile(file: TFile, targetFolderPath: string): Promise<void>;
}

interface ContentsVisuals { resolve(folder: TFolder): NodeVisual; }

export type ContentsMenuAnchor = MouseEvent | HTMLElement;

interface ContentsActions {
  createChild(folder: TFolder): void;
  createMissingNote(folder: TFolder): void;
  nodeMenu(anchor: ContentsMenuAnchor, folder: TFolder): void;
  entryMenu(anchor: ContentsMenuAnchor, entry: TAbstractFile, sourceFolder: TFolder): void;
  problemMenu(anchor: ContentsMenuAnchor, entry: TFolder | TFile): void;
  editVisual(folder: TFolder): void;
  openHomepage(): void;
  homepageEnabled(): boolean;
  refresh(): void;
  reportError(error: unknown): void;
}

type NodeEntry =
  | { kind: "healthy" | "incomplete"; entry: TFolder }
  | { kind: "conflict" | "missing-folder"; entry: TFile };
type ContentsSection = "album" | "files" | "nodes";

export const CONTENTS_VIEW_TYPE = "folder-nodes-contents";

export class FolderNodeContentsView extends ItemView {
  private folderPath = "";
  private visibleLimits: Record<ContentsSection, number> = { album: 200, files: 200, nodes: 200 };
  private selectionMode = false;
  private selectedContent = new Map<string, "file" | "media">();
  private selectionAnchor: string | null = null;
  private selectableOrder: string[] = [];
  private selectableKinds = new Map<string, "file" | "media">();
  private selectionPositions = new Map<string, number>();
  private lastEditor: { editor: Editor; file: TFile } | null = null;
  private draggedNodePath: string | null = null;
  private draggedContentPath: string | null = null;
  private draggedSource: HTMLElement | null = null;
  private dropTarget: HTMLElement | null = null;
  private contentDropTarget: HTMLElement | null = null;
  private readonly pendingImages = new Set<HTMLImageElement>();

  public constructor(
    leaf: WorkspaceLeaf,
    private readonly service: ContentsService,
    private readonly visuals: ContentsVisuals,
    private readonly references: ReferenceIndex,
    private readonly actions: ContentsActions,
  ) {
    super(leaf);
    this.registerDomEvent(this.containerEl.ownerDocument, "keydown", (event) => {
      if (event.key !== "Escape") return;
      if (this.selectionMode) this.finishSelection();
      else this.clearAllDrag();
    });
  }

  public override getViewType(): string { return CONTENTS_VIEW_TYPE; }
  public override getDisplayText(): string { return t("nodeContents"); }
  public override getIcon(): string { return "layout-grid"; }

  public setFolder(path: string): void {
    const normalized = normalizeVaultPath(path);
    if (normalizeVaultPath(this.folderPath) !== normalized) this.finishSelection(false);
    this.clearAllDrag();
    this.folderPath = normalized;
    this.visibleLimits = { album: 200, files: 200, nodes: 200 };
    this.render();
  }

  public refresh(paths?: ReadonlySet<string>): void {
    if (paths !== undefined && !this.isAffected(paths)) return;
    this.render();
  }
  public override async onOpen(): Promise<void> { this.render(); }
  public override async onClose(): Promise<void> {
    this.cancelPendingImages();
    this.clearAllDrag();
  }

  private render(): void {
    this.cancelPendingImages();
    this.clearAllDrag();
    this.captureActiveEditor();
    const container = this.contentEl;
    container.empty();
    container.addClass("folder-nodes-contents");
    const folder = normalizeVaultPath(this.folderPath) === "" ? this.app.vault.getRoot() : this.service.getFolder(this.folderPath);
    if (folder === null) {
      container.createEl("p", { cls: "setting-item-description", text: t("noCurrentNode") });
      return;
    }
    const folderPath = normalizeVaultPath(folder.path);
    const currentIgnored = this.service.isIgnoredPath(folderPath);
    const childFolders = folder.children.filter((entry): entry is TFolder => entry instanceof TFolder);
    const childOrder = new Map(this.service.children(folderPath).map(({ childPath }, index) => [childPath, index]));
    const managedFolders = (currentIgnored ? [] : childFolders.filter((entry) => !this.service.isIgnoredPath(entry.path)))
      .sort((a, b) => (childOrder.get(a.path) ?? Number.MAX_SAFE_INTEGER) - (childOrder.get(b.path) ?? Number.MAX_SAFE_INTEGER));
    const nodeEntries: NodeEntry[] = managedFolders.map((entry) => ({
      kind: this.service.getCanonicalFile(entry.path) === null ? "incomplete" : "healthy",
      entry,
    }));
    const directFiles = folder.children.filter((entry): entry is TFile => entry instanceof TFile && !this.service.isCanonicalFile(entry));
    const pendingNotes = currentIgnored ? [] : directFiles.filter((entry) => {
      if (entry.extension.toLocaleLowerCase() !== "md" || this.service.isLeafNoteExempt(entry.path)) return false;
      const targetPath = folderPath === "" ? entry.basename : `${folderPath}/${entry.basename}`;
      const targetFolder = this.service.getFolder(targetPath);
      return targetFolder !== null && this.service.getCanonicalFile(targetFolder.path) !== null;
    });
    nodeEntries.push(...pendingNotes.map((entry): NodeEntry => {
      const targetPath = folderPath === "" ? entry.basename : `${folderPath}/${entry.basename}`;
      const targetFolder = this.service.getFolder(targetPath);
      return { kind: targetFolder === null ? "missing-folder" : "conflict", entry };
    }));
    const album = directFiles.filter((entry) => this.isAlbumEntry(entry));
    const pendingPaths = new Set(pendingNotes.map((entry) => entry.path));
    const ordinaryFiles: (TFile | TFolder)[] = [
      ...childFolders.filter((entry) => currentIgnored || this.service.isIgnoredPath(entry.path)),
      ...directFiles.filter((entry) => !this.isAlbumEntry(entry) && !pendingPaths.has(entry.path)),
    ].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }));
    this.selectableKinds = new Map([
      ...album.map((entry): [string, "media"] => [entry.path, "media"]),
      ...ordinaryFiles.filter((entry): entry is TFile => entry instanceof TFile).map((entry): [string, "file"] => [entry.path, "file"]),
    ]);
    this.selectableOrder = [...this.selectableKinds.keys()];
    const selectable = new Set(this.selectableOrder);
    for (const path of this.selectedContent.keys()) if (!selectable.has(path)) this.selectedContent.delete(path);
    this.selectionPositions = new Map([...this.selectedContent.keys()].map((path, index) => [path, index]));
    this.renderBreadcrumb(container, folder);
    this.renderHeader(container, folder, this.selectableOrder.length > 0);
    if (this.selectionMode) this.renderSelectionToolbar(container);
    this.renderNodes(container, nodeEntries, folderPath);
    this.renderAlbum(container, album);
    this.renderFiles(container, ordinaryFiles);
  }

  private renderBreadcrumb(container: HTMLElement, folder: TFolder): void {
    const breadcrumb = container.createDiv({ cls: "folder-nodes-breadcrumb", attr: { "aria-label": t("nodePath") } });
    const folderPath = normalizeVaultPath(folder.path);
    const items = breadcrumbItems(this.app.vault.getName(), folderPath);
    for (const [index, item] of items.entries()) {
      if (index > 0) breadcrumb.createSpan({ cls: "folder-nodes-breadcrumb-separator", text: "/", attr: { "aria-hidden": "true" } });
      if (item.current) {
        const current = breadcrumb.createSpan({
          cls: "folder-nodes-breadcrumb-current",
          text: item.label,
          attr: { "aria-current": "page" },
        });
        this.bindContentDropTarget(current, item.path);
        continue;
      }
      const button = breadcrumb.createEl("button", { text: item.label });
      button.addEventListener("click", () => this.setFolder(item.path));
      this.bindContentDropTarget(button, item.path);
    }
  }

  private renderHeader(container: HTMLElement, folder: TFolder, hasSelectableContent: boolean): void {
    const header = container.createDiv({ cls: "folder-nodes-contents-header" });
    const folderPath = normalizeVaultPath(folder.path);
    const managedNode = !this.service.isIgnoredPath(folderPath) && this.service.getCanonicalFile(folderPath) !== null;
    const identity = managedNode
      ? header.createEl("button", { cls: "folder-nodes-current", attr: { "aria-label": t("openCurrentNodeNote") } })
      : header.createDiv({ cls: "folder-nodes-current" });
    this.bindContentDropTarget(identity, folderPath);
    const resolved = managedNode ? this.visuals.resolve(folder) : null;
    if (resolved !== null && resolved.kind !== "fallback") {
      const visual = identity.createSpan({ cls: "folder-nodes-current-visual" });
      renderVisual(visual, resolved, folderPath === "" ? this.app.vault.getName() : folder.name);
    }
    const title = identity.createSpan({ cls: "folder-nodes-current-title", text: folderPath === "" ? this.app.vault.getName() : folder.name });
    title.setAttr("title", folderPath);
    if (!managedNode && !this.service.isIgnoredPath(folderPath)) title.createSpan({ cls: "folder-nodes-status-badge is-incomplete", text: t("incompleteNode") });
    else if (!managedNode && this.service.isIgnoredRootPath(folderPath)) title.createSpan({ cls: "folder-nodes-status-badge is-unmanaged", text: t("unmanaged") });
    if (managedNode) identity.addEventListener("click", (event) => {
      const mouseEvent = event as MouseEvent;
      this.runAction(this.service.openFolderNode(folderPath, mouseEvent.ctrlKey || mouseEvent.metaKey));
    });
    const actions = header.createDiv({ cls: "folder-nodes-header-actions" });
    if (this.actions.homepageEnabled()) {
      const homepage = actions.createEl("button", { cls: "clickable-icon", attr: { "aria-label": t("openHomepage") } });
      setIcon(homepage, "home");
      homepage.addEventListener("click", () => this.actions.openHomepage());
    }
    if (hasSelectableContent) {
      const select = actions.createEl("button", {
        cls: `clickable-icon${this.selectionMode ? " is-active" : ""}`,
        attr: { "aria-label": this.selectionMode ? t("finishSelection") : t("selectContent"), "aria-pressed": String(this.selectionMode) },
      });
      setIcon(select, this.selectionMode ? "check" : "list-checks");
      select.addEventListener("click", () => this.selectionMode ? this.finishSelection() : this.startSelection());
    }
    if (managedNode) {
      const open = actions.createEl("button", { cls: "clickable-icon", attr: { "aria-label": t("openCurrentNodeNote") } });
      setIcon(open, "file-text");
      open.addEventListener("click", (event) => this.runAction(this.service.openFolderNode(folderPath, event.ctrlKey || event.metaKey)));
      const visual = actions.createEl("button", { cls: "clickable-icon", attr: { "aria-label": t("editVisual") } });
      setIcon(visual, "palette");
      visual.addEventListener("click", () => this.actions.editVisual(folder));
      const create = actions.createEl("button", { cls: "clickable-icon", attr: { "aria-label": t("createChild") } });
      setIcon(create, "folder-plus");
      create.addEventListener("click", () => this.actions.createChild(folder));
    } else if (!this.service.isIgnoredPath(folderPath)) {
      const create = actions.createEl("button", { cls: "clickable-icon", attr: { "aria-label": t("createMissingNodeNote") } });
      setIcon(create, "file-plus");
      create.addEventListener("click", () => this.actions.createMissingNote(folder));
    }
  }

  private renderNodes(container: HTMLElement, entries: readonly NodeEntry[], parentPath: string): void {
    const problems = entries.filter((entry) => entry.kind === "conflict" || entry.kind === "missing-folder").length;
    const label = problems === 0 ? `${t("nodes")} (${entries.length})` : `${t("nodes")} (${entries.length}) · ${t("needsRepair")} ${problems}`;
    const section = this.section(container, label);
    const grid = section.createDiv({ cls: "folder-nodes-node-grid" });
    for (const item of entries.slice(0, this.visibleLimits.nodes)) {
      const entry = item.entry;
      const resolved = item.kind === "healthy" && entry instanceof TFolder ? this.visuals.resolve(entry) : null;
      const presentation = nodeEntryVisual(item.kind, resolved);
      const problemLabel = item.kind === "incomplete" ? t("missingNodeNote") : item.kind === "conflict" ? t("nodeConflict") : t("missingNodeFolder");
      const shell = grid.createDiv({ cls: `folder-nodes-entry-shell folder-nodes-node-shell${item.kind === "conflict" || item.kind === "missing-folder" ? " is-problem" : ""}` });
      const card = shell.createEl("button", { cls: "folder-nodes-node-card" });
      if (item.kind !== "healthy") {
        card.setAttr("aria-label", `${entry.name} · ${problemLabel}`);
        card.setAttr("title", problemLabel);
      }
      const preview = card.createSpan({
        cls: `folder-nodes-node-visual${presentation.defaultVisual ? " is-default" : ""}${presentation.warning ? " is-warning" : ""}${item.kind === "incomplete" ? " is-missing-note" : ""}`,
      });
      renderVisual(preview, presentation.visual, entry.name);
      card.createSpan({ cls: "folder-nodes-card-title", text: entry instanceof TFile ? entry.basename : entry.name, attr: { title: entry.name } });
      card.addEventListener("click", (event) => {
        if (item.kind === "healthy" && entry instanceof TFolder) this.runAction(this.service.openFolderNode(entry.path, event.ctrlKey || event.metaKey));
        else if (entry instanceof TFolder) this.setFolder(entry.path);
        else this.runAction(this.app.workspace.getLeaf(event.ctrlKey || event.metaKey).openFile(entry));
      });
      if (item.kind === "healthy" && entry instanceof TFolder) {
        this.bindContentDropTarget(card, entry.path);
        this.bindMenu(shell, card, entry, (anchor) => this.actions.nodeMenu(anchor, entry));
        const handle = shell.createEl("button", {
          cls: "folder-nodes-node-drag-handle clickable-icon",
          attr: { "aria-label": t("reorderNode", { name: entry.name }), draggable: "true" },
        });
        setIcon(handle, "grip-vertical");
        handle.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
        });
        this.bindNodeReorderSource(handle, shell, entry.path);
        this.bindNodeReorderTarget(shell, entry, parentPath);
      } else {
        this.bindMenu(shell, card, entry, (anchor) => this.actions.problemMenu(anchor, entry));
      }
    }
    this.more(section, entries.length, "nodes");
  }

  private renderAlbum(container: HTMLElement, entries: readonly TFile[]): void {
    const section = this.section(container, `${t("album")} (${entries.length})`);
    const grid = section.createDiv({ cls: "folder-nodes-album-grid" });
    for (const entry of entries.slice(0, this.visibleLimits.album)) {
      const extension = entry.extension.toLocaleLowerCase();
      const shell = grid.createDiv({ cls: "folder-nodes-entry-shell folder-nodes-album-shell" });
      const selected = this.selectedContent.has(entry.path);
      const card = shell.createEl("button", {
        cls: `folder-nodes-album-card${selected ? " is-selected" : ""}`,
        attr: { "aria-label": entry.name },
      });
      if (this.selectionMode) card.setAttr("aria-pressed", String(selected));
      const preview = card.createSpan({ cls: "folder-nodes-album-preview" });
      if (IMAGE_EXTENSIONS.has(extension)) {
        this.renderStaticImage(entry, preview);
        if (extension === "gif") preview.createSpan({ cls: "folder-nodes-media-badge", text: "GIF" });
      } else {
        const icon = preview.createSpan({ cls: "folder-nodes-video-placeholder" });
        setIcon(icon, "video");
        preview.createSpan({ cls: "folder-nodes-media-badge", text: extension.toLocaleUpperCase() || t("video") });
      }
      if (!this.references.isReferenced(entry.path)) {
        const marker = preview.createSpan({
          cls: "folder-nodes-unreferenced-marker",
          attr: { "aria-label": t("unreferenced"), title: t("unreferenced") },
        });
        setIcon(marker, "link-2-off");
      }
      if (this.selectionMode) this.renderSelectionIndicator(preview, entry.path);
      card.createSpan({ cls: "folder-nodes-album-title", text: entry.basename, attr: { title: entry.name } });
      card.addEventListener("click", (event) => {
        if (this.selectionMode) this.toggleSelection(entry.path, "media", event.shiftKey);
        else this.runAction(this.app.workspace.getLeaf(event.ctrlKey || event.metaKey).openFile(entry));
      });
      const sourceFolder = entry.parent ?? this.app.vault.getRoot();
      this.bindMenu(shell, card, entry, (anchor) => this.actions.entryMenu(anchor, entry, sourceFolder));
      this.bindContentDragSource(card, entry, "media");
    }
    this.more(section, entries.length, "album");
  }

  private renderFiles(container: HTMLElement, entries: readonly (TFile | TFolder)[]): void {
    const hasFolders = entries.some((entry) => entry instanceof TFolder);
    const section = this.section(container, `${t(filesSectionKey(hasFolders))} (${entries.length})`);
    const list = section.createDiv({ cls: "folder-nodes-file-list" });
    for (const entry of entries.slice(0, this.visibleLimits.files)) {
      const shell = list.createDiv({ cls: "folder-nodes-entry-shell folder-nodes-file-shell" });
      const selected = entry instanceof TFile && this.selectedContent.has(entry.path);
      const row = shell.createEl("button", {
        cls: `folder-nodes-file-row${selected ? " is-selected" : ""}`,
      });
      if (this.selectionMode && entry instanceof TFile) row.setAttr("aria-pressed", String(selected));
      if (this.selectionMode && entry instanceof TFile) this.renderSelectionIndicator(row, entry.path);
      const icon = row.createSpan({ cls: "folder-nodes-file-icon" });
      if (entry instanceof TFolder) setIcon(icon, "folder");
      else setIcon(icon, FILE_ICONS[entry.extension.toLocaleLowerCase()] ?? "file");
      row.createSpan({ cls: "folder-nodes-file-name", text: entry.name, attr: { title: entry.name } });
      if (entry instanceof TFolder && this.service.isIgnoredRootPath(entry.path)) row.createSpan({ cls: "folder-nodes-status-badge is-unmanaged", text: t("unmanaged") });
      if (entry instanceof TFile && !this.service.isIgnoredPath(entry.parent?.path ?? "") && this.service.isLeafNoteExempt(entry.path)) row.createSpan({ cls: "folder-nodes-status-badge is-unmanaged", text: t("unmanaged") });
      else if (entry instanceof TFile && entry.extension.toLocaleLowerCase() === "md" && !this.service.isIgnoredPath(entry.parent?.path ?? "")) {
        row.createSpan({ cls: "folder-nodes-status-badge is-incomplete", text: t("incompleteNode") });
      }
      if (entry instanceof TFolder) row.createSpan({ cls: "folder-nodes-file-extension", text: t("folderType") });
      if (entry instanceof TFile && entry.extension !== "") row.createSpan({ cls: "folder-nodes-file-extension", text: entry.extension.toLocaleUpperCase() });
      if (entry instanceof TFile && !this.references.isReferenced(entry.path)) {
        const marker = row.createSpan({
          cls: "folder-nodes-unreferenced-file",
          attr: { "aria-label": t("unreferenced"), title: t("unreferenced") },
        });
        setIcon(marker, "link-2-off");
      }
      row.addEventListener("click", (event) => {
        if (entry instanceof TFolder) this.setFolder(entry.path);
        else if (this.selectionMode) this.toggleSelection(entry.path, "file", event.shiftKey);
        else this.runAction(this.app.workspace.getLeaf(event.ctrlKey || event.metaKey).openFile(entry));
      });
      this.bindMenu(shell, row, entry, (anchor) => this.actions.entryMenu(anchor, entry, folderForEntry(entry, this.app.vault.getRoot())));
      if (entry instanceof TFile) this.bindContentDragSource(row, entry, "file");
    }
    this.more(section, entries.length, "files");
  }

  private isAlbumEntry(file: TFile): boolean {
    const extension = file.extension.toLocaleLowerCase();
    return IMAGE_EXTENSIONS.has(extension) || VIDEO_EXTENSIONS.has(extension);
  }

  private renderStaticImage(file: TFile, preview: HTMLElement): void {
    const canvas = preview.createEl("canvas", { attr: { role: "img", "aria-label": file.basename } });
    const ImageConstructor = preview.ownerDocument.defaultView?.Image ?? Image;
    const source = new ImageConstructor();
    this.pendingImages.add(source);
    source.addEventListener("load", () => {
      this.pendingImages.delete(source);
      if (!preview.isConnected) return;
      const scale = Math.min(1, 512 / Math.max(source.naturalWidth, source.naturalHeight));
      canvas.width = Math.max(1, Math.round(source.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(source.naturalHeight * scale));
      canvas.getContext("2d")?.drawImage(source, 0, 0, canvas.width, canvas.height);
    }, { once: true });
    source.addEventListener("error", () => {
      this.pendingImages.delete(source);
      if (!preview.isConnected) return;
      canvas.remove();
      const icon = preview.createSpan({ cls: "folder-nodes-video-placeholder" });
      setIcon(icon, "image");
    }, { once: true });
    source.src = this.app.vault.getResourcePath(file);
  }

  private cancelPendingImages(): void {
    for (const image of this.pendingImages) image.src = "";
    this.pendingImages.clear();
  }

  private renderSelectionToolbar(container: HTMLElement): void {
    const toolbar = container.createDiv({ cls: "folder-nodes-selection-toolbar", attr: { role: "toolbar", "aria-label": t("selectContent") } });
    const summary = toolbar.createDiv({ cls: "folder-nodes-selection-summary" });
    summary.createSpan({ cls: "folder-nodes-selection-count", text: t("selectedCount", { count: this.selectedContent.size }) });
    const target = this.lastEditor?.file ?? null;
    summary.createSpan({
      cls: `folder-nodes-selection-target${target === null ? " is-missing" : ""}`,
      text: target === null ? t("noActiveEditor") : t("targetNoteValue", { name: target.basename }),
    });
    const actions = toolbar.createDiv({ cls: "folder-nodes-selection-actions" });
    const insert = actions.createEl("button", { cls: "mod-cta", text: t("insertSelected") });
    insert.disabled = this.selectedContent.size === 0 || target === null;
    insert.addEventListener("click", () => this.insertSelected(false));
    const links = actions.createEl("button", { text: t("insertAsLinks") });
    links.disabled = insert.disabled;
    links.addEventListener("click", () => this.insertSelected(true));
    const copy = actions.createEl("button", { text: t("copySelectedLinks") });
    copy.disabled = this.selectedContent.size === 0;
    copy.addEventListener("click", () => void this.copySelectedLinks());
    const clear = actions.createEl("button", { text: t("clearSelection") });
    clear.disabled = this.selectedContent.size === 0;
    clear.addEventListener("click", () => {
      this.selectedContent.clear();
      this.selectionAnchor = null;
      this.render();
    });
    const finish = actions.createEl("button", { text: t("finishSelection") });
    finish.addEventListener("click", () => this.finishSelection());
  }

  private startSelection(): void {
    this.selectionMode = true;
    this.render();
  }

  private finishSelection(render = true): void {
    this.selectionMode = false;
    this.selectedContent.clear();
    this.selectionAnchor = null;
    if (render) this.render();
  }

  private toggleSelection(path: string, kind: "file" | "media", extend: boolean): void {
    if (extend && this.selectionAnchor !== null) {
      const range = selectionRange(this.selectableOrder, this.selectionAnchor, path);
      if (range.length > 0) {
        for (const selectedPath of range) {
          const selectedKind = this.selectableKinds.get(selectedPath);
          if (selectedKind !== undefined) this.selectedContent.set(selectedPath, selectedKind);
        }
        this.render();
        return;
      }
    }
    if (this.selectedContent.has(path)) this.selectedContent.delete(path);
    else this.selectedContent.set(path, kind);
    this.selectionAnchor = path;
    this.render();
  }

  private renderSelectionIndicator(container: HTMLElement, path: string): void {
    const index = this.selectionPositions.get(path) ?? -1;
    const indicator = container.createSpan({
      cls: `folder-nodes-selection-indicator${index >= 0 ? " is-selected" : ""}`,
      attr: { "aria-hidden": "true" },
    });
    if (index >= 0) indicator.setText(String(index + 1));
    else setIcon(indicator, "circle");
  }

  private insertSelected(allAsLinks: boolean): void {
    const target = this.lastEditor;
    if (target === null) {
      new Notice(t("noActiveEditor"));
      return;
    }
    const text = this.contentLinkText([...this.selectedContent.entries()].map(([path, kind]) => ({ path, kind })), allAsLinks, target.file.path);
    if (text === "") return;
    target.editor.replaceSelection(text);
    this.finishSelection();
  }

  private async copySelectedLinks(): Promise<void> {
    const text = this.contentLinkText([...this.selectedContent.entries()].map(([path, kind]) => ({ path, kind })), false);
    if (text === "") return;
    try {
      await navigator.clipboard.writeText(text);
      new Notice(t("selectedLinksCopied", { count: this.selectedContent.size }));
    } catch (error) {
      this.actions.reportError(error);
    }
  }

  private contentLinkText(
    entries: readonly { path: string; kind: "file" | "media" }[],
    allAsLinks: boolean,
    sourcePath = this.lastEditor?.file.path ?? this.service.notePathForFolder(this.folderPath),
  ): string {
    const items: ContentLinkItem[] = entries.flatMap(({ path, kind }) => {
      const file = this.app.vault.getAbstractFileByPath(path);
      return file instanceof TFile ? [{ kind, link: this.app.fileManager.generateMarkdownLink(file, sourcePath) }] : [];
    });
    return formatContentLinks(items, allAsLinks);
  }

  private captureActiveEditor(): void {
    const active = this.app.workspace.activeEditor;
    if (active?.editor !== undefined && active.file !== null) this.lastEditor = { editor: active.editor, file: active.file };
  }

  private isAffected(paths: ReadonlySet<string>): boolean {
    const current = normalizeVaultPath(this.folderPath);
    const notePath = normalizeVaultPath(this.service.notePathForFolder(current));
    for (const rawPath of paths) {
      const path = normalizeVaultPath(rawPath);
      if (path === notePath || path === current || dirname(path) === current) return true;
      if (isCanonicalNodeNote(path)) {
        const nodeFolder = dirname(path);
        if (dirname(nodeFolder) === current || current.startsWith(`${nodeFolder}/`)) return true;
      }
    }
    return false;
  }

  private bindMenu(
    shell: HTMLElement,
    primary: HTMLButtonElement,
    entry: TAbstractFile,
    open: (anchor: ContentsMenuAnchor) => void,
  ): void {
    shell.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      event.stopPropagation();
      open(event);
    });
    primary.addEventListener("keydown", (event) => {
      if (!isContextMenuKey(event)) return;
      event.preventDefault();
      event.stopPropagation();
      open(primary);
    });
    const more = shell.createEl("button", {
      cls: "folder-nodes-entry-menu clickable-icon",
      attr: { "aria-label": t("moreActions", { name: entry.name }), draggable: "false" },
    });
    setIcon(more, "more-horizontal");
    more.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      open(more);
    });
  }

  private bindNodeReorderSource(handle: HTMLElement, shell: HTMLElement, path: string): void {
    handle.addEventListener("dragstart", (event) => {
      this.clearAllDrag();
      this.draggedNodePath = path;
      this.draggedSource = shell;
      shell.addClass("folder-nodes-is-dragging");
      event.dataTransfer?.setData("application/x-folder-nodes-order", path);
      if (event.dataTransfer !== null) event.dataTransfer.effectAllowed = "move";
    });
    handle.addEventListener("dragend", () => this.clearNodeDrag());
  }

  private bindNodeReorderTarget(element: HTMLElement, target: TFolder, parentPath: string): void {
    element.addEventListener("dragover", (event) => {
      if (this.draggedNodePath === null || this.draggedNodePath === target.path) return;
      event.preventDefault();
      const placement = this.nodeDropPlacement(element, event);
      this.markDrop(element, placement.zone, placement.axis);
      if (event.dataTransfer !== null) event.dataTransfer.dropEffect = "move";
    });
    element.addEventListener("dragleave", (event) => this.onDragLeave(event, element));
    element.addEventListener("drop", (event) => {
      const sourcePath = this.draggedNodePath;
      if (sourcePath === null || sourcePath === target.path) return;
      event.preventDefault();
      event.stopPropagation();
      const { zone } = this.nodeDropPlacement(element, event);
      const siblings = this.service.children(parentPath).filter(({ childPath }) => childPath !== sourcePath);
      const targetIndex = siblings.findIndex(({ childPath }) => childPath === target.path);
      const source = this.service.getFolder(sourcePath);
      this.clearNodeDrag();
      if (source !== null && targetIndex >= 0) this.finishDrop(this.service.placeNode(source, parentPath, targetIndex + (zone === "after" ? 1 : 0)));
    });
  }

  private nodeDropPlacement(element: HTMLElement, event: DragEvent): { axis: SiblingDropAxis; zone: "after" | "before" } {
    const shells = element.parentElement === null
      ? [element]
      : Array.from(element.parentElement.children).filter((child): child is HTMLElement =>
        child.instanceOf(HTMLElement) && child.matches(".folder-nodes-node-shell"));
    const axis = siblingDropAxis(shells.map((shell) => shell.getBoundingClientRect()));
    const styleTarget = element.parentElement ?? element;
    const rightToLeft = (element.ownerDocument.defaultView?.getComputedStyle(styleTarget) ?? getComputedStyle(styleTarget)).direction === "rtl";
    return {
      axis,
      zone: siblingDropZone(element.getBoundingClientRect(), event, axis, rightToLeft),
    };
  }

  private bindContentDragSource(element: HTMLElement, file: TFile, kind: "file" | "media"): void {
    element.setAttr("draggable", "true");
    element.addEventListener("dragstart", (event) => {
      this.clearAllDrag();
      const selected = this.selectionMode && this.selectedContent.has(file.path)
        ? [...this.selectedContent.entries()].map(([path, selectedKind]) => ({ path, kind: selectedKind }))
        : [{ path: file.path, kind }];
      const text = this.contentLinkText(selected, false);
      if (text === "" || event.dataTransfer === null) {
        event.preventDefault();
        return;
      }
      this.draggedSource = element;
      element.addClass("folder-nodes-is-dragging");
      event.dataTransfer.setData("text/plain", text);
      const policy = contentDragPolicy(selected.length);
      if (policy.internalMove) {
        this.draggedContentPath = file.path;
        event.dataTransfer.setData("application/x-folder-nodes-file", file.path);
      }
      event.dataTransfer.effectAllowed = policy.effectAllowed;
    });
    element.addEventListener("dragend", () => {
      this.clearContentDrag();
    });
  }

  private bindContentDropTarget(element: HTMLElement, targetFolderPath: string): void {
    element.addEventListener("dragover", (event) => {
      if (this.draggedContentPath === null) return;
      event.preventDefault();
      event.stopPropagation();
      if (this.contentDropTarget !== element) this.clearContentDropTarget();
      this.contentDropTarget = element;
      element.addClass("folder-nodes-content-drop-into");
      if (event.dataTransfer !== null) event.dataTransfer.dropEffect = "move";
    });
    element.addEventListener("dragleave", (event) => {
      const NodeConstructor = element.ownerDocument.defaultView?.Node;
      if (NodeConstructor !== undefined && event.relatedTarget instanceof NodeConstructor && element.contains(event.relatedTarget)) return;
      if (this.contentDropTarget === element) this.clearContentDropTarget();
    });
    element.addEventListener("drop", (event) => {
      const sourcePath = this.draggedContentPath;
      if (sourcePath === null) return;
      event.preventDefault();
      event.stopPropagation();
      const source = this.service.getFile(sourcePath);
      this.clearContentDrag();
      if (source !== null) this.finishDrop(this.service.moveFile(source, targetFolderPath));
    });
  }

  private markDrop(element: HTMLElement, zone: "before" | "after", axis: SiblingDropAxis): void {
    if (this.dropTarget !== element) this.clearDropTarget();
    this.dropTarget = element;
    element.removeClass(
      "folder-nodes-node-drop-before", "folder-nodes-node-drop-after",
      "folder-nodes-node-drop-horizontal", "folder-nodes-node-drop-vertical",
    );
    element.addClass(`folder-nodes-node-drop-${zone}`, `folder-nodes-node-drop-${axis}`);
  }

  private onDragLeave(event: DragEvent, element: HTMLElement): void {
    const NodeConstructor = element.ownerDocument.defaultView?.Node;
    if (NodeConstructor !== undefined && event.relatedTarget instanceof NodeConstructor && element.contains(event.relatedTarget)) return;
    if (this.dropTarget === element) this.clearDropTarget();
  }

  private finishDrop(operation: Promise<unknown>): void {
    void operation.then(() => this.actions.refresh()).catch((error) => this.actions.reportError(error));
  }

  private runAction(operation: Promise<unknown>): void {
    void operation.catch((error) => this.actions.reportError(error));
  }

  private clearDropTarget(): void {
    this.dropTarget?.removeClass(
      "folder-nodes-node-drop-before", "folder-nodes-node-drop-after",
      "folder-nodes-node-drop-horizontal", "folder-nodes-node-drop-vertical",
    );
    this.dropTarget = null;
  }

  private clearNodeDrag(): void {
    this.clearDropTarget();
    this.draggedSource?.removeClass("folder-nodes-is-dragging");
    this.draggedSource = null;
    this.draggedNodePath = null;
  }

  private clearContentDropTarget(): void {
    this.contentDropTarget?.removeClass("folder-nodes-content-drop-into");
    this.contentDropTarget = null;
  }

  private clearContentDrag(): void {
    this.clearContentDropTarget();
    this.draggedSource?.removeClass("folder-nodes-is-dragging");
    this.draggedSource = null;
    this.draggedContentPath = null;
  }

  private clearAllDrag(): void {
    this.clearNodeDrag();
    this.clearContentDrag();
  }

  private section(container: HTMLElement, label: string): HTMLElement {
    const details = container.createEl("details", { cls: "folder-nodes-section", attr: { open: "" } });
    details.createEl("summary", { text: label });
    return details;
  }

  private more(container: HTMLElement, total: number, section: ContentsSection): void {
    const limit = this.visibleLimits[section];
    if (total <= limit) return;
    const count = Math.min(200, total - limit);
    const more = container.createEl("button", { cls: "folder-nodes-more", text: t("showMore", { count }) });
    more.addEventListener("click", () => {
      this.visibleLimits[section] += 200;
      this.render();
    });
  }
}

function folderForEntry(entry: TAbstractFile, root: TFolder): TFolder {
  return entry.parent ?? root;
}
