import { App, Component, MarkdownView, setIcon, TAbstractFile, TFile, TFolder } from "obsidian";

import { alignNoteTitleIcon, ensureExplorerIconPosition, ensureExplorerRootRow, ensureNoteTitleIcon, explorerMarkerPlacement, isFolderCollapseControl, removeNoteTitleIcon, syncExplorerNodeOrder } from "./explorer-events";
import type { NodeService } from "./node-service";
import type { VisualService } from "./visual-service";
import { classifyFileIdentity, classifyFolderIdentity } from "../core/identity";
import type { FolderNodesSettings, NodeDropZone, NodeVisual } from "../core/types";
import { renderVisual } from "../presentation/render-visual";

interface ExplorerSurface {
  abort: AbortController;
  observer: MutationObserver;
  root: HTMLElement;
}

interface NoteTitleSurface {
  observer: MutationObserver;
  resizeObserver: ResizeObserver | null;
  root: HTMLElement;
}

export class ExplorerAdapter extends Component {
  private readonly surfaces = new Map<HTMLElement, ExplorerSurface>();
  private readonly noteTitleSurfaces = new Map<HTMLElement, NoteTitleSurface>();
  private readonly originalOrders = new Map<HTMLElement, Element[]>();
  private decorateTimer: number | null = null;
  private draggedPath: string | null = null;
  private selectedFolderPath: string | null = null;
  private dropTarget: HTMLElement | null = null;

  public constructor(
    private readonly app: App,
    private readonly service: NodeService,
    private readonly visuals: VisualService,
    private readonly getSettings: () => FolderNodesSettings,
    private readonly getRootLabels: () => {
      createNode: string; incompleteNode: string; missingNodeFolder: string; missingNodeNote: string;
      node: string; nodeConflict: string; root: string; unmanaged: string;
    },
    private readonly createNode: (parentPath: string) => void,
    private readonly completeNode: (entry: TFile | TFolder) => void,
    private readonly notifyChanged: () => void,
    private readonly reportError: (error: unknown) => void,
    private readonly dragEnabled = true,
  ) { super(); }

  public start(): void {
    this.stop();
    this.syncSurfaces();
    this.decorate();
  }

  public refresh(): void {
    this.syncSurfaces();
    this.decorate();
  }

  public async reveal(entry: TAbstractFile): Promise<boolean> {
    const leaf = this.app.workspace.getLeavesOfType("file-explorer")[0];
    const view = leaf?.view as unknown as { revealInFolder?: (file: TAbstractFile) => Promise<void> | void } | undefined;
    if (leaf === undefined || view?.revealInFolder === undefined) return false;
    await view.revealInFolder(entry);
    await this.app.workspace.revealLeaf(leaf);
    return true;
  }

  public stop(): void {
    if (this.decorateTimer !== null) window.clearTimeout(this.decorateTimer);
    this.decorateTimer = null;
    this.clearDrop();
    this.restoreOrders();
    for (const surface of this.surfaces.values()) {
      surface.observer.disconnect();
      surface.abort.abort();
      this.cleanupSurface(surface.root);
    }
    this.surfaces.clear();
    for (const surface of this.noteTitleSurfaces.values()) {
      surface.observer.disconnect();
      surface.resizeObserver?.disconnect();
      this.cleanupNoteTitleSurface(surface.root);
    }
    this.noteTitleSurfaces.clear();
  }

  public override onunload(): void { this.stop(); }

