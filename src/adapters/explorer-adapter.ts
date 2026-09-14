import { App, Component, MarkdownView, setIcon, TAbstractFile, TFile, TFolder } from "obsidian";

import { alignNoteTitleIcon, ensureExplorerIconPosition, ensureExplorerRootRow, ensureNoteTitleIcon, explorerMarkerPlacement, isFolderCollapseControl, removeNoteTitleIcon, syncExplorerNodeOrder } from "./explorer-events";
import type { NodeService } from "./node-service";
import type { VisualService } from "./visual-service";
import type { FolderNodesSettings, NodeVisual } from "../core/types";
import { gapAfter, gapBefore, insertionMarker, type PlacementIntent } from "../core/placement";
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
      createNode: string; incompleteNode: string; incompleteStatus?: string; missingNodeFolder: string; missingNodeNote: string;
      node: string; nodeConflict: string; conflictStatus?: string; root: string; unmanaged: string; unmanagedDetail?: string;
      hiddenNode?: string; hiddenNodeDetail?: string; hiddenByNode?: (path: string) => string;
      hideHiddenNodesThisSession?: string; showHiddenNodesThisSession?: string;
    },
    private readonly createNode: (parentPath: string) => void,
    private readonly completeNode: (entry: TFile | TFolder) => void,
    private readonly notifyChanged: () => void,
    private readonly reportError: (error: unknown) => void,
    private readonly dragEnabled = true,
    private readonly toggleHiddenNodes: () => void = () => undefined,
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
      const canonical = file instanceof TFile && this.service.nodeNoteRole(file) === "unique";
      element.toggleClass("folder-nodes-canonical-note", canonical);
      const counterpartPath = file instanceof TFile && parent !== null ? (parent.path === "" ? file.basename : `${parent.path}/${file.basename}`) : "";
      const identity = file instanceof TFile ? this.service.fileIdentity(file) : "ordinary";
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
      badge.addClass("folder-nodes-status-badge");
      badge.removeClass("is-conflict", "is-hidden", "is-incomplete", "is-unmanaged");
      const labels = this.getRootLabels();
      const label = identity === "conflict" ? labels.conflictStatus ?? "Conflict" : identity === "unmanaged" ? labels.unmanaged : labels.incompleteStatus ?? labels.incompleteNode;
      const detail = identity === "conflict" ? labels.nodeConflict : identity === "unmanaged" ? labels.unmanagedDetail ?? labels.unmanaged : `${labels.incompleteNode}: ${this.service.notePathForFolder(counterpartPath)}`;
      badge.addClass(identity === "conflict" ? "is-conflict" : identity === "unmanaged" ? "is-unmanaged" : "is-incomplete");
      setTextIfChanged(badge, label);
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
      const identity = this.service.folderIdentity(folder.path);
      const row = element.closest<HTMLElement>(".nav-folder") ?? element;
      const hiddenState = this.service.hiddenState(folder.path);
      const hidden = identity === "node" && !this.service.isNodeVisible(folder.path);
      row.toggleClass("folder-nodes-hidden-node", hidden);
      this.syncLeafIndicator(element, folder, identity === "node");
      element.removeClass("folder-nodes-hidden-inherited");
      restoreHiddenTitle(element);

      let hiddenStatus = element.querySelector<HTMLElement>(":scope > .folder-nodes-hidden-status");
      let icon = element.querySelector<HTMLElement>(":scope > .folder-nodes-explorer-icon");
      let problemBadge = element.querySelector<HTMLElement>(":scope > .folder-nodes-explorer-problem-badge:not(.folder-nodes-hidden-status)");
      let repair = element.querySelector<HTMLButtonElement>(":scope > .folder-nodes-explorer-repair");
      const title = element.querySelector<HTMLElement>(":scope > .nav-folder-title-content");

      if (identity === "ordinary") {
        icon?.remove();
        problemBadge?.remove();
        hiddenStatus?.remove();
        repair?.remove();
        element.removeClass("folder-nodes-node", "folder-nodes-missing-note");
        restoreOwnedDraggable(element);
        continue;
      }

      element.toggleClass("folder-nodes-node", identity === "node");
      element.toggleClass("folder-nodes-missing-note", identity === "incomplete");

      if (identity === "unmanaged") {
        row.removeClass("folder-nodes-hidden-node");
        icon?.remove();
        hiddenStatus?.remove();
        repair?.remove();
        restoreOwnedDraggable(element);
        if (problemBadge === null) {
          problemBadge = ownedSpan(element.ownerDocument, "folder-nodes-explorer-problem-badge");
          element.append(problemBadge);
        }
        problemBadge.addClass("folder-nodes-status-badge", "is-unmanaged");
        problemBadge.removeClass("is-conflict", "is-hidden", "is-incomplete");
        setTextIfChanged(problemBadge, this.getRootLabels().unmanaged);
        problemBadge.setAttr("title", this.getRootLabels().unmanagedDetail ?? this.getRootLabels().unmanaged);
        continue;
      }

      if (icon === null) icon = ownedSpan(element.ownerDocument, "folder-nodes-explorer-icon");
      if (identity === "incomplete") {
        hiddenStatus?.remove();
        restoreOwnedDraggable(element);
        icon.addClass("is-default-node");
        icon.removeClass("is-warning");
        ensureExplorerIconPosition(element, icon, title, "before");
        this.renderExplorerMarker(icon, { kind: "lucide", value: "folder-tree", accent: null, inheritedFrom: null }, this.getRootLabels().missingNodeNote);
        if (problemBadge === null) {
          problemBadge = ownedSpan(element.ownerDocument, "folder-nodes-explorer-problem-badge");
          element.append(problemBadge);
        }
        problemBadge.addClass("folder-nodes-status-badge", "is-incomplete");
        problemBadge.removeClass("is-conflict", "is-hidden", "is-unmanaged");
        setTextIfChanged(problemBadge, this.getRootLabels().incompleteStatus ?? this.getRootLabels().incompleteNode);
        problemBadge.setAttr("title", this.getRootLabels().missingNodeNote);
        if (repair === null) repair = this.createRepairButton(element, folder.path, "file-plus", this.getRootLabels().missingNodeNote);
        repair.dataset.path = folder.path;
        continue;
      }

      if (identity === "conflict") {
        hiddenStatus?.remove();
        repair?.remove();
        restoreOwnedDraggable(element);
        icon.removeClass("is-default-node");
        icon.addClass("is-warning");
        ensureExplorerIconPosition(element, icon, title, "before");
        this.renderExplorerMarker(icon, { kind: "lucide", value: "file-warning", accent: null, inheritedFrom: null }, this.getRootLabels().nodeConflict);
        if (problemBadge === null) {
          problemBadge = ownedSpan(element.ownerDocument, "folder-nodes-explorer-problem-badge");
          element.append(problemBadge);
        }
        problemBadge.addClass("folder-nodes-status-badge", "is-conflict");
        problemBadge.removeClass("is-hidden", "is-incomplete", "is-unmanaged");
        setTextIfChanged(problemBadge, this.getRootLabels().conflictStatus ?? "Conflict");
        problemBadge.setAttr("title", this.getRootLabels().nodeConflict);
        continue;
      }

      problemBadge?.remove();
      repair?.remove();
      if (this.service.revealingHiddenNodes() && hiddenState.sourcePath !== null && hiddenState.explicit) {
        if (hiddenStatus === null) {
          hiddenStatus = ownedSpan(element.ownerDocument, "folder-nodes-hidden-status folder-nodes-status-badge is-hidden");
          element.append(hiddenStatus);
        }
        const label = this.getRootLabels().hiddenNode ?? "Hidden node";
        const detail = this.getRootLabels().hiddenNodeDetail ?? label;
        setTextIfChanged(hiddenStatus, label);
        hiddenStatus.setAttr("title", detail);
        hiddenStatus.setAttr("aria-label", detail);
      } else {
        hiddenStatus?.remove();
        if (this.service.revealingHiddenNodes() && hiddenState.sourcePath !== null) {
          const label = this.getRootLabels().hiddenByNode?.(hiddenState.sourcePath) ?? `Hidden by ${hiddenState.sourcePath}`;
          element.addClass("folder-nodes-hidden-inherited");
          ownHiddenTitle(element, label);
        }
      }
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
    const statusBadge = container.querySelector<HTMLElement>(":scope > .folder-nodes-explorer-problem-badge");
    if (statusBadge === null) container.append(button);
    else container.insertBefore(button, statusBadge);
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
    const rootCandidates = this.service.nodeNoteCandidates("");
    const rootNote = rootCandidates.length === 1 ? rootCandidates[0] ?? null : null;
    const conflict = rootCandidates.length > 1;
    const missing = rootCandidates.length === 0;
    const active = rootNote !== null && this.app.workspace.getActiveFile() === rootNote;
    const labels = this.getRootLabels();
    for (const container of root.querySelectorAll<HTMLElement>(".nav-files-container")) {
      const { row, icon, title, badge, visibility } = ensureExplorerRootRow(container);
      const titleLabel = this.app.vault.getName();
      const accessibleLabel = titleLabel + " · " + labels.root;
      if (icon.childElementCount === 0) setIcon(icon, "home");
      if (title.textContent !== titleLabel) title.setText(titleLabel);
      const badgeLabel = conflict ? labels.conflictStatus ?? "Conflict" : labels.root;
      setTextIfChanged(badge, badgeLabel);
      badge.toggleClass("is-conflict", conflict);
      row.toggleClass("is-active", active);
      row.toggleClass("is-missing", missing);
      row.toggleClass("is-conflict", conflict);
      const statusLabel = conflict ? labels.nodeConflict : missing ? labels.missingNodeNote : labels.root;
      row.setAttr("aria-label", statusLabel === labels.root ? accessibleLabel : `${accessibleLabel}: ${statusLabel}`);
      row.setAttr("title", statusLabel);
      const reveal = this.service.revealingHiddenNodes?.() ?? false;
      const visibilityLabel = reveal
        ? labels.hideHiddenNodesThisSession ?? "Hide hidden nodes again"
        : labels.showHiddenNodesThisSession ?? "Temporarily show hidden nodes";
      visibility.hidden = !this.getSettings().hiddenNodesEnabled;
      row.toggleClass("has-hidden-visibility", this.getSettings().hiddenNodesEnabled);
      visibility.setAttr("aria-label", visibilityLabel);
      visibility.setAttr("title", visibilityLabel);
      visibility.setAttr("aria-pressed", String(reveal));
      visibility.toggleClass("is-active", reveal);
      const iconKey = reveal ? "eye" : "eye-off";
      if (visibility.dataset.icon !== iconKey) {
        visibility.empty();
        setIcon(visibility, iconKey);
        visibility.dataset.icon = iconKey;
      }
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
    if (target.closest(".folder-nodes-explorer-root-visibility") !== null) {
      event.preventDefault();
      event.stopPropagation();
      this.toggleHiddenNodes();
      return;
    }
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
    if (target?.closest(".folder-nodes-explorer-root-visibility") !== null) return;
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
    if (title?.dataset.path === undefined) return;
    event.preventDefault();
    event.stopPropagation();
    const intent = this.dropIntent(title, this.zone(title, event.clientY));
    const preview = intent === null ? { kind: "blocked" as const, reason: "No valid drop target" } : this.service.previewPlacement(this.draggedPath, intent);
    if (preview.kind === "ready" && this.markPlacement(title, preview.intent)) {
      if (event.dataTransfer !== null) event.dataTransfer.dropEffect = "move";
      return;
    }
    this.clearDrop(false);
    if (event.dataTransfer !== null) event.dataTransfer.dropEffect = "none";
  }

  private onDrop(event: DragEvent): void {
    if (this.draggedPath === null) return;
    const title = asElement(event.target)?.closest<HTMLElement>(".nav-folder-title[data-path]");
    if (title?.dataset.path === undefined) return;
    event.preventDefault();
    event.stopPropagation();
    const source = this.service.getFolder(this.draggedPath);
    const intent = this.dropIntent(title, this.zone(title, event.clientY));
    const preview = source === null || intent === null ? { kind: "blocked" as const, reason: "No valid drop target" } : this.service.previewPlacement(this.draggedPath, intent);
    if (source !== null && preview.kind === "ready" && this.markPlacement(title, preview.intent)) {
      void this.service.placeNode(source, preview.intent).then(() => this.notifyChanged()).catch((error: unknown) => this.reportError(error));
    } else if (preview.kind === "blocked") {
      this.reportError(new Error(preview.reason));
    }
    this.clearDrop();
  }

  private zone(element: HTMLElement, clientY: number): "before" | "into" | "after" {
    const rect = element.getBoundingClientRect();
    const ratio = rect.height <= 0 ? 0.5 : (clientY - rect.top) / rect.height;
    return ratio < 0.25 ? "before" : ratio > 0.75 ? "after" : "into";
  }

  private dropIntent(element: HTMLElement, zone: "before" | "into" | "after"): PlacementIntent | null {
    const targetPath = element.dataset.path;
    if (targetPath === undefined || this.draggedPath === null || this.service.isIgnoredPath(targetPath)) return null;
    if (zone === "into") return { kind: "move-into", parentPath: targetPath };
    const target = this.service.getFolder(targetPath);
    if (target === null) return null;
    const parentPath = target.parent?.path ?? "";
    const siblings = this.service.children(parentPath).filter(({ childPath }) => childPath !== this.draggedPath);
    const paths = siblings.map(({ childPath }) => childPath);
    if (!paths.includes(targetPath)) return null;
    return { kind: "insert", gap: zone === "before" ? gapBefore(paths, targetPath, parentPath) : gapAfter(paths, targetPath, parentPath) };
  }

  private markPlacement(hit: HTMLElement, intent: PlacementIntent): boolean {
    if (intent.kind === "move-into") {
      this.markDrop(hit, "into");
      return true;
    }
    const { previousSiblingPath, nextSiblingPath } = intent.gap;
    if (previousSiblingPath !== null && !this.service.isNodeVisible(previousSiblingPath)) return false;
    if (nextSiblingPath !== null && !this.service.isNodeVisible(nextSiblingPath)) return false;
    const container = hit.closest<HTMLElement>(".nav-files-container");
    const marker = insertionMarker(intent.gap);
    if (container === null || marker === null) return false;
    const target = findFolderTitle(container, marker.path);
    if (target === null) return false;
    this.markDrop(target, marker.edge);
    return true;
  }

  private markDrop(element: HTMLElement, zone: "before" | "into" | "after"): void {
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

  private syncLeafIndicator(title: HTMLElement, folder: TFolder, managedNode: boolean): void {
    const visualLeaf = managedNode && !folder.children.some((entry) => {
      if (entry instanceof TFile) return !this.service.isCanonicalFile(entry);
      if (!(entry instanceof TFolder)) return false;
      if (this.service.isIgnoredPath(entry.path)) return true;
      if (this.service.getCanonicalFile(entry.path) === null) return true;
      return this.service.isNodeVisible(entry.path);
    });
    for (const indicator of title.querySelectorAll<HTMLElement>(
      ".nav-folder-collapse-indicator, .tree-item-icon.collapse-icon",
    )) {
      indicator.toggleClass("folder-nodes-leaf-indicator", visualLeaf);
      if (visualLeaf) ownAriaHidden(indicator);
      else restoreAriaHidden(indicator);
    }
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
    for (const element of root.querySelectorAll<HTMLElement>(".folder-nodes-canonical-note, .folder-nodes-missing-folder-note, .folder-nodes-node, .folder-nodes-missing-note, .folder-nodes-hidden-node, .folder-nodes-hidden-inherited")) {
      element.removeClass("folder-nodes-canonical-note", "folder-nodes-missing-folder-note", "folder-nodes-node", "folder-nodes-missing-note", "folder-nodes-hidden-node", "folder-nodes-hidden-inherited");
      restoreHiddenTitle(element);
      restoreOwnedDraggable(element);
    }
    for (const indicator of root.querySelectorAll<HTMLElement>(".folder-nodes-leaf-indicator")) {
      indicator.removeClass("folder-nodes-leaf-indicator");
      restoreAriaHidden(indicator);
    }
    for (const element of root.querySelectorAll<HTMLElement>(".folder-nodes-explorer-root, .folder-nodes-create-node, .folder-nodes-explorer-icon, .folder-nodes-explorer-status-icon, .folder-nodes-explorer-problem-badge, .folder-nodes-explorer-repair")) element.remove();
  }

  private cleanupNoteTitleSurface(root: HTMLElement): void {
    for (const title of root.querySelectorAll<HTMLElement>(".folder-nodes-has-title-icon")) removeNoteTitleIcon(title);
    for (const icon of root.querySelectorAll<HTMLElement>(".folder-nodes-note-title-icon")) icon.remove();
    for (const host of root.querySelectorAll<HTMLElement>(".folder-nodes-note-title-host")) host.removeClass("folder-nodes-note-title-host");
  }
}

