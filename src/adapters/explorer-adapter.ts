import { App, Component, MarkdownView, setIcon, TAbstractFile, TFile } from "obsidian";

import { ensureExplorerIconPosition, ensureExplorerRootRow, explorerMarkerPlacement, isFolderCollapseControl } from "./explorer-events";
import type { NodeService } from "./node-service";
import type { VisualService } from "./visual-service";
import { classifyFileIdentity, classifyFolderIdentity } from "../core/identity";
import type { FolderNodesSettings, NodeDropZone, NodeVisual } from "../core/types";

export class ExplorerAdapter extends Component {
  private observer: MutationObserver | null = null;
  private draggedPath: string | null = null;
  private dropTarget: HTMLElement | null = null;

  public constructor(
    private readonly app: App,
    private readonly service: NodeService,
    private readonly visuals: VisualService,
    private readonly getSettings: () => FolderNodesSettings,
    private readonly getRootLabels: () => { root: string; node: string; nodeConflict: string; missingNodeNote: string; missingNodeFolder: string },
    private readonly reportError: (error: unknown) => void,
  ) { super(); }

  public start(): void {
    this.stop();
    this.observer = new MutationObserver(() => this.decorate());
    this.observer.observe(document.body, { childList: true, subtree: true });
    this.registerDomEvent(document, "click", (event) => this.onClick(event), true);
    this.registerDomEvent(document, "keydown", (event) => this.onKeyDown(event), true);
    this.registerDomEvent(document, "dragstart", (event) => this.onDragStart(event), true);
    this.registerDomEvent(document, "dragover", (event) => this.onDragOver(event), true);
    this.registerDomEvent(document, "drop", (event) => this.onDrop(event), true);
    this.registerDomEvent(document, "dragend", () => this.clearDrop(), true);
    this.decorate();
  }

  public refresh(): void { this.decorate(true); }

  public async reveal(entry: TAbstractFile): Promise<boolean> {
    const leaf = this.app.workspace.getLeavesOfType("file-explorer")[0];
    const view = leaf?.view as unknown as { revealInFolder?: (file: TAbstractFile) => Promise<void> | void } | undefined;
    if (leaf === undefined || view?.revealInFolder === undefined) return false;
    await view.revealInFolder(entry);
    await this.app.workspace.revealLeaf(leaf);
    return true;
  }

  public stop(): void {
    this.observer?.disconnect();
    this.observer = null;
    this.clearDrop();
  }

  public override onunload(): void { this.stop(); }

