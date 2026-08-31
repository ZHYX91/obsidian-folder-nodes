import {
  ItemView,
  Menu,
  SearchComponent,
  setIcon,
  setTooltip,
  WorkspaceLeaf,
  type ViewStateResult,
} from "obsidian";

import type { NodeGraphIndexSnapshot } from "../core/node-graph-index-snapshot";

import {
  nodeGraphSiblingCardWidths,
  NODE_GRAPH_CARD_WIDTH_REGULAR,
} from "../core/node-graph-card-width";
import {
  defaultNodeGraphCamera,
  fitNodeGraphCamera,
  layoutNodeGraph3D,
  panNodeGraphCamera,
  projectNodeGraph3D,
  rotateNodeGraphCamera,
  zoomNodeGraphCamera,
  type NodeGraphCamera,
  type NodeGraphPoint3D,
  type NodeGraphProjectedPoint,
} from "../core/node-graph-3d";
import { shouldUseNodeGraphCanvas } from "../core/node-graph-canvas";
import {
  nodeGraphBoxFromCenter,
  nodeGraphBoxFromTopLeft,
  nodeGraphCubicPath,
  nodeGraphLinkGeometry,
  nodeGraphQuadraticPath,
  nodeGraphStructureGeometry,
} from "../core/node-graph-geometry";
import { fitNodeGraphViewport, layoutNodeGraphForest, type NodeGraphLayout, type NodeGraphTree } from "../core/node-graph-layout";
import { buildNodeGraphModelFromNodes, edgesForShowLinks, type NodeGraphModel, type NodeGraphModelEdge } from "../core/node-graph-model";
import {
  GLOBAL_NODE_GRAPH_SCOPE,
  isWithin,
  normalizeNodeGraphScope,
  type NodeGraphScope,
} from "../core/node-graph-scope";
import { normalizeVaultPath } from "../core/paths";
import { summarizeNodeGraphSearch, type NodeGraphSearchSummary } from "../core/node-graph-search";
import {
  captureNodeGraphSearchSnapshot,
  createNodeGraphExpansionSession,
  expandNodeGraphAncestors,
  nodeGraphExpansionForScope,
  nodeGraphScopeKey,
  nodeGraphStructuralScopeIds,
  nodeGraphShowLinksFromPersistedState,
  restoreNodeGraphSearchSnapshot,
  setNodeGraphRangeDepth,
  toggleNodeGraphBranch,
  toggleNodeGraphNode,
  withNodeGraphExpansion,
  type NodeGraphExpansionSession,
  type NodeGraphExpansionState,
  type NodeGraphRangeDepth,
  type NodeGraphSearchSnapshot,
} from "../core/node-graph-state";
import { createNodeGraphTopology, type NodeGraphTopology } from "../core/node-graph-topology";
import { buildNodeGraphVisibleScene, estimateNodeGraphRangeNodeCount } from "../core/node-graph-visible";
import type { NodeGraphDimension, NodeGraphSettings } from "../core/types";
import { renderVisual } from "../presentation/render-visual";
import { DEFAULT_NODE_GRAPH_SETTINGS } from "../shared/settings";
import { t } from "./i18n";
import {
  NodeGraphCanvasRenderer,
  type NodeGraphCanvasRecord,
  type NodeGraphCanvasViewportState,
} from "./node-graph-canvas-renderer";

interface NodeGraphService {
  openFolderNode(path: string, newLeaf?: boolean): Promise<void>;
}

interface GraphRecord extends NodeGraphCanvasRecord {
  readonly boundary: boolean;
  readonly notePath: string | null;
  readonly parentPath: string | null;
}

interface GraphData {
  readonly layout: NodeGraphLayout;
  readonly records: ReadonlyMap<string, GraphRecord>;
  readonly model: NodeGraphModel;
  readonly points3D: readonly NodeGraphPoint3D[];
}

interface NodeGraphDom2DViewportState {
  readonly canvasLeft: string;
  readonly canvasTop: string;
  readonly canvasTransform: string;
  readonly scrollLeft: number;
  readonly scrollTop: number;
  readonly stageHeight: string;
  readonly stageWidth: string;
}

interface NodeGraphViewportState {
  readonly canvas: NodeGraphCanvasViewportState | null;
  readonly dimension: NodeGraphDimension;
  readonly dom2D: NodeGraphDom2DViewportState | null;
  readonly view3D: NodeGraphCamera;
}

export interface NodeGraphViewOptions {
  readonly getIndexSnapshot: () => NodeGraphIndexSnapshot;
  readonly getSettings?: () => NodeGraphSettings;
  readonly onNodeMenu?: (event: MouseEvent, path: string) => void;
}

type GraphDrag = {
  readonly pointerId: number;
  readonly pan: boolean;
  x: number;
  y: number;
};

type GraphPointer = {
  readonly pan: boolean;
  readonly pointerType: string;
  x: number;
  y: number;
};

export const NODE_GRAPH_VIEW_TYPE = "folder-nodes-node-graph";
const NODE_GRAPH_DOM_MIN_SCALE = 0.65;
const NODE_GRAPH_DOM_MIN_2D_SCALE = 0.65;
const NODE_GRAPH_DENSE_3D_THRESHOLD = 24;
const NODE_GRAPH_DENSE_3D_FIT_SCALE = 0.16;

export class FolderNodeGraphView extends ItemView {
  private focusPath: string | null = null;
  private showLinks = false;
  private dimension: NodeGraphDimension;
  private graphScope: NodeGraphScope = GLOBAL_NODE_GRAPH_SCOPE;
  private camera: NodeGraphCamera = defaultNodeGraphCamera();
  private drag: GraphDrag | null = null;
  private readonly pointers = new Map<number, GraphPointer>();
  private readonly nodeElements = new Map<string, HTMLElement>();
  private projected3D = new Map<string, NodeGraphProjectedPoint>();
  private threeDPoints: readonly NodeGraphPoint3D[] = [];
  private threeDCanvas: HTMLElement | null = null;
  private threeDSurface: HTMLElement | null = null;
  private threeDSvg: SVGSVGElement | null = null;
  private threeDViewport: { width: number; height: number } | null = null;
  private canvasRenderer: NodeGraphCanvasRenderer | null = null;
  private displayGraphData: GraphData | null = null;
  private indexSnapshot: NodeGraphIndexSnapshot | null = null;
  private topology: NodeGraphTopology | null = null;
  private topologyRevision: number | null = null;
  private structuralScopeIds: ReadonlySet<string> = new Set();
  private structuralScopeIdentity = "";
  private expansionSession: NodeGraphExpansionSession = createNodeGraphExpansionSession();
  private currentExpansion: NodeGraphExpansionState = { expandedIds: new Set() };
  private searchSnapshot: NodeGraphSearchSnapshot<NodeGraphViewportState> | null = null;
  private denseThreeD = false;
  private graphDataGeneration = 0;
  private refreshGeneration = 0;
  private refreshTimer: number | null = null;
  private searchQuery = "";
  private searchPreviewPath: string | null = null;
  private pendingPersistedFocusReveal = false;
  private searchResultsCache: {
    readonly generation: number;
    readonly query: string;
    readonly summary: NodeGraphSearchSummary;
  } | null = null;

  public constructor(
    leaf: WorkspaceLeaf,
    private readonly service: NodeGraphService,
    private readonly options: NodeGraphViewOptions,
  ) {
    super(leaf);
    const settings = this.settings();
    this.dimension = settings.defaultDimension;
  }