function ownAriaHidden(element: HTMLElement): void {
  if (element.dataset.folderNodesOriginalAriaHidden === undefined) {
    element.dataset.folderNodesOriginalAriaHidden = element.hasAttribute("aria-hidden")
      ? `value:${element.getAttribute("aria-hidden") ?? ""}`
      : "missing";
  }
  element.setAttr("aria-hidden", "true");
}

function restoreAriaHidden(element: HTMLElement): void {
  const original = element.dataset.folderNodesOriginalAriaHidden;
  if (original === undefined) return;
  delete element.dataset.folderNodesOriginalAriaHidden;
  if (original === "missing") element.removeAttribute("aria-hidden");
  else element.setAttr("aria-hidden", original.slice("value:".length));
}

function ownHiddenTitle(element: HTMLElement, title: string): void {
  if (element.dataset.folderNodesHiddenTitle === undefined) {
    element.dataset.folderNodesHiddenTitle = element.hasAttribute("title") ? `value:${element.getAttribute("title") ?? ""}` : "missing";
  }
  element.setAttr("title", title);
}

function restoreHiddenTitle(element: HTMLElement): void {
  const original = element.dataset.folderNodesHiddenTitle;
  if (original === undefined) return;
  if (original === "missing") element.removeAttribute("title");
  else element.setAttr("title", original.slice(6));
  delete element.dataset.folderNodesHiddenTitle;
}

function setTextIfChanged(element: HTMLElement, value: string): void {
  if (element.textContent !== value) element.setText(value);
}

function ownedSpan(document: Document, className: string): HTMLSpanElement {
  const span = document.createElement("span");
  span.className = className;
  return span;
}

function findFolderTitle(container: HTMLElement, path: string): HTMLElement | null {
  for (const title of container.querySelectorAll<HTMLElement>(".nav-folder-title[data-path]")) {
    if (title.dataset.path === path) return title;
  }
  return null;
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
