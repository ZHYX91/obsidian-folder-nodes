import { type Editor, ItemView, Notice, setIcon, TAbstractFile, TFile, TFolder, WorkspaceLeaf } from "obsidian";

import {
  breadcrumbItems,
  type ContentLinkItem,
  formatContentLinks,
  isContextMenuKey,
  selectionRange,
  siblingDropZone,
} from "./contents-interactions";
import { t } from "./i18n";
import { normalizeVaultPath } from "../core/paths";
import type { ChildOrderRecord, NodeVisual } from "../core/types";
import { renderVisual } from "./render-visual";

const IMAGE_EXTENSIONS = new Set(["avif", "bmp", "gif", "heic", "heif", "jpeg", "jpg", "png", "svg", "webp"]);
const VIDEO_EXTENSIONS = new Set(["m4v", "mkv", "mov", "mp4", "webm"]);
const FILE_ICONS: Record<string, string> = {
  md: "file-text", pdf: "file-text", mp3: "audio-lines", m4a: "audio-lines", ogg: "audio-lines",
  opus: "audio-lines", wav: "audio-lines", flac: "audio-lines", heic: "image", heif: "image",
};

interface ContentsService {
  getFolder(path: string): TFolder | null;
  getNote(path: string): TFile | null;
  notePathForFolder(path: string): string;
  isIgnoredPath(path: string): boolean;
  isLeafNoteExempt(path: string): boolean;
  children(path: string): ChildOrderRecord[];
  openFolderNode(path: string, newLeaf?: boolean): Promise<void>;
  placeNode(folder: TFolder, targetParentPath: string, targetIndex: number): Promise<TFolder>;
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
  initialized(): boolean;
  initialize(): void;
  refresh(): void;
  reportError(error: unknown): void;
}

type NodeEntry =
  | { kind: "healthy" | "missing-note"; entry: TFolder }
  | { kind: "conflict" | "missing-folder"; entry: TFile };

export const CONTENTS_VIEW_TYPE = "folder-nodes-contents";

export class FolderNodeContentsView extends ItemView {
  private folderPath = "";
  private visibleLimit = 200;
  private selectionMode = false;
  private selectedContent = new Map<string, "file" | "media">();
  private selectionAnchor: string | null = null;
  private selectableOrder: string[] = [];
  private selectableKinds = new Map<string, "file" | "media">();
  private lastEditor: { editor: Editor; file: TFile } | null = null;
  private draggedNodePath: string | null = null;
  private draggedSource: HTMLElement | null = null;
  private dropTarget: HTMLElement | null = null;

  public constructor(
    leaf: WorkspaceLeaf,
    private readonly service: ContentsService,
    private readonly visuals: ContentsVisuals,
    private readonly actions: ContentsActions,
  ) {
    super(leaf);
    this.registerDomEvent(this.containerEl.ownerDocument, "keydown", (event) => {
      if (event.key !== "Escape") return;
      if (this.selectionMode) this.finishSelection();
      else this.clearNodeDrag();
    });
  }

  public override getViewType(): string { return CONTENTS_VIEW_TYPE; }
  public override getDisplayText(): string { return t("nodeContents"); }
  public override getIcon(): string { return "layout-grid"; }

  public setFolder(path: string): void {
    const normalized = normalizeVaultPath(path);
    if (normalizeVaultPath(this.folderPath) !== normalized) this.finishSelection(false);
    this.clearNodeDrag();
    this.folderPath = normalized;
    this.visibleLimit = 200;
    this.render();
  }

  public refresh(): void { this.render(); }
  public override async onOpen(): Promise<void> { this.render(); }