  public override getViewType(): string { return NODE_GRAPH_VIEW_TYPE; }
  public override getDisplayText(): string { return label("nodeGraph"); }
  public override getIcon(): string { return "git-fork"; }
  public override async onOpen(): Promise<void> { this.render(); }
  public override getState(): Record<string, unknown> {
    return { dimension: this.dimension, focus: this.focusPath, scope: this.graphScope, showLinks: this.showLinks };
  }
  public override async setState(state: unknown, _result: ViewStateResult): Promise<void> {
    if (typeof state === "object" && state !== null) {
      const input = state as {
        readonly dimension?: unknown;
        readonly focus?: unknown;
        readonly relationMode?: unknown;
        readonly scope?: unknown;
        readonly showLinks?: unknown;
      };
      if (input.dimension === "2d" || input.dimension === "3d") this.dimension = input.dimension;
      this.showLinks = nodeGraphShowLinksFromPersistedState(input);
      this.graphScope = normalizeNodeGraphScope(input.scope);
      this.focusPath = typeof input.focus === "string"
        ? normalizeVaultPath(input.focus)
        : this.graphScope.mode === "global" ? null : this.graphScope.rootPath;
      this.pendingPersistedFocusReveal = this.focusPath !== null;
    }
    if (this.contentEl.isConnected) this.render();
  }
  public override onResize(): void {
    this.canvasRenderer?.resize();
    this.resize3DViewport();
  }
  public override async onClose(): Promise<void> {
    this.refreshGeneration += 1;
    if (this.refreshTimer !== null) {
      (this.contentEl.ownerDocument.defaultView ?? window).clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
    this.canvasRenderer?.destroy();
    this.canvasRenderer = null;
    this.displayGraphData = null;
    this.indexSnapshot = null;
    this.topology = null;
    this.topologyRevision = null;
    this.structuralScopeIds = new Set();
    this.structuralScopeIdentity = "";
    this.nodeElements.clear();
    this.projected3D.clear();
    this.threeDPoints = [];
    this.threeDCanvas = null;
    this.threeDSurface = null;
    this.threeDSvg = null;
    this.threeDViewport = null;
    this.drag = null;
    this.pointers.clear();
    this.expansionSession = createNodeGraphExpansionSession();
    this.currentExpansion = { expandedIds: new Set() };
    this.searchSnapshot = null;
    this.searchResultsCache = null;
    this.searchQuery = "";
    this.searchPreviewPath = null;
    this.pendingPersistedFocusReveal = false;
    this.contentEl.empty();
  }

  public setFocus(path: string | null): void {
    const nextFocus = path === null ? null : normalizeVaultPath(path);
    const focusChanged = nextFocus !== this.focusPath;
    this.focusPath = nextFocus;
    if (focusChanged) this.markWorkspaceStateDirty();
    if (this.focusPath !== null && this.topology?.nodes.has(this.focusPath) === true
      && this.displayGraphData?.records.has(this.focusPath) === false) {
      const expansion = expandNodeGraphAncestors(this.topology, this.graphScope, this.currentExpansion, [this.focusPath]);
      this.currentExpansion = expansion;
      this.expansionSession = withNodeGraphExpansion(this.expansionSession, this.graphScope, expansion);
      this.render();
      if (this.canvasRenderer !== null) this.canvasRenderer.setFocus(this.focusPath, true);
      else if (this.dimension === "3d") this.center3DOnFocus();
      else this.applyFocus(true);
      return;
    }
    if (this.canvasRenderer !== null) this.canvasRenderer.setFocus(this.focusPath, true);
    else if (this.dimension === "3d" && this.focusPath !== null) this.center3DOnFocus();
    else this.applyFocus(true);
    this.applyNeighborhood();
    this.updateScopeControls();
  }

  public setGraphScope(scope: NodeGraphScope): void {
    const normalized = normalizeNodeGraphScope(scope);
    if (JSON.stringify(normalized) === JSON.stringify(this.graphScope)) return;
    const restoredSearch = this.searchSnapshot === null
      ? null
      : restoreNodeGraphSearchSnapshot(this.searchSnapshot, this.graphScope);
    if (restoredSearch !== null) {
      this.currentExpansion = restoredSearch.expansion;
      this.expansionSession = withNodeGraphExpansion(
        this.expansionSession,
        this.graphScope,
        restoredSearch.expansion,
      );
      this.focusPath = restoredSearch.focusId;
      this.camera = { ...restoredSearch.camera.view3D };
    }
    this.graphScope = normalized;
    this.searchQuery = "";
    this.searchSnapshot = null;
    this.searchPreviewPath = null;
    this.displayGraphData = null;
    if (normalized.mode !== "global") this.focusPath = normalized.rootPath;
    this.markWorkspaceStateDirty();
    this.render();
  }

  public remapPathState(oldPath: string, newPath: string): void {
    const previous = normalizeVaultPath(oldPath);
    const next = normalizeVaultPath(newPath);
    if (previous === next) return;
    const serializedBefore = JSON.stringify(this.getState());
    const remap = (path: string): string => remapNodeGraphPath(path, previous, next);
    if (this.focusPath !== null) this.focusPath = remap(this.focusPath);
    if (this.searchPreviewPath !== null) this.searchPreviewPath = remap(this.searchPreviewPath);
    if (this.graphScope.mode !== "global") {
      this.graphScope = { ...this.graphScope, rootPath: remap(this.graphScope.rootPath) };
    }
    this.currentExpansion = remapNodeGraphExpansion(this.currentExpansion, remap);
    this.expansionSession = remapNodeGraphExpansionSession(this.expansionSession, remap);
    if (this.searchSnapshot !== null) {
      this.searchSnapshot = {
        ...this.searchSnapshot,
        expansion: remapNodeGraphExpansion(this.searchSnapshot.expansion, remap),
        focusId: this.searchSnapshot.focusId === null ? null : remap(this.searchSnapshot.focusId),
        scopeKey: remapNodeGraphScopeKey(this.searchSnapshot.scopeKey, remap),
      };
    }
    if (JSON.stringify(this.getState()) !== serializedBefore) this.markWorkspaceStateDirty();
  }

  public removePathState(path: string): void {
    const serializedBefore = JSON.stringify(this.getState());
    const removed = normalizeVaultPath(path);
    const retained = (candidate: string): boolean => !isWithin(candidate, removed);
    if (this.focusPath !== null && !retained(this.focusPath)) this.focusPath = null;
    if (this.searchPreviewPath !== null && !retained(this.searchPreviewPath)) this.searchPreviewPath = null;
    const scopeRemoved = this.graphScope.mode !== "global" && !retained(this.graphScope.rootPath);
    if (scopeRemoved) this.graphScope = GLOBAL_NODE_GRAPH_SCOPE;
    this.currentExpansion = filterNodeGraphExpansion(this.currentExpansion, retained);
    this.expansionSession = filterNodeGraphExpansionSession(this.expansionSession, retained);
    if (this.searchSnapshot !== null) {
      const snapshotRoot = nodeGraphScopeKeyRoot(this.searchSnapshot.scopeKey);
      const snapshotScopeRemoved = snapshotRoot !== null && !retained(snapshotRoot);
      if (scopeRemoved || snapshotScopeRemoved) {
        this.searchQuery = "";
        this.searchSnapshot = null;
        this.searchPreviewPath = null;
      } else {
        this.searchSnapshot = {
          ...this.searchSnapshot,
          expansion: filterNodeGraphExpansion(this.searchSnapshot.expansion, retained),
          focusId: this.searchSnapshot.focusId === null || retained(this.searchSnapshot.focusId)
            ? this.searchSnapshot.focusId
            : null,
        };
      }
    }
    if (JSON.stringify(this.getState()) !== serializedBefore) this.markWorkspaceStateDirty();
  }

  public refresh(): void {
    const generation = ++this.refreshGeneration;
    const ownerWindow = this.contentEl.ownerDocument.defaultView ?? window;
    if (this.refreshTimer !== null) ownerWindow.clearTimeout(this.refreshTimer);
    this.refreshTimer = ownerWindow.setTimeout(() => {
      this.refreshTimer = null;
      if (generation !== this.refreshGeneration) return;
      this.indexSnapshot = null;
      this.displayGraphData = null;
      this.render();
    }, 50);
  }

  private render(): void {
    this.canvasRenderer?.destroy();
    this.canvasRenderer = null;
    this.displayGraphData = null;
    this.denseThreeD = false;
    this.nodeElements.clear();
    this.projected3D.clear();
    this.threeDPoints = [];
    this.threeDCanvas = null;
    this.threeDSurface = null;
    this.threeDSvg = null;
    this.threeDViewport = null;
    this.drag = null;
    this.pointers.clear();
    this.contentEl.empty();
    this.contentEl.addClass("folder-nodes-node-graph-view");
    this.contentEl.removeClass("is-canvas-graph");
    this.contentEl.toggleClass("is-3d", this.dimension === "3d");
    this.contentEl.toggleClass("is-top-to-bottom", this.settings().layoutDirection === "top-to-bottom");

    if (!this.settings().enabled) {
      this.contentEl.createDiv({ cls: "folder-nodes-node-graph-disabled", text: label("disabledGraph"), attr: { role: "status" } });
      return;
    }

    const sourceData = this.buildGraphData();
    const data = sourceData;
    this.displayGraphData = data;
    this.denseThreeD = this.dimension === "3d" && data.model.nodes.length > NODE_GRAPH_DENSE_3D_THRESHOLD;
    this.contentEl.toggleClass("is-dense-3d", this.denseThreeD);
    const toolbar = this.renderToolbar();
    const fit = toolbar.querySelector<HTMLButtonElement>("[data-node-graph-action='fit']");
    const surface = this.contentEl.createDiv({ cls: "folder-nodes-node-graph-scroll" });
    const visibleEdgeCount = edgesForShowLinks(data.model, this.showLinks).length;
    if (shouldUseNodeGraphCanvas(data.model.nodes.length, visibleEdgeCount, this.settings().largeGraphThreshold)) {
      this.renderCanvas(surface, data, fit);
    }
    else if (this.dimension === "2d") this.render2D(surface, data, fit);
    else this.render3D(surface, data, fit);
    if (this.canvasRenderer === null) this.applyFocus(this.dimension === "2d");
    this.highlightSearch(this.searchQuery);
    this.applyNeighborhood();
    if (this.searchQuery.trim() !== "") this.centerSearchPreview();
  }

  private graphSearchRecords(): readonly { readonly label: string; readonly path: string }[] {
    const snapshot = this.indexSnapshot ?? this.graphIndexSnapshot();
    const allowed = new Set(this.structuralScopeIds);
    if (this.graphScope.mode === "local") {
      const parentId = this.topology?.nodes.get(this.graphScope.rootPath)?.parentId;
      if (parentId !== null && parentId !== undefined) allowed.add(parentId);
    }
    for (const record of this.displayGraphData?.records.values() ?? []) allowed.add(record.path);
    return [...snapshot.records.values()]
      .filter(({ path }) => allowed.has(path))
      .map(({ label: recordLabel, path }) => ({ label: recordLabel, path }));
  }

  private renderToolbar(): HTMLElement {
    const toolbar = this.contentEl.createDiv({ cls: "folder-nodes-node-graph-toolbar" });
    const primary = toolbar.createDiv({ cls: "folder-nodes-node-graph-toolbar-primary" });
    const secondary = toolbar.createDiv({ cls: "folder-nodes-node-graph-toolbar-secondary" });
    primary.createDiv({ cls: "folder-nodes-node-graph-title", text: label("nodeGraph") });
    const searchHost = primary.createDiv({ cls: "folder-nodes-node-graph-search" });
    const search = new SearchComponent(searchHost)
      .setPlaceholder(label("findNode"))
      .setValue(this.searchQuery)
      .onChange((value) => this.setSearchQuery(value));
    search.inputEl.setAttribute("aria-label", label("findNode"));
    search.inputEl.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        search.setValue("");
        this.setSearchQuery("");
        return;
      }
      if (event.key !== "Enter") return;
      const match = this.firstSearchMatch(this.searchQuery);
      if (match === null) return;
      event.preventDefault();
      this.setFocus(match);
    });
    setTooltip(search.inputEl, label("findNode"));
    search.clearButtonEl.setAttribute("aria-label", label("clearSearch"));
    setTooltip(search.clearButtonEl, label("clearSearch"));

    const linksToggle = primary.createEl("button", {
      cls: `folder-nodes-node-graph-links-toggle${this.showLinks ? " is-active" : ""}`,
      attr: {
        "aria-checked": String(this.showLinks),
        "aria-label": label("showLinksTooltip"),
        role: "switch",
        type: "button",
      },
    });
    linksToggle.createSpan({ text: label("showLinks") });
    linksToggle.createSpan({ cls: "folder-nodes-node-graph-toggle-track", attr: { "aria-hidden": "true" } });
    setTooltip(linksToggle, label("showLinksTooltip"));
    linksToggle.addEventListener("click", () => {
      this.showLinks = !this.showLinks;
      this.markWorkspaceStateDirty();
      this.render();
    });
    if (this.showLinks) {
      const visibleLinks = this.displayGraphData?.model.edges.filter((edge) => edge.link).length ?? 0;
      const summary = primary.createSpan({
        cls: `folder-nodes-node-graph-link-summary${visibleLinks === 0 ? " is-empty" : ""}`,
        attr: { role: "status" },
      });
      summary.createSpan({ cls: "folder-nodes-node-graph-link-swatch", attr: { "aria-hidden": "true" } });
      summary.createSpan({ text: visibleLinks === 0 ? label("noLinks") : linkCountLabel(visibleLinks) });
    }

    const scope = toolbar.createDiv({
      cls: "folder-nodes-node-graph-scope",
      attr: { "aria-label": label("scope"), "data-node-graph-scope": this.graphScope.mode },
    });
    secondary.append(scope);
    scope.createSpan({ cls: "folder-nodes-node-graph-scope-path", text: this.scopeLabel() });
    this.scopeButton(scope, label("globalScope"), label("globalScopeTooltip"), this.graphScope.mode === "global", () => this.setGraphScope(GLOBAL_NODE_GRAPH_SCOPE));
    this.scopeButton(scope, label("subtreeScope"), label("subtreeScopeTooltip"), this.graphScope.mode === "subtree", () => {
      if (this.focusPath !== null) this.setGraphScope({ mode: "subtree", rootPath: this.focusPath });
    }, this.focusPath === null, "subtree");
    this.scopeButton(scope, label("localScope"), label("localScopeTooltip"), this.graphScope.mode === "local", () => {
      if (this.focusPath !== null) this.setGraphScope({ mode: "local", rootPath: this.focusPath });
    }, this.focusPath === null, "local");
    const range = secondary.createEl("button", {
      cls: "folder-nodes-node-graph-range-button",
      attr: { "aria-haspopup": "menu", "aria-label": label("expandRangeTooltip"), type: "button" },
    });
    range.createSpan({ text: label("expandRange") });
    setIcon(range.createSpan({ cls: "folder-nodes-node-graph-range-chevron" }), "chevron-down");
    setTooltip(range, label("expandRangeTooltip"));
    range.addEventListener("click", () => this.openExpansionMenu(range));

    const dimension = primary.createDiv({
      cls: "folder-nodes-node-graph-switch",
      attr: { "aria-label": label("dimension"), "data-node-graph-switch": "dimension" },
    });
    for (const mode of ["2d", "3d"] as const) {
      this.switchButton(dimension, mode.toUpperCase(), this.dimension === mode, () => {
        if (this.dimension === mode) return;
        this.dimension = mode;
        if (mode === "3d") this.camera = defaultNodeGraphCamera();
        this.markWorkspaceStateDirty();
        this.render();
      });
    }
    const fit = primary.createEl("button", {
      cls: "clickable-icon",
      attr: { "aria-label": label("fitGraph"), "data-node-graph-action": "fit" },
    });
    setIcon(fit, "maximize-2");
    setTooltip(fit, label("fitGraph"));
    return toolbar;
  }

  private switchButton(container: HTMLElement, text: string, active: boolean, onClick: () => void): void {
    const button = container.createEl("button", {
      cls: `folder-nodes-node-graph-switch-button${active ? " is-active" : ""}`,
      text,
      attr: { "aria-pressed": String(active) },
    });
    setTooltip(button, `${text} ${label("dimension")}`);
    button.addEventListener("click", onClick);
  }

  private scopeButton(
    container: HTMLElement,
    text: string,
    tooltip: string,
    active: boolean,
    onClick: () => void,
    disabled = false,
    action: "local" | "subtree" | null = null,
  ): void {
    const button = container.createEl("button", {
      cls: `folder-nodes-node-graph-scope-button${active ? " is-active" : ""}`,
      text,
      attr: { "aria-pressed": String(active), type: "button", ...(action === null ? {} : { "data-node-graph-scope-action": action }) },
    });
    button.disabled = disabled;
    const description = disabled ? label("selectNodeFirst") : tooltip;
    button.setAttribute("aria-label", description);
    button.title = description;
    setTooltip(button, description);
    button.addEventListener("click", onClick);
  }

  private updateScopeControls(): void {
    for (const button of this.contentEl.querySelectorAll<HTMLButtonElement>("[data-node-graph-scope-action]")) {
      button.disabled = this.focusPath === null;
    }
  }

  private toggleExpansion(path: string, branch: boolean): void {
    if (this.topology === null) return;
    const expansion = branch
      ? toggleNodeGraphBranch(this.topology, this.currentExpansion, path)
      : toggleNodeGraphNode(this.topology, this.currentExpansion, path);
    this.setExpansion(expansion);
  }

  private setExpansion(expansion: NodeGraphExpansionState): void {
    this.currentExpansion = expansion;
    this.expansionSession = withNodeGraphExpansion(this.expansionSession, this.graphScope, expansion);
    this.displayGraphData = null;
    this.render();
  }

  private openExpansionMenu(anchor: HTMLElement): void {
    if (this.topology === null) return;
    const menu = new Menu();
    for (const range of [1, 2, 3] as const) menu.addItem((item) => item
      .setTitle(rangeExpansionLabel(range))
      .setIcon("list-plus")
      .onClick(() => this.setRangeExpansion(range)));
    const total = estimateNodeGraphRangeNodeCount(this.topology, this.graphScope, "all", false);
    menu.addItem((item) => item
      .setTitle(expandAllLabel(this.graphScope, total))
      .setIcon("unfold-vertical")
      .onClick(() => this.setRangeExpansion("all")));
    menu.addSeparator();
    menu.addItem((item) => item
      .setTitle(label("collapseToFirst"))
      .setIcon("fold-vertical")
      .onClick(() => this.setRangeExpansion("collapse")));
    const rect = anchor.getBoundingClientRect();
    menu.showAtPosition({ x: rect.left, y: rect.bottom }, anchor.ownerDocument);
  }

  private setRangeExpansion(range: NodeGraphRangeDepth): void {
    if (this.topology === null) return;
    this.setExpansion(setNodeGraphRangeDepth(this.topology, this.graphScope, range));
  }

  private setSearchQuery(value: string): void {
    const previous = this.searchQuery.trim();
    const next = value.trim();
    this.searchQuery = value;
    if (previous === "" && next !== "" && this.topology !== null) {
      this.searchSnapshot = captureNodeGraphSearchSnapshot(
        this.graphScope,
        this.currentExpansion,
        this.focusPath,
        this.captureViewportState(),
      );
    }
    if (next === "") {
      const restored = this.searchSnapshot === null ? null : restoreNodeGraphSearchSnapshot(this.searchSnapshot, this.graphScope);
      this.searchSnapshot = null;
      this.searchPreviewPath = null;
      if (restored === null) {
        this.highlightSearch("");
        return;
      }
      const focusChanged = this.focusPath !== restored.focusId;
      this.camera = { ...restored.camera.view3D };
      this.focusPath = restored.focusId;
      this.currentExpansion = restored.expansion;
      this.expansionSession = withNodeGraphExpansion(this.expansionSession, this.graphScope, restored.expansion);
      this.render();
      this.restoreViewportState(restored.camera);
      if (focusChanged) this.markWorkspaceStateDirty();
      return;
    }
    const match = this.firstSearchMatch(value);
    this.searchPreviewPath = match;
    if (match === null || this.topology === null) {
      this.highlightSearch(value);
      return;
    }
    const expanded = expandNodeGraphAncestors(this.topology, this.graphScope, this.currentExpansion, [match]);
    const changed = !sameIds(expanded.expandedIds, this.currentExpansion.expandedIds);
    if (changed) {
      this.currentExpansion = expanded;
      this.expansionSession = withNodeGraphExpansion(this.expansionSession, this.graphScope, expanded);
      this.render();
      this.focusSearchInput();
    } else {
      this.highlightSearch(value);
      this.centerSearchPreview();
    }
  }

  private firstSearchMatch(rawQuery: string): string | null {
    return this.searchSummary(rawQuery).first?.path ?? null;
  }

  private highlightSearch(rawQuery: string): void {
    if (this.canvasRenderer !== null) {
      this.canvasRenderer.setSearchMatches(this.searchSummary(rawQuery).bestPaths);
      return;
    }
    const matches = this.searchSummary(rawQuery).bestPaths;
    for (const [path, node] of this.nodeElements) node.toggleClass("is-search-match", matches.has(path));
  }

  private searchSummary(rawQuery: string): NodeGraphSearchSummary {
    const query = rawQuery.trim();
    if (this.searchResultsCache?.generation === this.graphDataGeneration
      && this.searchResultsCache.query === query) return this.searchResultsCache.summary;
    const summary = summarizeNodeGraphSearch(this.graphSearchRecords(), query);
    this.searchResultsCache = { generation: this.graphDataGeneration, query, summary };
    return summary;
  }

  private centerSearchPreview(): void {
    const path = this.searchPreviewPath;
    if (path === null) return;
    if (this.canvasRenderer !== null) {
      this.canvasRenderer.centerPath(path);
      return;
    }
    if (this.dimension === "3d") {
      const previous = this.focusPath;
      this.focusPath = path;
      this.center3DOnFocus();
      this.focusPath = previous;
      this.applyFocus(false);
      return;
    }
    this.nodeElements.get(path)?.scrollIntoView({ block: "center", inline: "center" });
  }

  private captureViewportState(): NodeGraphViewportState {
    const surface = this.contentEl.querySelector<HTMLElement>(".folder-nodes-node-graph-scroll");
    const stage = surface?.querySelector<HTMLElement>(".folder-nodes-node-graph-stage");
    const canvas = stage?.querySelector<HTMLElement>(".folder-nodes-node-graph-canvas");
    const dom2D = this.dimension === "2d" && this.canvasRenderer === null
      && surface !== null && stage != null && canvas != null
      ? {
        canvasLeft: canvas.style.left,
        canvasTop: canvas.style.top,
        canvasTransform: canvas.style.transform,
        scrollLeft: surface.scrollLeft,
        scrollTop: surface.scrollTop,
        stageHeight: stage.style.height,
        stageWidth: stage.style.width,
      }
      : null;
    return {
      canvas: this.canvasRenderer?.captureViewportState() ?? null,
      dimension: this.dimension,
      dom2D,
      view3D: { ...this.camera },
    };
  }

  private restoreViewportState(state: NodeGraphViewportState): void {
    if (state.dimension !== this.dimension) return;
    this.camera = { ...state.view3D };
    if (state.canvas !== null && this.canvasRenderer !== null) {
      this.canvasRenderer.restoreViewportState(state.canvas);
      return;
    }
    if (state.dom2D === null || this.dimension !== "2d") return;
    const surface = this.contentEl.querySelector<HTMLElement>(".folder-nodes-node-graph-scroll");
    const stage = surface?.querySelector<HTMLElement>(".folder-nodes-node-graph-stage");
    const canvas = stage?.querySelector<HTMLElement>(".folder-nodes-node-graph-canvas");
    if (surface === null || stage == null || canvas == null) return;
    stage.style.width = state.dom2D.stageWidth;
    stage.style.height = state.dom2D.stageHeight;
    canvas.style.left = state.dom2D.canvasLeft;
    canvas.style.top = state.dom2D.canvasTop;
    canvas.style.transform = state.dom2D.canvasTransform;
    surface.scrollLeft = state.dom2D.scrollLeft;
    surface.scrollTop = state.dom2D.scrollTop;
  }

  private focusSearchInput(): void {
    queueMicrotask(() => {
      const input = this.contentEl.querySelector<HTMLInputElement>(".folder-nodes-node-graph-search input");
      input?.focus({ preventScroll: true });
      input?.setSelectionRange(input.value.length, input.value.length);
    });
  }

  private buildGraphData(): GraphData {
    this.graphDataGeneration += 1;
    this.searchResultsCache = null;
    const snapshot = this.graphIndexSnapshot();
    let topology = this.topology;
    if (topology === null || this.topologyRevision !== snapshot.revision) {
      topology = createNodeGraphTopology(
        [...snapshot.records.values()].map(({ path, parentPath }) => ({ id: path, parentId: parentPath })),
        snapshot.links,
      );
      this.topology = topology;
      this.topologyRevision = snapshot.revision;
    }
    let reconciledPersistedState = false;
    if (this.graphScope.mode !== "global" && !topology.nodes.has(this.graphScope.rootPath)) {
      this.graphScope = GLOBAL_NODE_GRAPH_SCOPE;
      reconciledPersistedState = true;
    }
    if (this.focusPath !== null && !topology.nodes.has(this.focusPath)) {
      this.focusPath = null;
      reconciledPersistedState = true;
    }
    if (reconciledPersistedState) this.markWorkspaceStateDirty();
    const structuralScopeIdentity = `${snapshot.revision}\u0000${nodeGraphScopeKey(this.graphScope)}`;
    if (structuralScopeIdentity !== this.structuralScopeIdentity) {
      this.structuralScopeIds = nodeGraphStructuralScopeIds(topology, this.graphScope);
      this.structuralScopeIdentity = structuralScopeIdentity;
    }
    this.currentExpansion = nodeGraphExpansionForScope(this.expansionSession, topology, this.graphScope);
    if (this.pendingPersistedFocusReveal) {
      this.pendingPersistedFocusReveal = false;
      if (this.focusPath !== null) {
        this.currentExpansion = expandNodeGraphAncestors(
          topology,
          this.graphScope,
          this.currentExpansion,
          [this.focusPath],
        );
      }
    }
    this.expansionSession = withNodeGraphExpansion(this.expansionSession, this.graphScope, this.currentExpansion);
    const scene = buildNodeGraphVisibleScene(topology, this.graphScope, this.currentExpansion, { showLinks: this.showLinks });
    const records = new Map<string, GraphRecord>();
    for (const node of scene.nodes) {
      const record = snapshot.records.get(node.id);
      if (record === undefined) continue;
      const childCount = node.linkedOnly || !this.structuralScopeIds.has(node.id)
        ? 0
        : (topology.nodes.get(node.id)?.children ?? []).filter((id) => this.structuralScopeIds.has(id)).length;
      records.set(node.id, {
        ...record,
        boundary: node.linkedOnly,
        childCount,
        expanded: childCount > 0 && this.currentExpansion.expandedIds.has(node.id),
        parentPath: node.parentId,
      });
    }
    const visibleLinks = new Map<string, Set<string>>();
    for (const { source, target } of scene.linkEdges) {
      const targets = visibleLinks.get(source) ?? new Set<string>();
      targets.add(target);
      visibleLinks.set(source, targets);
    }
    const model = buildNodeGraphModelFromNodes(
      scene.nodes.map(({ id, depth }) => ({ id, depth })),
      scene.structureEdges,
      visibleLinks,
    );
    const nodeWidths = nodeGraphSiblingCardWidths([...records.values()].map((record) => ({
      id: record.path,
      label: record.label,
      parentId: record.parentPath,
    })));
    const direction = this.settings().layoutDirection;
    return {
      records,
      model,
      layout: layoutNodeGraphForest(
        this.dimension === "2d" ? this.buildForest(records) : [],
        { direction, nodeWidths },
      ),
      points3D: this.dimension === "3d" ? layoutNodeGraph3D(model, { nodeWidths }) : [],
    };
  }

  private graphIndexSnapshot(): NodeGraphIndexSnapshot {
    const snapshot = this.options.getIndexSnapshot();
    this.indexSnapshot = snapshot;
    return snapshot;
  }

  private buildForest(records: ReadonlyMap<string, GraphRecord>): NodeGraphTree[] {
    type MutableTree = { readonly id: string; readonly children: MutableTree[] };
    const trees = new Map<string, MutableTree>();
    for (const path of records.keys()) trees.set(path, { id: path, children: [] });
    const roots: MutableTree[] = [];
    for (const record of records.values()) {
      const tree = trees.get(record.path);
      if (tree === undefined) continue;
      const parent = record.parentPath === null ? undefined : trees.get(record.parentPath);
      if (parent === undefined) roots.push(tree);
      else parent.children.push(tree);
    }
    return roots;
  }

  private settings(): NodeGraphSettings {
    return this.options.getSettings?.() ?? DEFAULT_NODE_GRAPH_SETTINGS;
  }

  private markWorkspaceStateDirty(): void {
    const app = this.app as unknown as { readonly workspace?: { readonly requestSaveLayout?: () => void } };
    app.workspace?.requestSaveLayout?.();
  }

  private scopeLabel(): string {
    if (this.graphScope.mode === "global") return `${label("scopePrefix")}${label("globalScope")}`;
    const rootLabel = this.graphScope.rootPath === ""
      ? this.app.vault.getName()
      : this.indexSnapshot?.records.get(this.graphScope.rootPath)?.label ?? this.graphScope.rootPath;
    return `${label("scopePrefix")}${rootLabel} · ${this.graphScope.mode === "subtree" ? label("subtreeScope") : label("localScope")}`;
  }

  private render2D(surface: HTMLElement, data: GraphData, fit: HTMLButtonElement | null): void {
    const layout = data.layout;
    const stage = surface.createDiv({ cls: "folder-nodes-node-graph-stage" });
    stage.style.width = `${layout.width}px`;
    stage.style.height = `${layout.height}px`;
    const canvas = stage.createDiv({ cls: "folder-nodes-node-graph-canvas" });
    canvas.style.width = `${layout.width}px`;
    canvas.style.height = `${layout.height}px`;
    const svg = this.edgeLayer(canvas, layout.width, layout.height);
    const positions = new Map(layout.nodes.map((node) => [node.id, node]));
    for (const edge of edgesForShowLinks(data.model, this.showLinks)) {
      const source = positions.get(edge.source);
      const target = positions.get(edge.target);
      if (source === undefined || target === undefined) continue;
      this.render2DRelationEdge(svg, edge, source, target, layout);
    }
    for (const position of layout.nodes) {
      const record = data.records.get(position.id);
      if (record === undefined) continue;
      const node = this.createNode(canvas, record);
      node.style.left = `${position.x}px`;
      node.style.top = `${position.y}px`;
      node.style.width = `${position.width}px`;
      node.style.height = `${layout.nodeHeight}px`;
    }
    fit?.addEventListener("click", () => this.fit2D(surface, stage, canvas, layout.width, layout.height));
  }

  private render3D(surface: HTMLElement, data: GraphData, fit: HTMLButtonElement | null): void {
    const width = Math.max(1, surface.clientWidth || this.contentEl.clientWidth || 800);
    const height = Math.max(1, surface.clientHeight || this.contentEl.clientHeight - 44 || 600);
    this.threeDViewport = { width, height };
    this.threeDSurface = surface;
    this.threeDPoints = data.points3D;
    const canvas = surface.createDiv({ cls: "folder-nodes-node-graph-canvas folder-nodes-node-graph-canvas-3d" });
    this.threeDCanvas = canvas;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    this.threeDSvg = this.edgeLayer(canvas, width, height);
    const projected = projectNodeGraph3D(this.threeDPoints, this.camera, width, height);
    this.projected3D = new Map(projected.map((point) => [point.id, point]));
    for (const edge of edgesForShowLinks(data.model, this.showLinks)) {
      const source = this.projected3D.get(edge.source);
      const target = this.projected3D.get(edge.target);
      if (source === undefined || target === undefined) continue;
      this.renderRelationEdge(this.threeDSvg, edge, source, target);
    }
    for (const point of [...projected].sort((a, b) => a.scale - b.scale || a.id.localeCompare(b.id, "en"))) {
      const record = data.records.get(point.id);
      if (record === undefined) continue;
      const node = this.createNode(canvas, record);
      node.addClass("is-3d");
      this.position3DNode(node, point);
    }
    this.bind3DInteraction(surface);
    fit?.addEventListener("click", () => {
      if (this.threeDViewport === null) return;
      this.camera = fitNodeGraphCamera(
        this.threeDPoints,
        this.camera,
        this.threeDViewport.width,
        this.threeDViewport.height,
        48,
        this.denseThreeD ? NODE_GRAPH_DENSE_3D_FIT_SCALE : NODE_GRAPH_DOM_MIN_SCALE,
      );
      this.update3DProjection();
    });
  }

  private renderCanvas(surface: HTMLElement, data: GraphData, fit: HTMLButtonElement | null): void {
    this.contentEl.addClass("is-canvas-graph");
    this.canvasRenderer = new NodeGraphCanvasRenderer(
      surface,
      {
        layout: data.layout,
        model: data.model,
        points3D: data.points3D,
        records: data.records,
      },
      this.dimension,
      this.showLinks,
      this.focusPath,
      {
        hiddenLabel: (sourcePath, explicit) => explicit ? t("hiddenNode") : t("hiddenByNode", { path: sourcePath }),
        label: (key) => label(key),
        onOpen: (path, newLeaf) => void this.service.openFolderNode(path, newLeaf),
        onSelect: (path) => {
          const changed = this.focusPath !== path;
          this.focusPath = path;
          if (changed) this.markWorkspaceStateDirty();
          this.updateScopeControls();
        },
        onToggle: (path, branch) => this.toggleExpansion(path, branch),
        onContextMenu: (path, event) => this.options.onNodeMenu?.(event, path),
        overviewEdgeLimit: this.settings().overviewEdgeLimit,
        relationSummary,
        toggleLabel: (nodeLabel, childCount, expanded) => childActionLabel(
          `${expanded ? label("collapseChildren") : label("expandChildren")} ${nodeLabel}`,
          childCount,
        ),
      },
    );
    fit?.addEventListener("click", () => this.canvasRenderer?.fit());
  }

  private edgeLayer(canvas: HTMLElement, width: number, height: number): SVGSVGElement {
    return canvas.createSvg("svg", {
      cls: "folder-nodes-node-graph-edges",
      attr: { width: String(width), height: String(height), viewBox: `0 0 ${width} ${height}`, "aria-hidden": "true" },
    });
  }

  private renderRelationEdge(
    svg: SVGSVGElement,
    edge: NodeGraphModelEdge,
    source: NodeGraphProjectedPoint,
    target: NodeGraphProjectedPoint,
  ): void {
    const sourceBox = this.projectedNodeBox(source);
    const targetBox = this.projectedNodeBox(target);
    if (edge.structure) {
      this.path(
        svg,
        edge.source,
        edge.target,
        nodeGraphCubicPath(nodeGraphStructureGeometry(sourceBox, targetBox, this.settings().layoutDirection)),
        "is-structure",
        0,
      );
    }
    if (this.showLinks && edge.link) {
      const offset = edge.structure ? 4 : 0;
      const geometry = nodeGraphLinkGeometry(sourceBox, targetBox, offset);
      this.path(
        svg,
        edge.source,
        edge.target,
        nodeGraphQuadraticPath(geometry),
        "is-link",
        offset,
      );
    }
  }

  private render2DRelationEdge(
    svg: SVGSVGElement,
    edge: NodeGraphModelEdge,
    source: NodeGraphLayout["nodes"][number],
    target: NodeGraphLayout["nodes"][number],
    layout: NodeGraphLayout,
  ): void {
    const sourceBox = nodeGraphBoxFromTopLeft(source.x, source.y, source.width, layout.nodeHeight);
    const targetBox = nodeGraphBoxFromTopLeft(target.x, target.y, target.width, layout.nodeHeight);
    if (edge.structure) {
      this.path(
        svg,
        edge.source,
        edge.target,
        nodeGraphCubicPath(nodeGraphStructureGeometry(sourceBox, targetBox, layout.direction)),
        "is-structure",
        0,
      );
    }
    if (this.showLinks && edge.link) {
      const offset = edge.structure ? 7 : 0;
      this.path(
        svg,
        edge.source,
        edge.target,
        nodeGraphQuadraticPath(nodeGraphLinkGeometry(sourceBox, targetBox, offset)),
        "is-link",
        offset,
      );
    }
  }

  private path(
    svg: SVGSVGElement,
    source: string,
    target: string,
    pathData: string,
    kind: "is-link" | "is-structure",
    offset: number,
  ): void {
    svg.createSvg("path", {
      cls: kind,
      attr: {
        d: pathData,
        "data-edge-source": source,
        "data-edge-target": target,
        "data-edge-offset": String(offset),
      },
    });
  }

  private createNode(canvas: HTMLElement, record: GraphRecord): HTMLElement {
    const title = record.path === "" ? this.app.vault.getName() : record.path;
    const accessibleTitle = record.boundary ? `${title}\n${label("boundaryNode")}` : title;
    const hiddenTitle = record.hiddenSourcePath === null || record.hiddenSourcePath === undefined
      ? accessibleTitle
      : `${accessibleTitle}\n${record.hiddenExplicit ? t("hiddenNode") : t("hiddenByNode", { path: record.hiddenSourcePath })}`;
    const topologyNode = this.topology?.nodes.get(record.path);
    const childIds = (topologyNode?.children ?? []).filter((id) => this.structuralScopeIds.has(id));
    const expandable = !record.boundary && this.structuralScopeIds.has(record.path) && childIds.length > 0;
    const expanded = expandable && this.currentExpansion.expandedIds.has(record.path);
    const node = canvas.createDiv({
      cls: [
        "folder-nodes-node-graph-node",
        record.boundary ? "is-boundary" : "",
        expandable ? expanded ? "is-expanded" : "is-collapsed" : "is-leaf",
      ].filter(Boolean).join(" "),
      attr: { "data-node-path": record.path, title: hiddenTitle },
    });
    const icon = node.createSpan({
      cls: "folder-nodes-node-graph-node-icon-handle",
      attr: { "aria-hidden": "true" },
    });
    const visual = record.visual;
    if (visual.kind === "fallback") setIcon(icon, record.path === "" ? "home" : "folder");
    else renderVisual(icon, visual, record.label);
    const body = node.createEl("button", {
      cls: "folder-nodes-node-graph-node-body",
      attr: { "aria-label": hiddenTitle, type: "button" },
    });
    body.createSpan({ cls: "folder-nodes-node-graph-label", text: record.label });
    if (record.hiddenExplicit) {
      const status = body.createSpan({ cls: "folder-nodes-hidden-status", attr: { "aria-hidden": "true" } });
      setIcon(status, "eye-off");
    } else if (record.hiddenSourcePath !== null && record.hiddenSourcePath !== undefined) node.addClass("folder-nodes-hidden-inherited");
    setTooltip(body, hiddenTitle);
    body.addEventListener("click", () => {
      const changed = this.focusPath !== record.path;
      this.focusPath = record.path;
      if (changed) this.markWorkspaceStateDirty();
      this.applyFocus(false);
      this.applyNeighborhood();
      this.updateScopeControls();
    });
    body.addEventListener("dblclick", (event) => {
      void this.service.openFolderNode(record.path, event.ctrlKey || event.metaKey);
    });
    body.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      if (event.repeat) return;
      void this.service.openFolderNode(record.path, event.ctrlKey || event.metaKey);
    });
    if (expandable) {
      const action = expanded ? label("collapseChildren") : label("expandChildren");
      const expand = node.createEl("button", {
        cls: "folder-nodes-node-graph-node-expand-handle",
        attr: {
          "aria-expanded": String(expanded),
          "aria-label": childActionLabel(action, childIds.length),
          type: "button",
        },
      });
      expand.createSpan({ cls: "folder-nodes-node-graph-node-child-count", text: String(childIds.length) });
      setIcon(expand.createSpan({ cls: "folder-nodes-node-graph-node-expand-icon" }), expanded ? "minus" : "plus");
      setTooltip(expand, `${childActionLabel(action, childIds.length)} · ${label("altBranchHint")}`);
      expand.addEventListener("click", (event) => {
        event.stopPropagation();
        this.toggleExpansion(record.path, event.altKey);
      });
      expand.addEventListener("keydown", (event) => {
        if (!event.altKey || (event.key !== "Enter" && event.key !== " ")) return;
        event.preventDefault();
        event.stopPropagation();
        this.toggleExpansion(record.path, true);
      });
    }
    node.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      this.options.onNodeMenu?.(event, record.path);
    });
    this.nodeElements.set(record.path, node);
    return node;
  }

  private bind3DInteraction(surface: HTMLElement): void {
    surface.addEventListener("pointerdown", (event) => {
      const target = event.target as Element | null;
      const startsOnNode = target?.closest(".folder-nodes-node-graph-node") !== null;
      if (startsOnNode && !(event.pointerType === "touch" && this.pointers.size > 0)) return;
      const pan = event.shiftKey || event.button === 1;
      this.pointers.set(event.pointerId, {
        pan,
        pointerType: event.pointerType,
        x: event.clientX,
        y: event.clientY,
      });
      this.drag = { pointerId: event.pointerId, pan: event.shiftKey || event.button === 1, x: event.clientX, y: event.clientY };
      if (event.pointerType === "touch" && this.pointers.size > 1) this.drag = null;
      surface.setPointerCapture?.(event.pointerId);
      surface.addClass("is-dragging");
    });
    surface.addEventListener("pointermove", (event) => {
      const pointer = this.pointers.get(event.pointerId);
      if (pointer?.pointerType === "touch" && this.pointers.size > 1) {
        const before = touchGesture(this.pointers.values());
        pointer.x = event.clientX;
        pointer.y = event.clientY;
        const after = touchGesture(this.pointers.values());
        if (before !== null && after !== null) {
          this.camera = panNodeGraphCamera(this.camera, after.centerX - before.centerX, after.centerY - before.centerY);
          if (before.distance > 0 && after.distance > 0) {
            const factor = after.distance / before.distance;
            this.camera = zoomNodeGraphCamera(this.camera, -Math.log(factor) / 0.0015);
          }
          this.update3DProjection();
        }
        return;
      }
      if (this.drag === null || event.pointerId !== this.drag.pointerId) return;
      const deltaX = event.clientX - this.drag.x;
      const deltaY = event.clientY - this.drag.y;
      this.drag.x = event.clientX;
      this.drag.y = event.clientY;
      if (pointer !== undefined) {
        pointer.x = event.clientX;
        pointer.y = event.clientY;
      }
      this.camera = this.drag.pan
        ? panNodeGraphCamera(this.camera, deltaX, deltaY)
        : rotateNodeGraphCamera(this.camera, deltaX, deltaY);
      this.update3DProjection();
    });
    const finish = (event: PointerEvent): void => {
      if (!this.pointers.delete(event.pointerId)) return;
      if (this.pointers.size === 0) {
        this.drag = null;
        surface.removeClass("is-dragging");
        return;
      }
      const remaining = this.pointers.entries().next().value;
      this.drag = remaining === undefined ? null : {
        pointerId: remaining[0],
        pan: remaining[1].pan,
        x: remaining[1].x,
        y: remaining[1].y,
      };
    };
    surface.addEventListener("pointerup", finish);
    surface.addEventListener("pointercancel", finish);
    surface.addEventListener("wheel", (event) => {
      event.preventDefault();
      this.camera = zoomNodeGraphCamera(this.camera, event.deltaY);
      this.update3DProjection();
    }, { passive: false });
  }

  private update3DProjection(): void {
    if (this.threeDViewport === null || this.threeDSvg === null) return;
    const projected = projectNodeGraph3D(this.threeDPoints, this.camera, this.threeDViewport.width, this.threeDViewport.height);
    this.projected3D = new Map(projected.map((point) => [point.id, point]));
    for (const point of projected) {
      const node = this.nodeElements.get(point.id);
      if (node !== undefined) this.position3DNode(node, point);
    }
    for (const edgeElement of this.threeDSvg.querySelectorAll<SVGPathElement>("path[data-edge-source][data-edge-target]")) {
      const sourceId = edgeElement.dataset.edgeSource;
      const targetId = edgeElement.dataset.edgeTarget;
      if (sourceId === undefined || targetId === undefined) continue;
      const source = this.projected3D.get(sourceId);
      const target = this.projected3D.get(targetId);
      if (source === undefined || target === undefined) continue;
      const offset = Number(edgeElement.dataset.edgeOffset ?? 0);
      const boundedOffset = Number.isFinite(offset) ? offset : 0;
      edgeElement.setAttribute("d", edgeElement.classList.contains("is-link")
        ? nodeGraphQuadraticPath(nodeGraphLinkGeometry(this.projectedNodeBox(source), this.projectedNodeBox(target), boundedOffset))
        : nodeGraphCubicPath(nodeGraphStructureGeometry(
          this.projectedNodeBox(source),
          this.projectedNodeBox(target),
          this.settings().layoutDirection,
        )));
    }
    this.applyFocus(false);
  }

  private resize3DViewport(): void {
    if (this.dimension !== "3d" || this.threeDSurface === null || this.threeDCanvas === null || this.threeDSvg === null) return;
    const width = Math.max(1, this.threeDSurface.clientWidth || this.contentEl.clientWidth || 800);
    const height = Math.max(1, this.threeDSurface.clientHeight || this.contentEl.clientHeight - 76 || 600);
    if (this.threeDViewport?.width === width && this.threeDViewport.height === height) return;
    this.threeDViewport = { width, height };
    this.threeDCanvas.style.width = `${width}px`;
    this.threeDCanvas.style.height = `${height}px`;
    this.threeDSvg.setAttribute("width", String(width));
    this.threeDSvg.setAttribute("height", String(height));
    this.threeDSvg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    this.update3DProjection();
  }

  private position3DNode(node: HTMLElement, point: NodeGraphProjectedPoint): void {
    const scale = this.projectedNodeScale(point);
    node.style.setProperty("--folder-nodes-node-graph-card-width", `${point.width ?? NODE_GRAPH_CARD_WIDTH_REGULAR}px`);
    node.style.left = `${point.x}px`;
    node.style.top = `${point.y}px`;
    node.style.zIndex = String(Math.max(1, Math.round(point.scale * 1000)));
    node.style.transform = `translate(-50%, -50%) scale(${scale})`;
    node.removeClass("is-depth-near", "is-depth-mid", "is-depth-far");
    node.addClass(scale >= 1.02 ? "is-depth-near" : scale >= 0.82 ? "is-depth-mid" : "is-depth-far");
  }

  private projectedNodeBox(point: NodeGraphProjectedPoint): ReturnType<typeof nodeGraphBoxFromCenter> {
    const scale = this.projectedNodeScale(point);
    if (this.denseThreeD && point.id !== this.focusPath) return nodeGraphBoxFromCenter(point.x, point.y, 8 * scale, 8 * scale);
    return nodeGraphBoxFromCenter(
      point.x,
      point.y,
      (point.width ?? NODE_GRAPH_CARD_WIDTH_REGULAR) / 2 * scale,
      23 * scale,
    );
  }

  private projectedNodeScale(point: NodeGraphProjectedPoint): number {
    return Math.max(NODE_GRAPH_DOM_MIN_SCALE, Math.min(1.2, point.scale));
  }

  private applyFocus(scrollIntoView: boolean): void {
    for (const [path, element] of this.nodeElements) element.toggleClass("is-focused", path === this.focusPath);
    if (!scrollIntoView || this.focusPath === null) return;
    this.nodeElements.get(this.focusPath)?.scrollIntoView({ block: "center", inline: "center" });
  }

  private applyNeighborhood(): void {
    if (this.canvasRenderer !== null) {
      this.canvasRenderer.setFocus(this.focusPath, false);
      return;
    }
    const selected = this.focusPath;
    const neighbors = new Set<string>();
    for (const edge of edgesForShowLinks(this.displayGraphData?.model ?? { nodes: [], edges: [] }, this.showLinks)) {
      if (edge.source === selected) neighbors.add(edge.target);
      else if (edge.target === selected) neighbors.add(edge.source);
    }
    for (const [path, node] of this.nodeElements) {
      node.toggleClass("is-neighbor", neighbors.has(path));
      node.toggleClass("is-muted", selected !== null && path !== selected && !neighbors.has(path));
    }
    for (const edge of this.contentEl.querySelectorAll<SVGElement>(".folder-nodes-node-graph-edges [data-edge-source][data-edge-target]")) {
      const connected = selected !== null
        && (edge.dataset.edgeSource === selected || edge.dataset.edgeTarget === selected);
      edge.classList.toggle("is-connected", connected);
      edge.classList.toggle("is-muted", selected !== null && !connected);
    }
  }

  private center3DOnFocus(): void {
    if (this.focusPath === null || this.threeDViewport === null) {
      this.applyFocus(false);
      return;
    }
    const point = this.projected3D.get(this.focusPath);
    if (point === undefined) {
      this.applyFocus(false);
      return;
    }
    this.camera = panNodeGraphCamera(
      this.camera,
      this.threeDViewport.width / 2 - point.x,
      this.threeDViewport.height / 2 - point.y,
    );
    this.update3DProjection();
  }

  private fit2D(surface: HTMLElement, stage: HTMLElement, canvas: HTMLElement, width: number, height: number): void {
    const fit = fitNodeGraphViewport(
      width,
      height,
      surface.clientWidth,
      surface.clientHeight,
      24,
      NODE_GRAPH_DOM_MIN_2D_SCALE,
    );
    stage.style.width = `${fit.stageWidth}px`;
    stage.style.height = `${fit.stageHeight}px`;
    canvas.style.left = `${fit.offsetX}px`;
    canvas.style.top = `${fit.offsetY}px`;
    canvas.style.transform = `scale(${fit.scale})`;
    let left = 0;
    let top = 0;
    if (fit.stageWidth > surface.clientWidth || fit.stageHeight > surface.clientHeight) {
      const fallbackPath = this.displayGraphData?.model.nodes[0]?.id;
      const target = this.focusPath === null ? fallbackPath === undefined ? null : this.nodeElements.get(fallbackPath) : this.nodeElements.get(this.focusPath);
      if (target !== null && target !== undefined) {
        const centerX = (Number.parseFloat(target.style.left) + Number.parseFloat(target.style.width) / 2) * fit.scale + fit.offsetX;
        const centerY = (Number.parseFloat(target.style.top) + Number.parseFloat(target.style.height) / 2) * fit.scale + fit.offsetY;
        left = Math.max(0, centerX - surface.clientWidth / 2);
        top = Math.max(0, centerY - surface.clientHeight / 2);
      }
    }
    surface.scrollTo({ left, top, behavior: "smooth" });
  }
}