  private decorate(force = false): void {
    this.decorateRoot();
    for (const element of document.querySelectorAll<HTMLElement>(".nav-file-title[data-path]")) {
      const path = element.dataset.path;
      if (path === undefined) continue;
      const file = this.app.vault.getAbstractFileByPath(path);
      const parent = file instanceof TFile ? file.parent : null;
      const managedParent = parent !== null && !this.service.isIgnoredPath(parent.path);
      const canonical = managedParent && this.service.notePathForFolder(parent.path) === path;
      element.toggleClass("folder-nodes-canonical-note", canonical);
      const counterpartPath = file instanceof TFile && parent !== null ? (parent.path === "" ? file.basename : `${parent.path}/${file.basename}`) : "";
      const counterpart = this.service.getFolder(counterpartPath);
      const identity = file instanceof TFile && parent !== null ? classifyFileIdentity({
        canonicalNodeNote: canonical,
        counterpartNodeExists: counterpart !== null && this.service.getNote(this.service.notePathForFolder(counterpart.path)) !== null,
        ignored: !managedParent,
        leafExempt: this.service.isLeafNoteExempt(file.path),
        markdown: file.extension.toLocaleLowerCase() === "md",
      }) : "ordinary";
      const problem = this.getSettings().adoptionState === "managed" && (identity === "missing-folder" || identity === "conflict");
      element.toggleClass("folder-nodes-missing-folder-note", problem);
      let status = element.querySelector<HTMLElement>(":scope > .folder-nodes-explorer-status-icon");
      if (!problem) {
        status?.remove();
        continue;
      }
      if (status === null) status = createSpan({ cls: "folder-nodes-explorer-status-icon is-warning" });
      const title = element.querySelector<HTMLElement>(":scope > .nav-file-title-content");
      ensureExplorerIconPosition(element, status, title, "before");
      if (status.childElementCount === 0) setIcon(status, "file-warning");
      const label = identity === "conflict" ? this.getRootLabels().nodeConflict : this.getRootLabels().missingNodeFolder;
      status.setAttr("aria-label", label);
      status.setAttr("title", label);
    }
    for (const element of document.querySelectorAll<HTMLElement>(".nav-folder-title[data-path]")) {
      const path = element.dataset.path;
      const folder = path === undefined ? null : this.service.getFolder(path);
      if (folder === null) continue;
      const identity = classifyFolderIdentity(
        this.service.isIgnoredPath(folder.path),
        this.service.getNote(this.service.notePathForFolder(folder.path)) !== null,
      );
      if (identity === "ordinary") {
        element.querySelector(":scope > .folder-nodes-explorer-icon")?.remove();
        element.removeClass("folder-nodes-node", "folder-nodes-missing-note");
        element.removeAttribute("draggable");
        continue;
      }
      element.toggleClass("folder-nodes-node", identity === "node");
      element.toggleClass("folder-nodes-missing-note", identity === "missing-note");
      let icon = element.querySelector<HTMLElement>(":scope > .folder-nodes-explorer-icon");
      if (icon === null) icon = createSpan({ cls: "folder-nodes-explorer-icon" });
      const title = element.querySelector<HTMLElement>(":scope > .nav-folder-title-content");
      if (identity === "missing-note") {
        element.removeAttribute("draggable");
        icon.removeClass("is-default-node");
        icon.addClass("is-warning");
        ensureExplorerIconPosition(element, icon, title, "before");
        this.renderExplorerMarker(icon, { kind: "lucide", value: "folder-warning", inheritedFrom: null }, this.getRootLabels().missingNodeNote, force);
        continue;
      }
      element.setAttr("draggable", "true");
      const position = this.getSettings().explorerIconPosition;
      const resolved = this.visuals.resolve(folder);
      const marker = explorerMarkerPlacement(position, resolved.kind === "fallback");
      const useDefault = marker.useDefault;
      const visual: NodeVisual = useDefault ? { kind: "lucide", value: "folder-tree", inheritedFrom: null } : resolved;
      icon.toggleClass("is-default-node", useDefault);
      icon.removeClass("is-warning");
      ensureExplorerIconPosition(element, icon, title, marker.position);
      this.renderExplorerMarker(icon, visual, `${folder.name} · ${this.getRootLabels().node}`, force);
    }
    this.decorateNoteTitles(force);
  }

  private renderExplorerMarker(icon: HTMLElement, visual: NodeVisual, label: string, force: boolean): void {
    const key = `${visual.kind}:${visual.value}:${visual.inheritedFrom ?? ""}:${label}`;
    if (!force && icon.dataset.visualKey === key && icon.childElementCount > 0) return;
    renderVisual(icon, visual, label);
    icon.dataset.visualKey = key;
    icon.setAttr("title", label);
  }

  private decorateRoot(): void {
    const notePath = this.service.rootNotePath();
    const missing = this.service.getNote(notePath) === null;
    const active = this.app.workspace.getActiveFile()?.path === notePath;
    const labels = this.getRootLabels();
    for (const container of document.querySelectorAll<HTMLElement>(".nav-files-container")) {
      const { row, icon, title, badge } = ensureExplorerRootRow(container);
      const titleLabel = this.app.vault.getName();
      const accessibleLabel = titleLabel + " · " + labels.root;
      if (icon.childElementCount === 0) setIcon(icon, "home");
      if (title.textContent !== titleLabel) title.setText(titleLabel);
      if (badge.textContent !== labels.root) badge.setText(labels.root);
      row.toggleClass("is-active", active);
      row.toggleClass("is-missing", missing);
      row.setAttr("aria-label", missing ? accessibleLabel + ": " + labels.missingNodeNote : accessibleLabel);
      row.setAttr("title", missing ? labels.missingNodeNote : labels.root);
    }
  }

