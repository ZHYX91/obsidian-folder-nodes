import { ItemView, setIcon, TFile, TFolder, WorkspaceLeaf } from "obsidian";

import { t } from "./i18n";
import type { ChildOrderRecord, NodeVisual } from "../core/types";
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
  children(path: string): ChildOrderRecord[];
  openFolderNode(path: string, newLeaf?: boolean): Promise<void>;
}

interface ContentsVisuals { resolve(folder: TFolder): NodeVisual; }

interface ContentsActions {
  createChild(folder: TFolder): void;
  nodeMenu(event: MouseEvent, folder: TFolder): void;
  editVisual(folder: TFolder): void;
  openHomepage(): void;
  homepageEnabled(): boolean;
}

export const CONTENTS_VIEW_TYPE = "folder-nodes-contents";

export class FolderNodeContentsView extends ItemView {
  private folderPath = "";
  private visibleLimit = 200;

  public constructor(
    leaf: WorkspaceLeaf,
    private readonly service: ContentsService,
    private readonly visuals: ContentsVisuals,
    private readonly actions: ContentsActions,
  ) { super(leaf); }

  public override getViewType(): string { return CONTENTS_VIEW_TYPE; }
  public override getDisplayText(): string { return t("nodeContents"); }
  public override getIcon(): string { return "layout-grid"; }

  public setFolder(path: string): void {
    this.folderPath = path;
    this.visibleLimit = 200;
    this.render();
  }

  public refresh(): void { this.render(); }
  public override async onOpen(): Promise<void> { this.render(); }

  private render(): void {
    const container = this.contentEl;
    container.empty();
    container.addClass("folder-nodes-contents");
    const folder = this.folderPath === "" ? this.app.vault.getRoot() : this.service.getFolder(this.folderPath);
    if (folder === null) {
      container.createEl("p", { cls: "setting-item-description", text: t("noCurrentNode") });
      return;
    }
    this.renderBreadcrumb(container, folder);
    this.renderHeader(container, folder);
    const currentIgnored = this.service.isIgnoredPath(folder.path);
    const children = currentIgnored ? [] : this.service.children(folder.path).flatMap(({ childPath }) => {
      const child = this.service.getFolder(childPath);
      return child === null || this.service.isIgnoredPath(child.path) || this.service.getNote(this.service.notePathForFolder(child.path)) === null ? [] : [child];
    });
    const canonicalPath = this.service.notePathForFolder(folder.path);
    const directFiles = folder.children.filter((entry): entry is TFile => entry instanceof TFile && entry.path !== canonicalPath);
    const album = directFiles.filter((entry) => this.isAlbumEntry(entry));
    const ordinaryFiles: (TFile | TFolder)[] = [
      ...folder.children.filter((entry): entry is TFolder => entry instanceof TFolder && (currentIgnored || this.service.isIgnoredPath(entry.path) || this.service.getNote(this.service.notePathForFolder(entry.path)) === null)),
      ...directFiles.filter((entry) => !this.isAlbumEntry(entry)),
    ].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }));
    this.renderNodes(container, children);
    this.renderAlbum(container, album);
    this.renderFiles(container, ordinaryFiles);
  }

  private renderBreadcrumb(container: HTMLElement, folder: TFolder): void {
    const breadcrumb = container.createDiv({ cls: "folder-nodes-breadcrumb", attr: { "aria-label": t("openParent") } });
    const root = breadcrumb.createEl("button", { text: this.app.vault.getName() });
    root.addEventListener("click", () => this.setFolder(""));
    if (folder.path === "") return;
    let path = "";
    for (const segment of folder.path.split("/")) {
      breadcrumb.createSpan({ text: "/" });
      path = path === "" ? segment : `${path}/${segment}`;
      const target = path;
      const button = breadcrumb.createEl("button", { text: segment });
      button.addEventListener("click", () => this.setFolder(target));
    }
  }

  private renderHeader(container: HTMLElement, folder: TFolder): void {
    const header = container.createDiv({ cls: "folder-nodes-contents-header" });
    const identity = header.createDiv({ cls: "folder-nodes-current" });
    const managedNode = !this.service.isIgnoredPath(folder.path) && this.service.getNote(this.service.notePathForFolder(folder.path)) !== null;
    const resolved = managedNode ? this.visuals.resolve(folder) : null;
    if (resolved !== null && resolved.kind !== "fallback") {
      const visual = identity.createSpan({ cls: "folder-nodes-current-visual" });
      renderVisual(visual, resolved, folder.path === "" ? this.app.vault.getName() : folder.name);
    }
    const title = identity.createEl("h3", { text: folder.path === "" ? this.app.vault.getName() : folder.name });
    title.setAttr("title", folder.path);
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

  private renderNodes(container: HTMLElement, entries: readonly TFolder[]): void {
    const section = this.section(container, `${t("nodes")} (${entries.length})`);
    const grid = section.createDiv({ cls: "folder-nodes-node-grid" });
    for (const entry of entries.slice(0, this.visibleLimit)) {
      const visual = this.visuals.resolve(entry);
      const card = grid.createEl("button", { cls: `folder-nodes-node-card${visual.kind === "fallback" ? " has-no-visual" : ""}` });
      if (visual.kind !== "fallback") {
        const preview = card.createSpan({ cls: "folder-nodes-node-visual" });
        renderVisual(preview, visual, entry.name);
      }
      card.createSpan({ cls: "folder-nodes-card-title", text: entry.name, attr: { title: entry.name } });
      card.addEventListener("click", () => void this.service.openFolderNode(entry.path));
      card.addEventListener("contextmenu", (event) => this.actions.nodeMenu(event, entry));
    }
    this.more(section, entries.length);
  }

  private renderAlbum(container: HTMLElement, entries: readonly TFile[]): void {
    const section = this.section(container, `${t("album")} (${entries.length})`);
    const grid = section.createDiv({ cls: "folder-nodes-album-grid" });
    for (const entry of entries.slice(0, this.visibleLimit)) {
      const extension = entry.extension.toLocaleLowerCase();
      const card = grid.createEl("button", { cls: "folder-nodes-album-card", attr: { "aria-label": entry.name } });
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
    }
    this.more(section, entries.length);
  }

  private renderFiles(container: HTMLElement, entries: readonly (TFile | TFolder)[]): void {
    const section = this.section(container, `${t("files")} (${entries.length})`);
    const list = section.createDiv({ cls: "folder-nodes-file-list" });
    for (const entry of entries.slice(0, this.visibleLimit)) {
      const row = list.createEl("button", { cls: "folder-nodes-file-row" });
      const icon = row.createSpan({ cls: "folder-nodes-file-icon" });
      if (entry instanceof TFolder) setIcon(icon, "folder");
      else setIcon(icon, FILE_ICONS[entry.extension.toLocaleLowerCase()] ?? "file");
      row.createSpan({ cls: "folder-nodes-file-name", text: entry.name, attr: { title: entry.name } });
      if (entry instanceof TFile && entry.extension !== "") row.createSpan({ cls: "folder-nodes-file-extension", text: entry.extension.toLocaleUpperCase() });
      row.addEventListener("click", () => {
        if (entry instanceof TFolder) this.setFolder(entry.path);
        else void this.app.workspace.getLeaf(false).openFile(entry);
      });
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