function touchGesture(pointers: Iterable<GraphPointer>): {
  readonly centerX: number;
  readonly centerY: number;
  readonly distance: number;
} | null {
  const [first, second] = [...pointers].filter(({ pointerType }) => pointerType === "touch");
  if (first === undefined || second === undefined) return null;
  return {
    centerX: (first.x + second.x) / 2,
    centerY: (first.y + second.y) / 2,
    distance: Math.hypot(second.x - first.x, second.y - first.y),
  };
}

function relationSummary(structure: number, links: number): string {
  return t("nodeGraphRelationSummary", { structure, links });
}

function label(
  key: "altBranchHint" | "boundaryNode" | "clearSearch" | "collapseChildren" | "collapseToFirst" | "dimension" | "disabledGraph" | "expandChildren" | "expandRange" | "expandRangeTooltip" | "findNode" | "fitGraph" | "globalScope" | "globalScopeTooltip" | "largeGraph" | "localScope" | "localScopeTooltip" | "nodeGraph" | "noLinks" | "scope" | "scopePrefix" | "selectNodeFirst" | "showLinks" | "showLinksTooltip" | "subtreeScope" | "subtreeScopeTooltip",
): string {
  const translationKey = ({
    altBranchHint: "nodeGraphToggleBranch",
    boundaryNode: "nodeGraphBoundaryNode",
    clearSearch: "nodeGraphClearSearch",
    collapseChildren: "nodeGraphCollapseChildren",
    collapseToFirst: "nodeGraphCollapseToLevelOne",
    dimension: "nodeGraphDimension",
    disabledGraph: "nodeGraphDisabledDesc",
    expandChildren: "nodeGraphExpandChildren",
    expandRange: "nodeGraphExpandRange",
    expandRangeTooltip: "nodeGraphExpandRangeTooltip",
    findNode: "nodeGraphFindNode",
    fitGraph: "nodeGraphFitGraph",
    globalScope: "nodeGraphGlobalScope",
    globalScopeTooltip: "nodeGraphGlobalScopeTooltip",
    largeGraph: "nodeGraphLargeGraphAria",
    localScope: "nodeGraphLocalScope",
    localScopeTooltip: "nodeGraphLocalScopeTooltip",
    nodeGraph: "nodeGraph",
    noLinks: "nodeGraphNoLinks",
    scope: "nodeGraphScope",
    scopePrefix: "nodeGraphScopePrefix",
    selectNodeFirst: "nodeGraphSelectNodeFirst",
    showLinks: "nodeGraphShowLinks",
    showLinksTooltip: "nodeGraphShowLinksTooltip",
    subtreeScope: "nodeGraphSubtreeScope",
    subtreeScopeTooltip: "nodeGraphSubtreeScopeTooltip",
  } as const)[key];
  return t(translationKey);
}

