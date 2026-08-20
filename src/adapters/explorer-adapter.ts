import { App, Component, setIcon, TFile } from "obsidian";

import type { NodeService } from "./node-service";

export class ExplorerAdapter extends Component {
  private observer: MutationObserver | null = null;

  public constructor(private readonly app: App, private readonly service: NodeService) { super(); }

  public start(): void {
    this.stop();
    this.observer = new MutationObserver(() => this.decorate());
    this.observer.observe(document.body, { childList: true, subtree: true });
    this.registerDomEvent(document, "click", (event) => this.onClick(event), true);
    this.decorate();
  }

  public stop(): void {
    this.observer?.disconnect();
    this.observer = null;
  }

  public override onunload(): void { this.stop(); }

  private decorate(): void {
    for (const element of document.querySelectorAll<HTMLElement>(".nav-file-title[data-path]")) {
      const path = element.dataset.path;
      if (path === undefined) continue;
      const file = this.app.vault.getAbstractFileByPath(path);
      const parent = file instanceof TFile ? file.parent : null;
      element.toggleClass("folder-nodes-canonical-note", parent !== null && this.service.notePathForFolder(parent.path) === path);
    }
    for (const element of document.querySelectorAll<HTMLElement>(".nav-folder-title[data-path]")) {
      if (element.querySelector(":scope > .folder-nodes-explorer-icon") !== null) continue;
      const icon = element.createSpan({ cls: "folder-nodes-explorer-icon" });
      setIcon(icon, "folder-tree");
    }
  }

  private onClick(event: MouseEvent): void {
    if (!(event.target instanceof Element)) return;
    if (event.target.closest(".nav-folder-collapse-indicator") !== null) return;
    const title = event.target.closest<HTMLElement>(".nav-folder-title[data-path]");
    const path = title?.dataset.path;
    if (path === undefined) return;
    const note = this.service.getNote(this.service.notePathForFolder(path));
    if (note === null) return;
    event.preventDefault();
    event.stopPropagation();
    void this.service.openFolderNode(path, event.ctrlKey || event.metaKey);
  }
}