  private syncSurfaces(): void {
    const active = new Set<HTMLElement>();
    for (const leaf of this.app.workspace.getLeavesOfType("file-explorer")) {
      const root = (leaf.view as unknown as { containerEl?: HTMLElement }).containerEl;
      if (root === undefined) continue;
      active.add(root);
      if (this.surfaces.has(root)) continue;
      const ownerWindow = root.ownerDocument.defaultView;
      const Observer = ownerWindow?.MutationObserver ?? MutationObserver;
      const Abort = ownerWindow?.AbortController ?? AbortController;
      const abort = new Abort();
      const observer = new Observer(() => this.scheduleDecorate());
      observer.observe(root, { childList: true, subtree: true });
      root.addEventListener("click", (event) => this.onClick(event), { capture: true, signal: abort.signal });
      root.addEventListener("keydown", (event) => this.onKeyDown(event), { capture: true, signal: abort.signal });
      if (this.dragEnabled) {
        root.addEventListener("dragstart", (event) => this.onDragStart(event), { capture: true, signal: abort.signal });
        root.addEventListener("dragover", (event) => this.onDragOver(event), { capture: true, signal: abort.signal });
        root.addEventListener("drop", (event) => this.onDrop(event), { capture: true, signal: abort.signal });
        root.addEventListener("dragend", () => this.clearDrop(), { capture: true, signal: abort.signal });
      }
      this.surfaces.set(root, { abort, observer, root });
    }
    for (const [root, surface] of this.surfaces) {
      if (active.has(root) && root.isConnected) continue;
      surface.observer.disconnect();
      surface.abort.abort();
      this.cleanupSurface(root);
      for (const container of this.originalOrders.keys()) if (root.contains(container)) this.originalOrders.delete(container);
      this.surfaces.delete(root);
    }
    this.syncNoteTitleSurfaces();
  }