function rangeExpansionLabel(range: 1 | 2 | 3): string {
  if (range === 1) return t("nodeGraphExpandOneLevel");
  return t(range === 2 ? "nodeGraphExpandTwoLevels" : "nodeGraphExpandThreeLevels");
}

function expandAllLabel(scope: NodeGraphScope, count: number): string {
  const key = scope.mode === "global"
    ? "nodeGraphExpandAllGlobal"
    : scope.mode === "subtree" ? "nodeGraphExpandAllSubtree" : "nodeGraphExpandAllLocal";
  return t(key, { count: count.toLocaleString() });
}

function childActionLabel(action: string, count: number): string {
  return t("nodeGraphActionCount", { action, count });
}

function linkCountLabel(count: number): string {
  return t("nodeGraphVisibleLinks", { count });
}

function sameIds(left: ReadonlySet<string>, right: ReadonlySet<string>): boolean {
  return left.size === right.size && [...left].every((id) => right.has(id));
}

function remapNodeGraphPath(path: string, previous: string, next: string): string {
  const normalized = normalizeVaultPath(path);
  if (!isWithin(normalized, previous)) return normalized;
  return normalized === previous ? next : normalizeVaultPath(`${next}${normalized.slice(previous.length)}`);
}

function remapNodeGraphExpansion(
  expansion: NodeGraphExpansionState,
  remap: (path: string) => string,
): NodeGraphExpansionState {
  return graphExpansionState(
    [...expansion.expandedIds].map(remap),
    [...expansion.collapsedIds ?? []].map(remap),
  );
}