  private render(): void {
    this.clearNodeDrag();
    this.captureActiveEditor();
    const container = this.contentEl;
    container.empty();
    container.addClass("folder-nodes-contents");
    if (!this.actions.initialized()) this.renderInitializationNotice(container);
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
      kind: this.service.getNote(this.service.notePathForFolder(entry.path)) === null ? "missing-note" : "healthy",
      entry,
    }));
    const canonicalPath = this.service.notePathForFolder(folderPath);
    const directFiles = folder.children.filter((entry): entry is TFile => entry instanceof TFile && entry.path !== canonicalPath);
    const pendingNotes = currentIgnored ? [] : directFiles.filter((entry) =>
      entry.extension.toLocaleLowerCase() === "md" && !this.service.isLeafNoteExempt(entry.path));
    nodeEntries.push(...pendingNotes.map((entry): NodeEntry => {
      const targetPath = folderPath === "" ? entry.basename : `${folderPath}/${entry.basename}`;
      const targetFolder = this.service.getFolder(targetPath);
      const targetNodeExists = targetFolder !== null && this.service.getNote(this.service.notePathForFolder(targetFolder.path)) !== null;
      return { kind: targetNodeExists ? "conflict" : "missing-folder", entry };
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
    this.renderBreadcrumb(container, folder);
    this.renderHeader(container, folder, this.selectableOrder.length > 0);
    if (this.selectionMode) this.renderSelectionToolbar(container);
    this.renderNodes(container, nodeEntries, folderPath);
    this.renderAlbum(container, album);
    this.renderFiles(container, ordinaryFiles);
  }

  private renderInitializationNotice(container: HTMLElement): void {
    const notice = container.createDiv({ cls: "folder-nodes-initialization-notice" });
    notice.createSpan({ text: t("contentsUninitialized") });
    const button = notice.createEl("button", { text: t("startInitialization") });
    button.addEventListener("click", () => this.actions.initialize());
  }

  private renderBreadcrumb(container: HTMLElement, folder: TFolder): void {
    const breadcrumb = container.createDiv({ cls: "folder-nodes-breadcrumb", attr: { "aria-label": t("nodePath") } });
    const folderPath = normalizeVaultPath(folder.path);
    const items = breadcrumbItems(this.app.vault.getName(), folderPath);
    for (const [index, item] of items.entries()) {
      if (index > 0) breadcrumb.createSpan({ cls: "folder-nodes-breadcrumb-separator", text: "/", attr: { "aria-hidden": "true" } });
      if (item.current) {
        breadcrumb.createSpan({
          cls: "folder-nodes-breadcrumb-current",
          text: item.label,
          attr: { "aria-current": "page" },
        });
        continue;
      }
      const button = breadcrumb.createEl("button", { text: item.label });
      button.addEventListener("click", () => this.setFolder(item.path));
    }
  }

  private renderHeader(container: HTMLElement, folder: TFolder, hasSelectableContent: boolean): void {
    const header = container.createDiv({ cls: "folder-nodes-contents-header" });
    const folderPath = normalizeVaultPath(folder.path);
    const managedNode = !this.service.isIgnoredPath(folderPath) && this.service.getNote(this.service.notePathForFolder(folderPath)) !== null;
    const identity = managedNode
      ? header.createEl("button", { cls: "folder-nodes-current", attr: { "aria-label": t("openCurrentNodeNote") } })
      : header.createDiv({ cls: "folder-nodes-current" });
    const resolved = managedNode ? this.visuals.resolve(folder) : null;
    if (resolved !== null && resolved.kind !== "fallback") {
      const visual = identity.createSpan({ cls: "folder-nodes-current-visual" });
      renderVisual(visual, resolved, folderPath === "" ? this.app.vault.getName() : folder.name);
    }
    const title = identity.createSpan({ cls: "folder-nodes-current-title", text: folderPath === "" ? this.app.vault.getName() : folder.name });
    title.setAttr("title", folderPath);
    if (!managedNode && !this.service.isIgnoredPath(folderPath)) title.createSpan({ cls: "folder-nodes-status-badge is-warning", text: t("missingNodeNote") });
    if (managedNode) identity.addEventListener("click", (event) => {
      const mouseEvent = event as MouseEvent;
      void this.service.openFolderNode(folderPath, mouseEvent.ctrlKey || mouseEvent.metaKey);
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
      open.addEventListener("click", (event) => void this.service.openFolderNode(folderPath, event.ctrlKey || event.metaKey));
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
    const problems = entries.filter((entry) => entry.kind !== "healthy").length;
    const label = problems === 0 ? `${t("nodes")} (${entries.length})` : `${t("nodes")} (${entries.length}) · ${t("needsRepair")} ${problems}`;
    const section = this.section(container, label);
    const grid = section.createDiv({ cls: "folder-nodes-node-grid" });
    for (const item of entries.slice(0, this.visibleLimit)) {
      const entry = item.entry;
      const visual = item.kind === "healthy" && entry instanceof TFolder ? this.visuals.resolve(entry) : null;
      const shell = grid.createDiv({ cls: `folder-nodes-entry-shell folder-nodes-node-shell${item.kind === "healthy" ? "" : " is-problem"}` });
      const card = shell.createEl("button", { cls: `folder-nodes-node-card${visual === null || visual.kind === "fallback" ? " has-no-visual" : ""}` });
      if (visual !== null && visual.kind !== "fallback") {
        const preview = card.createSpan({ cls: "folder-nodes-node-visual" });
        renderVisual(preview, visual, entry.name);
      }
      card.createSpan({ cls: "folder-nodes-card-title", text: entry instanceof TFile ? entry.basename : entry.name, attr: { title: entry.name } });
      if (item.kind !== "healthy") card.createSpan({
        cls: "folder-nodes-status-badge is-warning",
        text: item.kind === "missing-note" ? t("missingNodeNote") : item.kind === "conflict" ? t("nodeConflict") : t("missingNodeFolder"),
      });
      card.addEventListener("click", (event) => {
        if (item.kind === "healthy" && entry instanceof TFolder) void this.service.openFolderNode(entry.path, event.ctrlKey || event.metaKey);
        else if (entry instanceof TFolder) this.setFolder(entry.path);
        else void this.app.workspace.getLeaf(event.ctrlKey || event.metaKey).openFile(entry);
      });
      if (item.kind === "healthy" && entry instanceof TFolder) {
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
    this.more(section, entries.length);
  }

  private renderAlbum(container: HTMLElement, entries: readonly TFile[]): void {
    const section = this.section(container, `${t("album")} (${entries.length})`);
    const grid = section.createDiv({ cls: "folder-nodes-album-grid" });
    for (const entry of entries.slice(0, this.visibleLimit)) {
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
      if (this.selectionMode) this.renderSelectionIndicator(preview, entry.path);
      card.createSpan({ cls: "folder-nodes-album-title", text: entry.basename, attr: { title: entry.name } });
      card.addEventListener("click", (event) => {
        if (this.selectionMode) this.toggleSelection(entry.path, "media", event.shiftKey);
        else void this.app.workspace.getLeaf(event.ctrlKey || event.metaKey).openFile(entry);
      });
      const sourceFolder = entry.parent ?? this.app.vault.getRoot();
      this.bindMenu(shell, card, entry, (anchor) => this.actions.entryMenu(anchor, entry, sourceFolder));
      this.bindContentDragSource(card, entry, "media");
    }
    this.more(section, entries.length);
  }

  private renderFiles(container: HTMLElement, entries: readonly (TFile | TFolder)[]): void {
    const section = this.section(container, `${t("files")} (${entries.length})`);
    const list = section.createDiv({ cls: "folder-nodes-file-list" });
    for (const entry of entries.slice(0, this.visibleLimit)) {
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
      if (entry instanceof TFolder && this.service.isIgnoredPath(entry.path)) row.createSpan({ cls: "folder-nodes-status-badge", text: t("unmanaged") });
      if (entry instanceof TFile && this.service.isLeafNoteExempt(entry.path)) row.createSpan({ cls: "folder-nodes-status-badge", text: t("exempt") });
      if (entry instanceof TFile && entry.extension !== "") row.createSpan({ cls: "folder-nodes-file-extension", text: entry.extension.toLocaleUpperCase() });
      row.addEventListener("click", (event) => {
        if (entry instanceof TFolder) this.setFolder(entry.path);
        else if (this.selectionMode) this.toggleSelection(entry.path, "file", event.shiftKey);
        else void this.app.workspace.getLeaf(event.ctrlKey || event.metaKey).openFile(entry);
      });
      this.bindMenu(shell, row, entry, (anchor) => this.actions.entryMenu(anchor, entry, folderForEntry(entry, this.app.vault.getRoot())));
      if (entry instanceof TFile) this.bindContentDragSource(row, entry, "file");
    }
    this.more(section, entries.length);
  }

  private isAlbumEntry(file: TFile): boolean {
    const extension = file.extension.toLocaleLowerCase();
    return IMAGE_EXTENSIONS.has(extension) || VIDEO_EXTENSIONS.has(extension);
  }

  private renderStaticImage(file: TFile, preview: HTMLElement): void {
    const canvas = preview.createEl("canvas", { attr: { role: "img", "aria-label": file.basename } });
    const source = new Image();
    source.addEventListener("load", () => {
      const scale = Math.min(1, 512 / Math.max(source.naturalWidth, source.naturalHeight));
      canvas.width = Math.max(1, Math.round(source.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(source.naturalHeight * scale));
      canvas.getContext("2d")?.drawImage(source, 0, 0, canvas.width, canvas.height);
    }, { once: true });
    source.addEventListener("error", () => {
      canvas.remove();
      const icon = preview.createSpan({ cls: "folder-nodes-video-placeholder" });
      setIcon(icon, "image");
    }, { once: true });
    source.src = this.app.vault.getResourcePath(file);
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
    const index = [...this.selectedContent.keys()].indexOf(path);
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
      this.clearNodeDrag();
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
      this.markDrop(element, siblingDropZone(element.getBoundingClientRect(), event.clientY));
      if (event.dataTransfer !== null) event.dataTransfer.dropEffect = "move";
    });
    element.addEventListener("dragleave", (event) => this.onDragLeave(event, element));
    element.addEventListener("drop", (event) => {
      const sourcePath = this.draggedNodePath;
      if (sourcePath === null || sourcePath === target.path) return;
      event.preventDefault();
      event.stopPropagation();
      const zone = siblingDropZone(element.getBoundingClientRect(), event.clientY);
      const siblings = this.service.children(parentPath).filter(({ childPath }) => childPath !== sourcePath);
      const targetIndex = siblings.findIndex(({ childPath }) => childPath === target.path);
      const source = this.service.getFolder(sourcePath);
      this.clearNodeDrag();
      if (source !== null && targetIndex >= 0) this.finishDrop(this.service.placeNode(source, parentPath, targetIndex + (zone === "after" ? 1 : 0)));
    });
  }

  private bindContentDragSource(element: HTMLElement, file: TFile, kind: "file" | "media"): void {
    element.setAttr("draggable", "true");
    element.addEventListener("dragstart", (event) => {
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
      event.dataTransfer.effectAllowed = "copy";
    });
    element.addEventListener("dragend", () => {
      this.draggedSource?.removeClass("folder-nodes-is-dragging");
      this.draggedSource = null;
    });
  }

  private markDrop(element: HTMLElement, zone: "before" | "after"): void {
    if (this.dropTarget !== element) this.clearDropTarget();
    this.dropTarget = element;
    element.removeClass("folder-nodes-drop-before", "folder-nodes-drop-after");
    element.addClass(`folder-nodes-drop-${zone}`);
  }

  private onDragLeave(event: DragEvent, element: HTMLElement): void {
    if (event.relatedTarget instanceof Node && element.contains(event.relatedTarget)) return;
    if (this.dropTarget === element) this.clearDropTarget();
  }

  private finishDrop(operation: Promise<unknown>): void {
    void operation.then(() => this.actions.refresh()).catch((error) => this.actions.reportError(error));
  }

  private clearDropTarget(): void {
    this.dropTarget?.removeClass("folder-nodes-drop-before", "folder-nodes-drop-into", "folder-nodes-drop-after");
    this.dropTarget = null;
  }

  private clearNodeDrag(): void {
    this.clearDropTarget();
    this.draggedSource?.removeClass("folder-nodes-is-dragging");
    this.draggedSource = null;
    this.draggedNodePath = null;
  }

  private section(container: HTMLElement, label: string): HTMLElement {
    const details = container.createEl("details", { cls: "folder-nodes-section", attr: { open: "" } });
    details.createEl("summary", { text: label });
    return details;
  }

  private more(container: HTMLElement, total: number): void {
    if (total <= this.visibleLimit) return;
    const count = Math.min(200, total - this.visibleLimit);
    const more = container.createEl("button", { cls: "folder-nodes-more", text: t("showMore", { count }) });
    more.addEventListener("click", () => {
      this.visibleLimit += 200;
      this.render();
    });
  }
}

function folderForEntry(entry: TAbstractFile, root: TFolder): TFolder {
  return entry.parent ?? root;
}
