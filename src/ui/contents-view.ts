import { ItemView, setIcon, TAbstractFile, TFile, TFolder, WorkspaceLeaf } from "obsidian";

import {
  CONTENTS_DRAG_MIME,
  breadcrumbSegments,
  type ContentsDragPayload,
  isContextMenuKey,
  nodeDropZone,
  parseDragPayload,
  serializeDragPayload,
} from "./contents-interactions";
import { t } from "./i18n";
import { normalizeVaultPath } from "../core/paths";
import type { ChildOrderRecord, NodeDropZone, NodeVisual } from "../core/types";
import { renderVisual } from "./render-visual";

const IMAGE_EXTENSIONS = new Set(["avif", "bmp", "gif", "jpeg", "jpg", "png", "svg", "webp"]);
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
  placeNodeRelative(source: TFolder, target: TFolder, zone: NodeDropZone): Promise<TFolder>;
  moveFile(file: TFile, targetFolderPath: string): Promise<void>;
}

interface ContentsVisuals { resolve(folder: TFolder): NodeVisual; }

export type ContentsMenuAnchor = MouseEvent | HTMLElement;

interface ContentsActions {
  createChild(folder: TFolder): void;
  nodeMenu(anchor: ContentsMenuAnchor, folder: TFolder): void;
  entryMenu(anchor: ContentsMenuAnchor, entry: TAbstractFile, sourceFolder: TFolder): void;
  problemMenu(anchor: ContentsMenuAnchor, entry: TFolder | TFile): void;
  editVisual(folder: TFolder): void;
  openHomepage(): void;
  homepageEnabled(): boolean;
  initialized(): boolean;
  initialize(): void;
  reportError(error: unknown): void;
}

type NodeEntry =
  | { kind: "healthy" | "missing-note"; entry: TFolder }
  | { kind: "missing-folder"; entry: TFile };

export const CONTENTS_VIEW_TYPE = "folder-nodes-contents";