function filterNodeGraphExpansion(
  expansion: NodeGraphExpansionState,
  retained: (path: string) => boolean,
): NodeGraphExpansionState {
  return graphExpansionState(
    [...expansion.expandedIds].filter(retained),
    [...expansion.collapsedIds ?? []].filter(retained),
  );
}

function remapNodeGraphExpansionSession(
  session: NodeGraphExpansionSession,
  remap: (path: string) => string,
): NodeGraphExpansionSession {
  const scopes = new Map<string, NodeGraphExpansionState>();
  for (const [scopeKey, expansion] of session.scopes) {
    const key = remapNodeGraphScopeKey(scopeKey, remap);
    const remapped = remapNodeGraphExpansion(expansion, remap);
    const existing = scopes.get(key);
    scopes.set(key, existing === undefined
      ? remapped
      : graphExpansionState(
        [...existing.expandedIds, ...remapped.expandedIds],
        [...existing.collapsedIds ?? [], ...remapped.collapsedIds ?? []],
      ));
  }
  return { scopes };
}

function filterNodeGraphExpansionSession(
  session: NodeGraphExpansionSession,
  retained: (path: string) => boolean,
): NodeGraphExpansionSession {
  const scopes = new Map<string, NodeGraphExpansionState>();
  for (const [scopeKey, expansion] of session.scopes) {
    const root = nodeGraphScopeKeyRoot(scopeKey);
    if (root !== null && !retained(root)) continue;
    scopes.set(scopeKey, filterNodeGraphExpansion(expansion, retained));
  }
  return { scopes };
}

function graphExpansionState(expanded: Iterable<string>, collapsed: Iterable<string>): NodeGraphExpansionState {
  const collapsedIds = new Set(collapsed);
  const expandedIds = new Set([...expanded].filter((id) => !collapsedIds.has(id)));
  return collapsedIds.size === 0 ? { expandedIds } : { collapsedIds, expandedIds };
}

function remapNodeGraphScopeKey(scopeKey: string, remap: (path: string) => string): string {
  const separator = scopeKey.indexOf(":");
  if (separator < 0) return scopeKey;
  return `${scopeKey.slice(0, separator)}:${remap(scopeKey.slice(separator + 1))}`;
}

function nodeGraphScopeKeyRoot(scopeKey: string): string | null {
  const separator = scopeKey.indexOf(":");
  return separator < 0 ? null : normalizeVaultPath(scopeKey.slice(separator + 1));
}
