import { ItemView, setIcon, TFile, TFolder, WorkspaceLeaf } from "obsidian";

interface ContentsService {
  getFolder(path: string): TFolder | null;
  openFolderNode(path: string, newLeaf?: boolean): Promise<void>;
}

export const CONTENTS_VIEW_TYPE = "folder-nodes-contents";

export class FolderNodeContentsView extends ItemView {
  private folderPath = "";
  private visibleLimit = 200;

  public constructor(leaf: WorkspaceLeaf, private readonly service: ContentsService) {
    super(leaf);
  }

  public override getViewType(): string { return CONTENTS_VIEW_TYPE; }
  public override getDisplayText(): string { return "Node contents"; }
  public override getIcon(): string { return "folder-tree"; }

  public setFolder(path: string): void {
    this.folderPath = path;
    this.visibleLimit = 200;
    this.render();
  }

  public override async onOpen(): Promise<void> { this.render(); }

  private render(): void {
    const container = this.contentEl;
    container.empty();
    container.addClass("folder-nodes-contents");
    const folder = this.folderPath === "" ? this.app.vault.getRoot() : this.service.getFolder(this.folderPath);
    if (folder === null) {
      container.createEl("p", { text: "Open a note inside a Folder Node to view its contents." });
      return;
    }
    const header = container.createDiv({ cls: "folder-nodes-contents-header" });
    const title = header.createEl("h3", { text: folder.path === "" ? this.app.vault.getName() : folder.name });
    title.setAttr("title", folder.path);
    if (folder.parent !== null) {
      const up = header.createEl("button", { attr: { "aria-label": "Open parent node" } });
      setIcon(up, "arrow-up");
      up.addEventListener("click", () => this.setFolder(folder.parent?.path ?? ""));
    }
    const children = folder.children.filter((entry): entry is TFolder => entry instanceof TFolder);
    const files = folder.children.filter((entry): entry is TFile => entry instanceof TFile && entry.extension.toLocaleLowerCase() !== "md");
    this.renderSection(container, "Nodes", children, (entry) => void this.service.openFolderNode(entry.path));
    this.renderSection(container, "Files", files, (entry) => void this.app.workspace.getLeaf(false).openFile(entry));
  }

  private renderSection<T extends TFile | TFolder>(
    container: HTMLElement,
    title: string,
    entries: readonly T[],
    open: (entry: T) => void,
  ): void {
    container.createEl("h4", { text: `${title} (${entries.length})` });
    const list = container.createDiv({ cls: "folder-nodes-contents-list" });
    for (const entry of entries.slice(0, this.visibleLimit)) {
      const button = list.createEl("button", { cls: "folder-nodes-content-row" });
      const icon = button.createSpan();
      setIcon(icon, entry instanceof TFolder ? "folder" : "file");
      button.createSpan({ text: entry.name });
      button.addEventListener("click", () => open(entry));
    }
    if (entries.length > this.visibleLimit) {
      const more = list.createEl("button", { text: `Show ${Math.min(200, entries.length - this.visibleLimit)} more` });
      more.addEventListener("click", () => {
        this.visibleLimit += 200;
        this.render();
      });
    }
  }
}