export class FolderNodeContentsView extends ItemView {
  private folderPath = "";
  private visibleLimit = 200;
  private draggedPayload: ContentsDragPayload | null = null;
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
      if (event.key === "Escape") this.clearDrag();
    });
  }

  public override getViewType(): string { return CONTENTS_VIEW_TYPE; }
  public override getDisplayText(): string { return t("nodeContents"); }
  public override getIcon(): string { return "layout-grid"; }

  public setFolder(path: string): void {
    this.clearDrag();
    this.folderPath = path;
    this.visibleLimit = 200;
    this.render();
  }

  public refresh(): void { this.render(); }
  public override async onOpen(): Promise<void> { this.render(); }

  private render(): void {
    this.clearDrag();
    const container = this.contentEl;
    container.empty();
    container.addClass("folder-nodes-contents");
    if (!this.actions.initialized()) this.renderInitializationNotice(container);
    const folder = normalizeVaultPath(this.folderPath) === "" ? this.app.vault.getRoot() : this.service.getFolder(this.folderPath);
    if (folder === null) {
      container.createEl("p", { cls: "setting-item-description", text: t("noCurrentNode") });
      return;
    }
    this.renderBreadcrumb(container, folder);
    this.renderHeader(container, folder);
    const folderPath = normalizeVaultPath(folder.path);
    const currentIgnored = this.service.isIgnoredPath(folderPath);
    const childFolders = folder.children.filter((entry): entry is TFolder => entry instanceof TFolder);
    const managedFolders = currentIgnored ? [] : childFolders.filter((entry) => !this.service.isIgnoredPath(entry.path));
    const nodeEntries: NodeEntry[] = managedFolders.map((entry) => ({
      kind: this.service.getNote(this.service.notePathForFolder(entry.path)) === null ? "missing-note" : "healthy",
      entry,
    }));
    const canonicalPath = this.service.notePathForFolder(folderPath);
    const directFiles = folder.children.filter((entry): entry is TFile => entry instanceof TFile && entry.path !== canonicalPath);
    const pendingNotes = currentIgnored ? [] : directFiles.filter((entry) =>
      entry.extension.toLocaleLowerCase() === "md" && !this.service.isLeafNoteExempt(entry.path));
    nodeEntries.push(...pendingNotes.map((entry): NodeEntry => ({ kind: "missing-folder", entry })));
    const album = directFiles.filter((entry) => this.isAlbumEntry(entry));
    const pendingPaths = new Set(pendingNotes.map((entry) => entry.path));
    const ordinaryFiles: (TFile | TFolder)[] = [
      ...childFolders.filter((entry) => currentIgnored || this.service.isIgnoredPath(entry.path)),
      ...directFiles.filter((entry) => !this.isAlbumEntry(entry) && !pendingPaths.has(entry.path)),
    ].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }));
    this.renderNodes(container, nodeEntries);
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
    const breadcrumb = container.createDiv({ cls: "folder-nodes-breadcrumb", attr: { "aria-label": t("openParent") } });
    const root = breadcrumb.createEl("button", { text: this.app.vault.getName() });
    root.addEventListener("click", () => this.setFolder(""));
    this.bindFolderDropTarget(root, "");
    const folderPath = normalizeVaultPath(folder.path);
    if (folderPath === "") return;
    let path = "";
    for (const segment of breadcrumbSegments(folderPath)) {
      breadcrumb.createSpan({ text: "/" });
      path = path === "" ? segment : `${path}/${segment}`;
      const target = path;
      const button = breadcrumb.createEl("button", { text: segment });
      button.addEventListener("click", () => this.setFolder(target));
      this.bindFolderDropTarget(button, target);
    }
  }

  private renderHeader(container: HTMLElement, folder: TFolder): void {
    const header = container.createDiv({ cls: "folder-nodes-contents-header" });
    const identity = header.createDiv({ cls: "folder-nodes-current" });
    const folderPath = normalizeVaultPath(folder.path);
    this.bindFolderDropTarget(identity, folderPath);
    const managedNode = !this.service.isIgnoredPath(folderPath) && this.service.getNote(this.service.notePathForFolder(folderPath)) !== null;
    const resolved = managedNode ? this.visuals.resolve(folder) : null;
    if (resolved !== null && resolved.kind !== "fallback") {
      const visual = identity.createSpan({ cls: "folder-nodes-current-visual" });
      renderVisual(visual, resolved, folderPath === "" ? this.app.vault.getName() : folder.name);
    }
    const title = identity.createEl("h3", { text: folderPath === "" ? this.app.vault.getName() : folder.name });
    title.setAttr("title", folderPath);
    if (!managedNode && !this.service.isIgnoredPath(folderPath)) title.createSpan({ cls: "folder-nodes-status-badge is-warning", text: t("missingNodeNote") });
    const actions = header.createDiv({ cls: "folder-nodes-header-actions" });
    if (this.actions.homepageEnabled()) {
      const homepage = actions.createEl("button", { cls: "clickable-icon", attr: { "aria-label": t("openHomepage") } });
      setIcon(homepage, "home");
      homepage.addEventListener("click", () => this.actions.openHomepage());
    }
    if (managedNode) {
      const visual = actions.createEl("button", { cls: "clickable-icon", attr: { "aria-label": t("editVisual") } });
      setIcon(visual, "palette");
      visual.addEventListener("click", () => this.actions.editVisual(folder));
      const create = actions.createEl("button", { cls: "clickable-icon", attr: { "aria-label": t("createChild") } });
      setIcon(create, "folder-plus");
      create.addEventListener("click", () => this.actions.createChild(folder));
    }
  }

  private renderNodes(container: HTMLElement, entries: readonly NodeEntry[]): void {
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
        text: item.kind === "missing-note" ? t("missingNodeNote") : t("missingNodeFolder"),
      });
      card.addEventListener("click", () => {
        if (item.kind === "healthy" && entry instanceof TFolder) void this.service.openFolderNode(entry.path);
        else if (entry instanceof TFolder) this.setFolder(entry.path);
        else void this.app.workspace.getLeaf(false).openFile(entry);
      });
      if (item.kind === "healthy" && entry instanceof TFolder) {
        this.bindMenu(shell, card, entry, (anchor) => this.actions.nodeMenu(anchor, entry));
        this.bindDragSource(shell, { kind: "node", path: entry.path });
        this.bindNodeDropTarget(shell, entry);
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
      const card = shell.createEl("button", { cls: "folder-nodes-album-card", attr: { "aria-label": entry.name } });
      const preview = card.createSpan({ cls: "folder-nodes-album-preview" });
      if (IMAGE_EXTENSIONS.has(extension)) {
        this.renderStaticImage(entry, preview);
        if (extension === "gif") preview.createSpan({ cls: "folder-nodes-media-badge", text: "GIF" });
      } else {
        const icon = preview.createSpan({ cls: "folder-nodes-video-placeholder" });
        setIcon(icon, "video");
        preview.createSpan({ cls: "folder-nodes-media-badge", text: extension.toLocaleUpperCase() || t("video") });
      }
      card.createSpan({ cls: "folder-nodes-album-title", text: entry.basename, attr: { title: entry.name } });
      card.addEventListener("click", () => void this.app.workspace.getLeaf(false).openFile(entry));
      const sourceFolder = entry.parent ?? this.app.vault.getRoot();
      this.bindMenu(shell, card, entry, (anchor) => this.actions.entryMenu(anchor, entry, sourceFolder));
      this.bindDragSource(shell, { kind: "file", path: entry.path });
    }
    this.more(section, entries.length);
  }

  private renderFiles(container: HTMLElement, entries: readonly (TFile | TFolder)[]): void {
    const section = this.section(container, `${t("files")} (${entries.length})`);
    const list = section.createDiv({ cls: "folder-nodes-file-list" });
    for (const entry of entries.slice(0, this.visibleLimit)) {
      const shell = list.createDiv({ cls: "folder-nodes-entry-shell folder-nodes-file-shell" });
      const row = shell.createEl("button", { cls: "folder-nodes-file-row" });
      const icon = row.createSpan({ cls: "folder-nodes-file-icon" });
      if (entry instanceof TFolder) setIcon(icon, "folder");
      else setIcon(icon, FILE_ICONS[entry.extension.toLocaleLowerCase()] ?? "file");
      row.createSpan({ cls: "folder-nodes-file-name", text: entry.name, attr: { title: entry.name } });
      if (entry instanceof TFolder && this.service.isIgnoredPath(entry.path)) row.createSpan({ cls: "folder-nodes-status-badge", text: t("unmanaged") });
      if (entry instanceof TFile && this.service.isLeafNoteExempt(entry.path)) row.createSpan({ cls: "folder-nodes-status-badge", text: t("exempt") });
      if (entry instanceof TFile && entry.extension !== "") row.createSpan({ cls: "folder-nodes-file-extension", text: entry.extension.toLocaleUpperCase() });
      row.addEventListener("click", () => {
        if (entry instanceof TFolder) this.setFolder(entry.path);
        else void this.app.workspace.getLeaf(false).openFile(entry);
      });
      this.bindMenu(shell, row, entry, (anchor) => this.actions.entryMenu(anchor, entry, folderForEntry(entry, this.app.vault.getRoot())));
      if (entry instanceof TFile) this.bindDragSource(shell, { kind: "file", path: entry.path });
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

  private bindDragSource(element: HTMLElement, payload: ContentsDragPayload): void {
    element.setAttr("draggable", "true");
    element.addEventListener("dragstart", (event) => {
      if (event.target instanceof Element && event.target.closest(".folder-nodes-entry-menu") !== null) {
        event.preventDefault();
        return;
      }
      this.clearDrag();
      this.draggedPayload = payload;
      this.draggedSource = element;
      element.addClass("folder-nodes-is-dragging");
      event.dataTransfer?.setData(CONTENTS_DRAG_MIME, serializeDragPayload(payload));
      event.dataTransfer?.setData("text/plain", payload.path);
      if (event.dataTransfer !== null) event.dataTransfer.effectAllowed = "move";
    });
    element.addEventListener("dragend", () => this.clearDrag());
  }

  private bindNodeDropTarget(element: HTMLElement, target: TFolder): void {
    element.addEventListener("dragover", (event) => {
      const payload = this.dragPayload(event);
      if (payload === null || (payload.kind === "node" && payload.path === target.path)) return;
      event.preventDefault();
      const zone = payload.kind === "file" ? "into" : nodeDropZone(element.getBoundingClientRect(), event.clientY);
      this.markDrop(element, zone);
      if (event.dataTransfer !== null) event.dataTransfer.dropEffect = "move";
    });
    element.addEventListener("dragleave", (event) => this.onDragLeave(event, element));
    element.addEventListener("drop", (event) => {
      const payload = this.dragPayload(event);
      if (payload === null || (payload.kind === "node" && payload.path === target.path)) return;
      event.preventDefault();
      event.stopPropagation();
      const zone = payload.kind === "file" ? "into" : nodeDropZone(element.getBoundingClientRect(), event.clientY);
      this.clearDrag();
      if (payload.kind === "node") {
        const source = this.service.getFolder(payload.path);
        if (source !== null) this.finishDrop(this.service.placeNodeRelative(source, target, zone));
      } else {
        const file = this.app.vault.getAbstractFileByPath(payload.path);
        if (file instanceof TFile) this.finishDrop(this.service.moveFile(file, target.path));
      }
    });
  }

  private bindFolderDropTarget(element: HTMLElement, targetPath: string): void {
    element.addEventListener("dragover", (event) => {
      const payload = this.dragPayload(event);
      if (payload === null || !this.canDropInto(payload, targetPath)) return;
      event.preventDefault();
      this.markDrop(element, "into");
      if (event.dataTransfer !== null) event.dataTransfer.dropEffect = "move";
    });
    element.addEventListener("dragleave", (event) => this.onDragLeave(event, element));
    element.addEventListener("drop", (event) => {
      const payload = this.dragPayload(event);
      if (payload === null || !this.canDropInto(payload, targetPath)) return;
      event.preventDefault();
      event.stopPropagation();
      this.clearDrag();
      if (payload.kind === "node") {
        const source = this.service.getFolder(payload.path);
        if (source !== null) {
          const index = this.service.children(targetPath).filter(({ childPath }) => childPath !== source.path).length;
          this.finishDrop(this.service.placeNode(source, targetPath, index));
        }
      } else {
        const file = this.app.vault.getAbstractFileByPath(payload.path);
        if (file instanceof TFile) this.finishDrop(this.service.moveFile(file, targetPath));
      }
    });
  }

  private dragPayload(event: DragEvent): ContentsDragPayload | null {
    if (this.draggedPayload === null || this.draggedSource === null) return null;
    const value = event.dataTransfer?.getData(CONTENTS_DRAG_MIME) ?? "";
    if (value === "") return this.draggedPayload;
    const parsed = parseDragPayload(value);
    return parsed?.kind === this.draggedPayload.kind && parsed.path === this.draggedPayload.path ? parsed : null;
  }

  private canDropInto(payload: ContentsDragPayload, targetPath: string): boolean {
    if (payload.kind === "file") return true;
    return targetPath !== payload.path && !targetPath.startsWith(`${payload.path}/`);
  }

  private markDrop(element: HTMLElement, zone: NodeDropZone): void {
    if (this.dropTarget !== element) this.clearDropTarget();
    this.dropTarget = element;
    element.removeClass("folder-nodes-drop-before", "folder-nodes-drop-into", "folder-nodes-drop-after");
    element.addClass(`folder-nodes-drop-${zone}`);
  }

  private onDragLeave(event: DragEvent, element: HTMLElement): void {
    if (event.relatedTarget instanceof Node && element.contains(event.relatedTarget)) return;
    if (this.dropTarget === element) this.clearDropTarget();
  }

  private finishDrop(operation: Promise<unknown>): void {
    void operation.then(() => this.refresh()).catch((error) => this.actions.reportError(error));
  }

  private clearDropTarget(): void {
    this.dropTarget?.removeClass("folder-nodes-drop-before", "folder-nodes-drop-into", "folder-nodes-drop-after");
    this.dropTarget = null;
  }

  private clearDrag(): void {
    this.clearDropTarget();
    this.draggedSource?.removeClass("folder-nodes-is-dragging");
    this.draggedSource = null;
    this.draggedPayload = null;
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