  private decorateNoteTitles(force: boolean): void {
    for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
      if (!(leaf.view instanceof MarkdownView)) continue;
      const title = leaf.view.containerEl.querySelector<HTMLElement>(".inline-title");
      if (title === null) continue;
      let icon = title.querySelector<HTMLElement>(":scope > .folder-nodes-note-title-icon");
      const file = leaf.view.file;
      const folder = file?.parent ?? null;
      const canonical = file !== null && folder !== null && this.service.notePathForFolder(folder.path) === file.path;
      const resolved = folder === null ? null : this.visuals.resolve(folder);
      if (!this.getSettings().showIconInNoteTitle || !canonical || resolved?.kind === "fallback") {
        icon?.remove();
        continue;
      }
      if (icon === null) {
        icon = createSpan({ cls: "folder-nodes-note-title-icon" });
        title.prepend(icon);
      }
      if ((force || icon.childElementCount === 0) && resolved !== null) renderVisual(icon, resolved, folder.name);
    }
  }

  private onClick(event: MouseEvent): void {
    if (!(event.target instanceof Element)) return;
    if (event.target.closest(".folder-nodes-explorer-root") !== null) {
      event.preventDefault();
      event.stopPropagation();
      void this.service.openFolderNode("", event.ctrlKey || event.metaKey);
      return;
    }
    if (isFolderCollapseControl(event.target)) return;
    const title = event.target.closest<HTMLElement>(".nav-folder-title[data-path]");
    const path = title?.dataset.path;
    if (path === undefined || this.service.isIgnoredPath(path) || this.service.getNote(this.service.notePathForFolder(path)) === null) return;
    event.preventDefault();
    event.stopPropagation();
    void this.service.openFolderNode(path, event.ctrlKey || event.metaKey);
  }

  private onKeyDown(event: KeyboardEvent): void {
    if ((event.key !== "Enter" && event.key !== " ") || !(event.target instanceof Element) ||
      event.target.closest(".folder-nodes-explorer-root") === null) return;
    event.preventDefault();
    event.stopPropagation();
    void this.service.openFolderNode("");
  }

  private onDragStart(event: DragEvent): void {
    if (!(event.target instanceof Element)) return;
    const title = event.target.closest<HTMLElement>(".nav-folder-title[data-path]");
    const path = title?.dataset.path;
    if (path === undefined || this.service.isIgnoredPath(path) || this.service.getFolder(path) === null || this.service.getNote(this.service.notePathForFolder(path)) === null) return;
    this.draggedPath = path;
    event.dataTransfer?.setData("application/x-folder-nodes-path", path);
    if (event.dataTransfer !== null) event.dataTransfer.effectAllowed = "move";
  }

  private onDragOver(event: DragEvent): void {
    if (this.draggedPath === null || !(event.target instanceof Element)) return;
    const title = event.target.closest<HTMLElement>(".nav-folder-title[data-path]");
    if (title?.dataset.path === undefined || this.service.isIgnoredPath(title.dataset.path)) return;
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
    if (title === null || source === null || target === null || this.service.isIgnoredPath(target.path)) return;
    event.preventDefault();
    event.stopPropagation();
    const zone = this.zone(title, event.clientY);
    void this.service.placeNodeRelative(source, target, zone)
      .then(() => this.refresh())
      .catch((error) => this.reportError(error));
    this.clearDrop();
  }

  private zone(element: HTMLElement, clientY: number): NodeDropZone {
    const rect = element.getBoundingClientRect();
    const ratio = rect.height <= 0 ? 0.5 : (clientY - rect.top) / rect.height;
    return ratio < 0.25 ? "before" : ratio > 0.75 ? "after" : "into";
  }

  private markDrop(element: HTMLElement, zone: NodeDropZone): void {
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
  if (visual.inheritedFrom !== null) container.dataset.inheritedFrom = visual.inheritedFrom;
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
