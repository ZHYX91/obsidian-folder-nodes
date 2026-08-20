import { ItemView, setIcon, TFile, TFolder, WorkspaceLeaf } from "obsidian";

import { t } from "./i18n";
import type { ChildOrderRecord, NodeVisual } from "../core/types";
import { renderVisual } from "./render-visual";

const IMAGE_EXTENSION = /^(?:avif|bmp|gif|jpe?g|png|svg|webp)$/iu;
const MEDIA_ICONS: Record<string, string> = {
  pdf: "file-text", mp3: "audio-lines", m4a: "audio-lines", ogg: "audio-lines", wav: "audio-lines",
  mp4: "video", mov: "video", webm: "video",
};

interface ContentsService {
  getFolder(path: string): TFolder | null;
  children(path: string): ChildOrderRecord[];
  openFolderNode(path: string, newLeaf?: boolean): Promise<void>;
}

interface ContentsVisuals { resolve(folder: TFolder): NodeVisual; }

interface ContentsActions {
  createChild(folder: TFolder): void;
  nodeMenu(event: MouseEvent, folder: TFolder): void;
  editVisual(folder: TFolder): void;
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
    const children = this.service.children(folder.path).flatMap(({ childPath }) => {
      const child = this.service.getFolder(childPath);
      return child === null ? [] : [child];
    });
    const files = folder.children.filter((entry): entry is TFile => entry instanceof TFile && entry.extension.toLocaleLowerCase() !== "md");
    this.renderNodes(container, children);
    this.renderFiles(container, files);
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
    const visual = identity.createEl("button", { cls: "folder-nodes-current-visual" });
    renderVisual(visual, this.visuals.resolve(folder), t("editVisual"));
    visual.addEventListener("click", () => this.actions.editVisual(folder));
    const title = identity.createEl("h3", { text: folder.path === "" ? this.app.vault.getName() : folder.name });
    title.setAttr("title", folder.path);
    const create = header.createEl("button", { cls: "clickable-icon", attr: { "aria-label": t("createChild") } });
    setIcon(create, "folder-plus");
    create.addEventListener("click", () => this.actions.createChild(folder));
  }

  private renderNodes(container: HTMLElement, entries: readonly TFolder[]): void {
    const section = this.section(container, `${t("nodes")} (${entries.length})`);
    const grid = section.createDiv({ cls: "folder-nodes-card-grid folder-nodes-node-grid" });
    for (const entry of entries.slice(0, this.visibleLimit)) {
      const card = grid.createEl("button", { cls: "folder-nodes-card folder-nodes-node-card" });
      const visual = card.createSpan({ cls: "folder-nodes-card-visual" });
      renderVisual(visual, this.visuals.resolve(entry), entry.name);
      card.createSpan({ cls: "folder-nodes-card-title", text: entry.name });
      card.addEventListener("click", () => void this.service.openFolderNode(entry.path));
      card.addEventListener("contextmenu", (event) => this.actions.nodeMenu(event, entry));
    }
    this.more(section, entries.length);
  }

  private renderFiles(container: HTMLElement, entries: readonly TFile[]): void {
    const section = this.section(container, `${t("files")} (${entries.length})`);
    const grid = section.createDiv({ cls: "folder-nodes-card-grid folder-nodes-file-grid" });
    for (const entry of entries.slice(0, this.visibleLimit)) {
      const card = grid.createEl("button", { cls: "folder-nodes-card folder-nodes-file-card" });
      const media = card.createSpan({ cls: "folder-nodes-file-preview" });
      if (IMAGE_EXTENSION.test(entry.extension)) {
        media.createEl("img", { attr: { src: this.app.vault.getResourcePath(entry), alt: entry.basename, loading: "lazy" } });
        card.addClass("is-image");
      } else {
        setIcon(media, MEDIA_ICONS[entry.extension.toLocaleLowerCase()] ?? "file");
        media.createSpan({ cls: "folder-nodes-file-type", text: entry.extension.toLocaleUpperCase() || "FILE" });
      }
      card.createSpan({ cls: "folder-nodes-card-title", text: entry.name });
      card.addEventListener("click", () => void this.app.workspace.getLeaf(false).openFile(entry));
    }
    this.more(section, entries.length);
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