  private syncNoteTitleSurfaces(): void {
    const active = new Set<HTMLElement>();
    for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
      if (!(leaf.view instanceof MarkdownView)) continue;
      const root = leaf.view.containerEl;
      active.add(root);
      if (this.noteTitleSurfaces.has(root)) continue;
      const Observer = root.ownerDocument.defaultView?.MutationObserver ?? MutationObserver;
      const observer = new Observer(() => this.scheduleDecorate());
      observer.observe(root, { childList: true, subtree: true });
      const ResizeObserverConstructor = root.ownerDocument.defaultView?.ResizeObserver;
      const resizeObserver = ResizeObserverConstructor === undefined ? null : new ResizeObserverConstructor(() => this.scheduleDecorate());
      resizeObserver?.observe(root);
      this.noteTitleSurfaces.set(root, { observer, resizeObserver, root });
    }
    for (const [root, surface] of this.noteTitleSurfaces) {
      if (active.has(root) && root.isConnected) continue;
      surface.observer.disconnect();
      surface.resizeObserver?.disconnect();
      this.cleanupNoteTitleSurface(root);
      this.noteTitleSurfaces.delete(root);
    }
  }

  private scheduleDecorate(): void {
    if (this.decorateTimer !== null) return;
    this.decorateTimer = window.setTimeout(() => {
      this.decorateTimer = null;
      this.syncSurfaces();
      this.decorate();
    }, 32);
  }

  private decorate(): void {
    for (const { root } of this.surfaces.values()) {
      this.decorateRoot(root);
      this.decorateCreateActions(root);
      this.decorateEntries(root);
      this.syncNodeOrder(root);
    }
    this.decorateNoteTitles();
  }

  private decorateEntries(root: HTMLElement): void {
    for (const element of root.querySelectorAll<HTMLElement>(".nav-file-title[data-path]")) {
      const path = element.dataset.path;
      if (path === undefined) continue;
      const file = this.app.vault.getAbstractFileByPath(path);
      const parent = file instanceof TFile ? file.parent : null;
      const managedParent = parent !== null && !this.service.isIgnoredPath(parent.path);
      const canonical = managedParent && file instanceof TFile && this.service.isCanonicalFile(file);
      element.toggleClass("folder-nodes-canonical-note", canonical);
      const counterpartPath = file instanceof TFile && parent !== null ? (parent.path === "" ? file.basename : `${parent.path}/${file.basename}`) : "";
      const counterpart = this.service.getFolder(counterpartPath);
      const identity = file instanceof TFile && parent !== null ? classifyFileIdentity({
        canonicalNodeNote: canonical,
        counterpartNodeExists: counterpart !== null && this.service.getCanonicalFile(counterpart.path) !== null,
        parentUnmanaged: !managedParent,
        leafExempt: this.service.isLeafNoteExempt(file.path),
        markdown: file.extension.toLocaleLowerCase() === "md",
      }) : "ordinary";
      const labelled = identity === "incomplete" || identity === "conflict" || identity === "unmanaged";
      element.toggleClass("folder-nodes-missing-folder-note", identity === "incomplete" || identity === "conflict");
      let badge = element.querySelector<HTMLElement>(":scope > .folder-nodes-explorer-problem-badge");
      let repair = element.querySelector<HTMLButtonElement>(":scope > .folder-nodes-explorer-repair");
      element.querySelector(":scope > .folder-nodes-explorer-status-icon")?.remove();
      if (!labelled) {
        badge?.remove();
        repair?.remove();
        continue;
      }
      if (badge === null) {
        badge = ownedSpan(element.ownerDocument, "folder-nodes-explorer-problem-badge");
        element.append(badge);
      }
      badge.removeClass("is-conflict", "is-incomplete", "is-unmanaged");
      const label = identity === "conflict" ? this.getRootLabels().nodeConflict : identity === "unmanaged" ? this.getRootLabels().unmanaged : this.getRootLabels().incompleteNode;
      const detail = identity === "incomplete" ? `${this.getRootLabels().incompleteNode}: ${this.service.notePathForFolder(counterpartPath)}` : label;
      badge.addClass(identity === "conflict" ? "is-conflict" : identity === "unmanaged" ? "is-unmanaged" : "is-incomplete");
      badge.setText(label);
      badge.setAttr("title", detail);
      if (identity === "incomplete" && file instanceof TFile) {
        if (repair === null) repair = this.createRepairButton(element, file.path, "folder-plus", this.getRootLabels().missingNodeFolder);
        repair.dataset.path = file.path;
      } else repair?.remove();
    }

    for (const element of root.querySelectorAll<HTMLElement>(".nav-folder-title[data-path]")) {
      const path = element.dataset.path;
      const folder = path === undefined ? null : this.service.getFolder(path);
      if (folder === null) continue;
      const identity = classifyFolderIdentity(
        this.service.isIgnoredPath(folder.path),
        this.service.isIgnoredRootPath(folder.path),
        this.service.getCanonicalFile(folder.path) !== null,
      );
      if (identity === "ordinary") {
        element.querySelector(":scope > .folder-nodes-explorer-icon")?.remove();
        element.querySelector(":scope > .folder-nodes-explorer-problem-badge")?.remove();
        element.querySelector(":scope > .folder-nodes-explorer-repair")?.remove();
        element.removeClass("folder-nodes-node", "folder-nodes-missing-note");
        restoreOwnedDraggable(element);
        continue;
      }
      element.toggleClass("folder-nodes-node", identity === "node");
      element.toggleClass("folder-nodes-missing-note", identity === "incomplete");
      let icon = element.querySelector<HTMLElement>(":scope > .folder-nodes-explorer-icon");
      let problemBadge = element.querySelector<HTMLElement>(":scope > .folder-nodes-explorer-problem-badge");
      let repair = element.querySelector<HTMLButtonElement>(":scope > .folder-nodes-explorer-repair");
      const title = element.querySelector<HTMLElement>(":scope > .nav-folder-title-content");
      if (identity === "unmanaged") {
        icon?.remove();
        repair?.remove();
        restoreOwnedDraggable(element);
        if (problemBadge === null) {
          problemBadge = ownedSpan(element.ownerDocument, "folder-nodes-explorer-problem-badge");
          element.append(problemBadge);
        }
        problemBadge.removeClass("is-conflict", "is-incomplete");
        problemBadge.addClass("is-unmanaged");
        problemBadge.setText(this.getRootLabels().unmanaged);
        problemBadge.setAttr("title", this.getRootLabels().unmanaged);
        continue;
      }
      if (icon === null) icon = ownedSpan(element.ownerDocument, "folder-nodes-explorer-icon");
      if (identity === "incomplete") {
        restoreOwnedDraggable(element);
        icon.addClass("is-default-node");
        icon.removeClass("is-warning");
        ensureExplorerIconPosition(element, icon, title, "before");
        this.renderExplorerMarker(icon, { kind: "lucide", value: "folder-tree", accent: null, inheritedFrom: null }, this.getRootLabels().missingNodeNote);
        if (problemBadge === null) {
          problemBadge = ownedSpan(element.ownerDocument, "folder-nodes-explorer-problem-badge");
          element.append(problemBadge);
        }
        problemBadge.removeClass("is-conflict", "is-unmanaged");
        problemBadge.addClass("is-incomplete");
        problemBadge.setText(this.getRootLabels().incompleteNode);
        problemBadge.setAttr("title", this.getRootLabels().missingNodeNote);
        if (repair === null) repair = this.createRepairButton(element, folder.path, "file-plus", this.getRootLabels().missingNodeNote);
        repair.dataset.path = folder.path;
        continue;
      }
      problemBadge?.remove();
      repair?.remove();
      if (this.dragEnabled) setOwnedDraggable(element);
      else restoreOwnedDraggable(element);
      const resolved = this.visuals.resolve(folder);
      const marker = explorerMarkerPlacement(this.getSettings().explorerIconPosition, resolved.kind === "fallback");
      const visual: NodeVisual = marker.useDefault ? { kind: "lucide", value: "folder-tree", accent: null, inheritedFrom: null } : resolved;
      icon.toggleClass("is-default-node", marker.useDefault);
      icon.removeClass("is-warning");
      ensureExplorerIconPosition(element, icon, title, marker.position);
      this.renderExplorerMarker(icon, visual, `${folder.name} · ${this.getRootLabels().node}`);
    }
  }

  private decorateCreateActions(root: HTMLElement): void {
    const labels = this.getRootLabels();
    const parentPath = this.createParentPath();
    const parent = parentPath === "" ? this.app.vault.getRoot() : this.service.getFolder(parentPath);
    const managed = parent !== null && !this.service.isIgnoredPath(parent.path);
    const containers = new Set<HTMLElement>();
    for (const files of root.querySelectorAll<HTMLElement>(".nav-files-container")) {
      const actions = files.closest<HTMLElement>(".workspace-leaf-content")?.querySelector<HTMLElement>(".nav-header .nav-buttons-container");
      if (actions !== null && actions !== undefined) containers.add(actions);
    }
    for (const container of containers) {
      let button = container.querySelector<HTMLButtonElement>(":scope > .folder-nodes-create-node");
      if (button === null) {
        button = container.ownerDocument.createElement("button");
        button.type = "button";
        button.className = "clickable-icon nav-action-button folder-nodes-create-node";
        setIcon(button, "folder-tree");
        button.addEventListener("click", () => {
          const path = button?.dataset.parentPath;
          if (path !== undefined) this.createNode(path);
        });
        container.prepend(button);
      }
      button.dataset.parentPath = parent?.path ?? "";
      button.setAttribute("aria-label", labels.createNode);
      button.setAttribute("title", labels.createNode);
      button.classList.toggle("is-hidden", !managed);
    }
  }

  private createRepairButton(container: HTMLElement, path: string, icon: string, label: string): HTMLButtonElement {
    const button = container.ownerDocument.createElement("button");
    button.type = "button";
    button.className = "clickable-icon folder-nodes-explorer-repair";
    button.dataset.path = path;
    button.setAttribute("aria-label", label);
    button.setAttribute("title", label);
    setIcon(button, icon);
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const targetPath = button.dataset.path;
      if (targetPath === undefined) return;
      const entry = this.service.getFolder(targetPath) ?? this.service.getFile(targetPath);
      if (entry !== null) this.completeNode(entry);
    });
    container.append(button);
    return button;
  }

  private createParentPath(): string {
    if (this.selectedFolderPath !== null && this.service.getFolder(this.selectedFolderPath) !== null) return this.selectedFolderPath;
    return this.app.workspace.getActiveFile()?.parent?.path ?? "";
  }

  private syncNodeOrder(root: HTMLElement): void {
    for (const container of root.querySelectorAll<HTMLElement>(".nav-files-container, .nav-folder-children")) {
      const parentPath = container.matches(".nav-files-container") ? "" : container.parentElement?.querySelector<HTMLElement>(":scope > .nav-folder-title[data-path]")?.dataset.path;
      if (parentPath === undefined) continue;
      const before = Array.from(container.children);
      const changed = syncExplorerNodeOrder(container, this.service.children(parentPath).map(({ childPath }) => childPath));
      if (changed && !this.originalOrders.has(container)) this.originalOrders.set(container, before);
    }
  }

  private renderExplorerMarker(icon: HTMLElement, visual: NodeVisual, label: string): void {
    const key = `${visual.kind}:${visual.value}:${visual.accent ?? ""}:${visual.inheritedFrom ?? ""}:${label}`;
    if (icon.dataset.visualKey === key && icon.childElementCount > 0) return;
    renderVisual(icon, visual, label);
    icon.dataset.visualKey = key;
    icon.setAttr("title", label);
  }

  private decorateRoot(root: HTMLElement): void {
    const rootNote = this.service.getCanonicalFile("");
    const missing = rootNote === null;
    const active = rootNote !== null && this.app.workspace.getActiveFile() === rootNote;
    const labels = this.getRootLabels();
    for (const container of root.querySelectorAll<HTMLElement>(".nav-files-container")) {
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

  private decorateNoteTitles(): void {
    const liveHosts = new Set<HTMLElement>();
    for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
      if (!(leaf.view instanceof MarkdownView) || !this.noteTitleSurfaces.has(leaf.view.containerEl)) continue;
      const title = leaf.view.containerEl.querySelector<HTMLElement>(".inline-title");
      const host = title?.parentElement ?? null;
      if (title === null || host === null) continue;
      liveHosts.add(host);
      let icon = host.querySelector<HTMLElement>(":scope > .folder-nodes-note-title-icon");
      const file = leaf.view.file;
      const folder = file?.parent ?? null;
      const canonical = file !== null && folder !== null && this.service.isCanonicalFile(file);
      const resolved = folder === null ? null : this.visuals.resolve(folder);
      if (!this.getSettings().showIconInNoteTitle || !canonical || resolved?.kind === "fallback") {
        removeNoteTitleIcon(title);
        continue;
      }
      if (icon === null) icon = ensureNoteTitleIcon(title);
      if (resolved !== null) this.renderExplorerMarker(icon, resolved, folder.name);
      alignNoteTitleIcon(title, icon);
    }
    for (const { root } of this.noteTitleSurfaces.values()) {
      for (const icon of root.querySelectorAll<HTMLElement>(".folder-nodes-note-title-icon")) {
        if (!liveHosts.has(icon.parentElement as HTMLElement)) icon.remove();
      }
      for (const title of root.querySelectorAll<HTMLElement>(".folder-nodes-has-title-icon")) {
        const host = title.parentElement;
        if (host?.querySelector(":scope > .folder-nodes-note-title-icon") === null) removeNoteTitleIcon(title);
      }
    }
  }

  private onClick(event: MouseEvent): void {
    const target = asElement(event.target);
    if (target === null) return;
    if (target.closest(".folder-nodes-explorer-root") !== null) {
      this.selectedFolderPath = "";
      this.scheduleDecorate();
      event.preventDefault();
      event.stopPropagation();
      this.runAction(this.service.openFolderNode("", event.ctrlKey || event.metaKey));
      return;
    }
    const title = target.closest<HTMLElement>(".nav-folder-title[data-path]");
    const path = title?.dataset.path;
    if (path !== undefined) {
      this.selectedFolderPath = path;
      this.scheduleDecorate();
    } else {
      const filePath = target.closest<HTMLElement>(".nav-file-title[data-path]")?.dataset.path;
      const file = filePath === undefined ? null : this.app.vault.getAbstractFileByPath(filePath);
      if (file instanceof TFile) {
        this.selectedFolderPath = file.parent?.path ?? "";
        this.scheduleDecorate();
      }
    }
    if (isFolderCollapseControl(target)) return;
    if (path === undefined || this.service.isIgnoredPath(path) || this.service.getCanonicalFile(path) === null) return;
    event.preventDefault();
    event.stopPropagation();
    this.runAction(this.service.openFolderNode(path, event.ctrlKey || event.metaKey));
  }

  private onKeyDown(event: KeyboardEvent): void {
    const target = asElement(event.target);
    if ((event.key !== "Enter" && event.key !== " ") || target?.closest(".folder-nodes-explorer-root") === null) return;
    event.preventDefault();
    event.stopPropagation();
    this.runAction(this.service.openFolderNode(""));
  }

  private onDragStart(event: DragEvent): void {
    const target = asElement(event.target);
    const title = target?.closest<HTMLElement>(".nav-folder-title[data-path]");
    const path = title?.dataset.path;
    if (path === undefined || this.service.isIgnoredPath(path) || this.service.getFolder(path) === null || this.service.getCanonicalFile(path) === null) return;
    this.draggedPath = path;
    event.dataTransfer?.setData("application/x-folder-nodes-path", path);
    if (event.dataTransfer !== null) event.dataTransfer.effectAllowed = "move";
  }

  private onDragOver(event: DragEvent): void {
    if (this.draggedPath === null) return;
    const title = asElement(event.target)?.closest<HTMLElement>(".nav-folder-title[data-path]");
    if (title?.dataset.path === undefined || this.service.isIgnoredPath(title.dataset.path)) return;
    event.preventDefault();
    event.stopPropagation();
    const zone = this.zone(title, event.clientY);
    this.markDrop(title, zone);
    if (event.dataTransfer !== null) event.dataTransfer.dropEffect = "move";
  }

  private onDrop(event: DragEvent): void {
    if (this.draggedPath === null) return;
    const title = asElement(event.target)?.closest<HTMLElement>(".nav-folder-title[data-path]");
    const targetPath = title?.dataset.path;
    const source = this.service.getFolder(this.draggedPath);
    const target = targetPath === undefined ? null : this.service.getFolder(targetPath);
    if (title === null || title === undefined || source === null || target === null || this.service.isIgnoredPath(target.path)) return;
    event.preventDefault();
    event.stopPropagation();
    const zone = this.zone(title, event.clientY);
    void this.service.placeNodeRelative(source, target, zone).then(() => this.notifyChanged()).catch((error) => this.reportError(error));
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

  private runAction(operation: Promise<unknown>): void {
    void operation.catch((error) => this.reportError(error));
  }

  private restoreOrders(): void {
    for (const [container, original] of this.originalOrders) {
      if (!container.isConnected) continue;
      const survivors = original.filter((element) => element.parentElement === container);
      const first = Array.from(container.children).find((element) => survivors.includes(element));
      if (first === undefined) continue;
      const marker = container.ownerDocument.createComment("folder-nodes-restore-order");
      container.insertBefore(marker, first);
      for (const element of survivors) container.insertBefore(element, marker);
      marker.remove();
    }
    this.originalOrders.clear();
  }

  private cleanupSurface(root: HTMLElement): void {
    for (const element of root.querySelectorAll<HTMLElement>(".folder-nodes-canonical-note, .folder-nodes-missing-folder-note, .folder-nodes-node, .folder-nodes-missing-note")) {
      element.removeClass("folder-nodes-canonical-note", "folder-nodes-missing-folder-note", "folder-nodes-node", "folder-nodes-missing-note");
      restoreOwnedDraggable(element);
    }
    for (const element of root.querySelectorAll<HTMLElement>(".folder-nodes-explorer-root, .folder-nodes-create-node, .folder-nodes-explorer-icon, .folder-nodes-explorer-status-icon, .folder-nodes-explorer-problem-badge, .folder-nodes-explorer-repair")) element.remove();
  }

  private cleanupNoteTitleSurface(root: HTMLElement): void {
    for (const title of root.querySelectorAll<HTMLElement>(".folder-nodes-has-title-icon")) removeNoteTitleIcon(title);
    for (const icon of root.querySelectorAll<HTMLElement>(".folder-nodes-note-title-icon")) icon.remove();
    for (const host of root.querySelectorAll<HTMLElement>(".folder-nodes-note-title-host")) host.removeClass("folder-nodes-note-title-host");
  }
}

function ownedSpan(document: Document, className: string): HTMLSpanElement {
  const span = document.createElement("span");
  span.className = className;
  return span;
}

function asElement(target: EventTarget | null): Element | null {
  return target !== null && typeof (target as Element).closest === "function" ? target as Element : null;
}

function setOwnedDraggable(element: HTMLElement): void {
  if (element.dataset.folderNodesOriginalDraggable === undefined) {
    element.dataset.folderNodesOriginalDraggable = element.hasAttribute("draggable") ? `value:${element.getAttribute("draggable") ?? ""}` : "missing";
  }
  element.setAttribute("draggable", "true");
}

function restoreOwnedDraggable(element: HTMLElement): void {
  const original = element.dataset.folderNodesOriginalDraggable;
  if (original === undefined) return;
  if (original === "missing") element.removeAttribute("draggable");
  else element.setAttribute("draggable", original.slice(6));
  delete element.dataset.folderNodesOriginalDraggable;
}
