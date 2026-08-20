import { App, Component, setIcon, TFile } from "obsidian";

import type { NodeService } from "./node-service";
import type { VisualService } from "./visual-service";
import type { NodeVisual } from "../core/types";

type DropZone = "before" | "into" | "after";

export class ExplorerAdapter extends Component {
  private observer: MutationObserver | null = null;
  private draggedPath: string | null = null;
  private dropTarget: HTMLElement | null = null;

  public constructor(
    private readonly app: App,
    private readonly service: NodeService,
    private readonly visuals: VisualService,
    private readonly reportError: (error: unknown) => void,
  ) { super(); }

  public start(): void {
    this.stop();
    this.observer = new MutationObserver(() => this.decorate());
    this.observer.observe(document.body, { childList: true, subtree: true });
    this.registerDomEvent(document, "click", (event) => this.onClick(event), true);
    this.registerDomEvent(document, "dragstart", (event) => this.onDragStart(event), true);
    this.registerDomEvent(document, "dragover", (event) => this.onDragOver(event), true);
    this.registerDomEvent(document, "drop", (event) => this.onDrop(event), true);
    this.registerDomEvent(document, "dragend", () => this.clearDrop(), true);
    this.decorate();
  }

  public refresh(): void { this.decorate(true); }

  public stop(): void {
    this.observer?.disconnect();
    this.observer = null;
    this.clearDrop();
  }

  public override onunload(): void { this.stop(); }

  private decorate(force = false): void {
    for (const element of document.querySelectorAll<HTMLElement>(".nav-file-title[data-path]")) {
      const path = element.dataset.path;
      if (path === undefined) continue;
      const file = this.app.vault.getAbstractFileByPath(path);
      const parent = file instanceof TFile ? file.parent : null;
      element.toggleClass("folder-nodes-canonical-note", parent !== null && this.service.notePathForFolder(parent.path) === path);
    }
    for (const element of document.querySelectorAll<HTMLElement>(".nav-folder-title[data-path]")) {
      const path = element.dataset.path;
      const folder = path === undefined ? null : this.service.getFolder(path);
      if (folder === null || this.service.getNote(this.service.notePathForFolder(folder.path)) === null) continue;
      element.setAttr("draggable", "true");
      let icon = element.querySelector<HTMLElement>(":scope > .folder-nodes-explorer-icon");
      if (icon === null) icon = element.createSpan({ cls: "folder-nodes-explorer-icon" });
      if (force || icon.childElementCount === 0) renderVisual(icon, this.visuals.resolve(folder), folder.name);
    }
  }

  private onClick(event: MouseEvent): void {
    if (!(event.target instanceof Element) || event.target.closest(".nav-folder-collapse-indicator") !== null) return;
    const title = event.target.closest<HTMLElement>(".nav-folder-title[data-path]");
    const path = title?.dataset.path;
    if (path === undefined || this.service.getNote(this.service.notePathForFolder(path)) === null) return;
    event.preventDefault();
    event.stopPropagation();
    void this.service.openFolderNode(path, event.ctrlKey || event.metaKey);
  }

  private onDragStart(event: DragEvent): void {
    if (!(event.target instanceof Element)) return;
    const title = event.target.closest<HTMLElement>(".nav-folder-title[data-path]");
    const path = title?.dataset.path;
    if (path === undefined || this.service.getFolder(path) === null) return;
    this.draggedPath = path;
    event.dataTransfer?.setData("application/x-folder-nodes-path", path);
    if (event.dataTransfer !== null) event.dataTransfer.effectAllowed = "move";
  }

  private onDragOver(event: DragEvent): void {
    if (this.draggedPath === null || !(event.target instanceof Element)) return;
    const title = event.target.closest<HTMLElement>(".nav-folder-title[data-path]");
    if (title?.dataset.path === undefined) return;
    event.preventDefault();
    event.stopPropagation();
    const zone = this.zone(title, event.clientY);
    this.markDrop(title, zone);
    if (event.dataTransfer !== null) event.dataTransfer.dropEffect = "move";
  }

  private onDrop(event: DragEvent): void {
    if (this.draggedPath === null || !(event.target instanceof Element)) return;
    const title = event.target.closest<HTMLElement>(".nav-folder-title[data-path]");
    const targetPath = title?.dataset.path;
    const source = this.service.getFolder(this.draggedPath);
    const target = targetPath === undefined ? null : this.service.getFolder(targetPath);
    if (title === null || source === null || target === null) return;
    event.preventDefault();
    event.stopPropagation();
    const zone = this.zone(title, event.clientY);
    let parentPath = target.path;
    let index = this.service.children(parentPath).filter(({ childPath }) => childPath !== source.path).length;
    if (zone !== "into") {
      parentPath = target.parent?.path ?? "";
      const siblings = this.service.children(parentPath).filter(({ childPath }) => childPath !== source.path);
      const targetIndex = siblings.findIndex(({ childPath }) => childPath === target.path);
      index = Math.max(0, targetIndex + (zone === "after" ? 1 : 0));
    }
    void this.service.placeNode(source, parentPath, index)
      .then(() => this.refresh())
      .catch((error) => this.reportError(error));
    this.clearDrop();
  }

  private zone(element: HTMLElement, clientY: number): DropZone {
    const rect = element.getBoundingClientRect();
    const ratio = rect.height <= 0 ? 0.5 : (clientY - rect.top) / rect.height;
    return ratio < 0.25 ? "before" : ratio > 0.75 ? "after" : "into";
  }

  private markDrop(element: HTMLElement, zone: DropZone): void {
    if (this.dropTarget !== element) this.clearDrop(false);
    this.dropTarget = element;
    element.removeClass("folder-nodes-drop-before", "folder-nodes-drop-into", "folder-nodes-drop-after");
    element.addClass(`folder-nodes-drop-${zone}`);
  }

  private clearDrop(clearSource = true): void {
    this.dropTarget?.removeClass("folder-nodes-drop-before", "folder-nodes-drop-into", "folder-nodes-drop-after");
    this.dropTarget = null;
    if (clearSource) this.draggedPath = null;
  }
}
function renderVisual(container: HTMLElement, visual: NodeVisual, label: string): void {
  container.empty();
  container.addClass("folder-nodes-visual");
  container.setAttr("aria-label", label);
  if (visual.kind === "image") {
    container.createEl("img", { attr: { src: visual.value, alt: "", loading: "lazy" } });
  } else if (visual.kind === "emoji") {
    container.createSpan({ cls: "folder-nodes-visual-emoji", text: visual.value });
  } else if (visual.kind === "color") {
    const swatch = container.createSpan({ cls: "folder-nodes-visual-color" });
    swatch.style.backgroundColor = visual.value;
  } else {
    setIcon(container, visual.value);
  }
}
