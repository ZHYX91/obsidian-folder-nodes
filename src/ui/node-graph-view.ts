import { ItemView, setIcon, TFile, TFolder, WorkspaceLeaf, type ViewStateResult } from "obsidian";

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
  NODE_GRAPH_DENSITY_THRESHOLD,
  nodeGraphDensityOverview,
} from "../core/node-graph-density";
import { normalizeNodeGraphLinks } from "../core/node-graph-links";
import { fitNodeGraphViewport, layoutNodeGraphForest, type NodeGraphLayout, type NodeGraphTree } from "../core/node-graph-layout";
import { buildNodeGraphModelFromNodes, edgesForMode, type NodeGraphModel, type NodeGraphModelEdge } from "../core/node-graph-model";
import {
  GLOBAL_NODE_GRAPH_SCOPE,
  nodeGraphParentPath,
  nodeGraphPathDepth,
  nodeGraphPathIsConfigured,
  nodeGraphSubtreeIsExcluded,
  nodeGraphTraversalRoots,
  normalizeNodeGraphScope,
  type NodeGraphScope,
} from "../core/node-graph-scope";
import { normalizeVaultPath } from "../core/paths";
import type { NodeGraphDimension, NodeGraphRelationMode, NodeGraphSettings, NodeVisual } from "../core/types";
import { renderVisual } from "../presentation/render-visual";
import { DEFAULT_NODE_GRAPH_SETTINGS } from "../shared/settings";
import { resolvedLanguage } from "./i18n";
import {
  NodeGraphCanvasRenderer,
  type NodeGraphCanvasRecord,
} from "./node-graph-canvas-renderer";

interface NodeGraphService {
  getFolder(path: string): TFolder | null;
  getCanonicalFile(folderPath: string): TFile | null;
  isCanonicalFile?(file: TFile): boolean;
  folderForFile?(file: TFile | null): TFolder | null;
  children(path: string): readonly { readonly childPath: string }[];
  openFolderNode(path: string, newLeaf?: boolean): Promise<void>;
}

interface NodeGraphVisuals {
  resolve(folder: TFolder): NodeVisual;
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

interface NodeGraphViewOptions {
  readonly getInboundSources?: (targetPath: string) => readonly string[];
  readonly getSettings?: () => NodeGraphSettings;
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
const NODE_GRAPH_DENSE_3D_THRESHOLD = 24;
const NODE_GRAPH_DENSE_3D_FIT_SCALE = 0.16;

export class FolderNodeGraphView extends ItemView {
  private focusPath: string | null = null;
  private relationMode: NodeGraphRelationMode;
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
  private graphData: GraphData | null = null;
  private displayGraphData: GraphData | null = null;
  private showAllDensityNodes = false;
  private hiddenBranchCount = 0;
  private denseThreeD = false;
  private refreshGeneration = 0;
  private refreshTimer: number | null = null;

  public constructor(
    leaf: WorkspaceLeaf,
    private readonly service: NodeGraphService,
    private readonly visuals: NodeGraphVisuals,
    private readonly options: NodeGraphViewOptions = {},
  ) {
    super(leaf);
    const settings = this.settings();
    this.relationMode = settings.defaultRelationMode;
    this.dimension = settings.defaultDimension;
  }

  public override getViewType(): string { return NODE_GRAPH_VIEW_TYPE; }
  public override getDisplayText(): string { return label("nodeGraph"); }
  public override getIcon(): string { return "git-fork"; }
  public override async onOpen(): Promise<void> { this.render(); }
  public override getState(): Record<string, unknown> {
    return { dimension: this.dimension, relationMode: this.relationMode, scope: this.graphScope };
  }
  public override async setState(state: unknown, _result: ViewStateResult): Promise<void> {
    if (typeof state === "object" && state !== null) {
      const input = state as { readonly dimension?: unknown; readonly relationMode?: unknown; readonly scope?: unknown };
      if (input.dimension === "2d" || input.dimension === "3d") this.dimension = input.dimension;
      if (input.relationMode === "structure" || input.relationMode === "links" || input.relationMode === "hybrid") {
        this.relationMode = input.relationMode;
      }
      this.graphScope = normalizeNodeGraphScope(input.scope);
      this.focusPath = this.graphScope.mode === "global" ? null : this.graphScope.rootPath;
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
    this.graphData = null;
    this.displayGraphData = null;
    this.nodeElements.clear();
    this.projected3D.clear();
    this.threeDPoints = [];
    this.threeDCanvas = null;
    this.threeDSurface = null;
    this.threeDSvg = null;
    this.threeDViewport = null;
    this.drag = null;
    this.pointers.clear();
  }

  public setFocus(path: string | null): void {
    this.focusPath = path === null ? null : normalizeVaultPath(path);
    if (this.focusPath !== null
      && this.graphData?.records.has(this.focusPath) === true
      && this.displayGraphData?.records.has(this.focusPath) === false) {
      this.render();
      if (this.canvasRenderer !== null) this.canvasRenderer.setFocus(this.focusPath, true);
      else if (this.dimension === "3d") this.center3DOnFocus();
      else this.applyFocus(true);
      return;
    }
    if (this.canvasRenderer !== null) this.canvasRenderer.setFocus(this.focusPath, true);
    else if (this.dimension === "3d" && this.focusPath !== null) this.center3DOnFocus();
    else this.applyFocus(true);
    this.updateScopeControls();
  }

  public setGraphScope(scope: NodeGraphScope): void {
    const normalized = normalizeNodeGraphScope(scope);
    if (JSON.stringify(normalized) === JSON.stringify(this.graphScope)) return;
    this.graphScope = normalized;
    this.graphData = null;
    this.displayGraphData = null;
    this.showAllDensityNodes = false;
    if (normalized.mode !== "global") this.focusPath = normalized.rootPath;
    this.render();
  }

  public refresh(): void {
    const generation = ++this.refreshGeneration;
    const ownerWindow = this.contentEl.ownerDocument.defaultView ?? window;
    if (this.refreshTimer !== null) ownerWindow.clearTimeout(this.refreshTimer);
    this.refreshTimer = ownerWindow.setTimeout(() => {
      this.refreshTimer = null;
      if (generation !== this.refreshGeneration) return;
      this.graphData = null;
      this.displayGraphData = null;
      this.render();
    }, 50);
  }

  private render(): void {
    this.canvasRenderer?.destroy();
    this.canvasRenderer = null;
    this.displayGraphData = null;
    this.hiddenBranchCount = 0;
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

    if (!this.settings().enabled) {
      this.contentEl.createDiv({ cls: "folder-nodes-node-graph-disabled", text: label("disabledGraph"), attr: { role: "status" } });
      this.didRender();
      return;
    }

    const sourceData = this.graphData ?? this.buildGraphData();
    this.graphData = sourceData;
    const data = this.buildDisplayGraphData(sourceData);
    this.displayGraphData = data;
    this.denseThreeD = this.dimension === "3d" && data.model.nodes.length > NODE_GRAPH_DENSE_3D_THRESHOLD;
    this.contentEl.toggleClass("is-dense-3d", this.denseThreeD);
    const toolbar = this.renderToolbar();
    const fit = toolbar.querySelector<HTMLButtonElement>("[data-node-graph-action='fit']");
    const surface = this.contentEl.createDiv({ cls: "folder-nodes-node-graph-scroll" });
    const visibleEdgeCount = edgesForMode(data.model, this.relationMode).length;
    if (shouldUseNodeGraphCanvas(data.model.nodes.length, visibleEdgeCount, this.settings().largeGraphThreshold)) {
      this.renderCanvas(surface, data, fit);
    }
    else if (this.dimension === "2d") this.render2D(surface, data, fit);
    else this.render3D(surface, data, fit);
    this.renderDensityNotice(sourceData.records.size);
    if (this.canvasRenderer === null) this.applyFocus(this.dimension === "2d");
    this.didRender();
  }

  protected didRender(): void {}

  protected currentGraphModel(): NodeGraphModel | null { return this.displayGraphData?.model ?? null; }
  protected currentRelationMode(): NodeGraphRelationMode { return this.relationMode; }
  protected currentDimension(): NodeGraphDimension { return this.dimension; }
  protected currentGraphScope(): NodeGraphScope { return this.graphScope; }
  protected isCanvasGraph(): boolean { return this.canvasRenderer !== null; }
  protected setCanvasSearchQuery(query: string): void { this.canvasRenderer?.setSearchQuery(query); }
  protected setCanvasSelectionFocus(path: string | null): void { this.canvasRenderer?.setFocus(path, false); }
  protected graphSearchRecords(): readonly { readonly label: string; readonly path: string }[] {
    if (this.graphData === null) return [];
    return [...this.graphData.records.values()]
      .filter((record) => this.relationMode !== "structure" || !record.boundary);
  }
  protected onNodeSelected(_path: string): void {}

  private renderToolbar(): HTMLElement {
    const toolbar = this.contentEl.createDiv({ cls: "folder-nodes-node-graph-toolbar" });
    toolbar.createDiv({ cls: "folder-nodes-node-graph-title", text: label("nodeGraph") });
    const relation = toolbar.createDiv({
      cls: "folder-nodes-node-graph-switch",
      attr: { "aria-label": label("relationship"), "data-node-graph-switch": "relation" },
    });
    for (const mode of ["structure", "links", "hybrid"] as const) {
      this.switchButton(relation, relationLabel(mode), this.relationMode === mode, () => {
        if (this.relationMode === mode) return;
        this.relationMode = mode;
        this.render();
      });
    }
    const scope = toolbar.createDiv({
      cls: "folder-nodes-node-graph-scope",
      attr: { "aria-label": label("scope"), "data-node-graph-scope": this.graphScope.mode },
    });
    scope.createSpan({ cls: "folder-nodes-node-graph-scope-path", text: this.scopeLabel() });
    this.scopeButton(scope, label("globalScope"), this.graphScope.mode === "global", () => this.setGraphScope(GLOBAL_NODE_GRAPH_SCOPE));
    this.scopeButton(scope, label("subtreeScope"), this.graphScope.mode === "subtree", () => {
      if (this.focusPath !== null) this.setGraphScope({ mode: "subtree", rootPath: this.focusPath });
    }, this.focusPath === null, "subtree");
    this.scopeButton(scope, label("localScope"), this.graphScope.mode === "local", () => {
      if (this.focusPath !== null) this.setGraphScope({ mode: "local", rootPath: this.focusPath });
    }, this.focusPath === null, "local");
    const dimension = toolbar.createDiv({
      cls: "folder-nodes-node-graph-switch",
      attr: { "aria-label": label("dimension"), "data-node-graph-switch": "dimension" },
    });
    for (const mode of ["2d", "3d"] as const) {
      this.switchButton(dimension, mode.toUpperCase(), this.dimension === mode, () => {
        if (this.dimension === mode) return;
        this.dimension = mode;
        if (mode === "3d") this.camera = defaultNodeGraphCamera();
        this.render();
      });
    }
    const fit = toolbar.createEl("button", {
      cls: "clickable-icon",
      attr: { "aria-label": label("fitGraph"), "data-node-graph-action": "fit" },
    });
    setIcon(fit, "maximize-2");
    return toolbar;
  }

  private switchButton(container: HTMLElement, text: string, active: boolean, onClick: () => void): void {
    const button = container.createEl("button", {
      cls: `folder-nodes-node-graph-switch-button${active ? " is-active" : ""}`,
      text,
      attr: { "aria-pressed": String(active) },
    });
    button.addEventListener("click", onClick);
  }

  private scopeButton(
    container: HTMLElement,
    text: string,
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
    button.addEventListener("click", onClick);
  }

  private updateScopeControls(): void {
    for (const button of this.contentEl.querySelectorAll<HTMLButtonElement>("[data-node-graph-scope-action]")) {
      button.disabled = this.focusPath === null;
    }
  }

  private buildGraphData(): GraphData {
    const settings = this.settings();
    const records = new Map<string, GraphRecord>();
    if (this.graphScope.mode === "local") this.collectLocalRecords(records, settings);
    else {
      for (const rootPath of nodeGraphTraversalRoots(this.graphScope, settings)) {
        const root = rootPath === "" ? this.app.vault.getRoot() : this.service.getFolder(rootPath);
        if (root !== null) this.collectDescendantRecords(records, root, settings, Number.POSITIVE_INFINITY);
      }
    }
    if (this.graphScope.mode === "local" || settings.showBoundaryNodes) this.addLinkNeighborRecords(records, settings);

    return this.graphDataFromRecords(records);
  }

  private graphDataFromRecords(records: ReadonlyMap<string, GraphRecord>): GraphData {
    const sources = [...records.values()].flatMap((record) => record.notePath === null
      ? []
      : [{ nodeId: record.path, notePath: record.notePath }]);
    const notePathToNodeId = new Map(sources.map(({ nodeId, notePath }) => [notePath, nodeId]));
    const links = normalizeNodeGraphLinks(sources, this.app.metadataCache.resolvedLinks, notePathToNodeId);
    const depths = [...records.keys()].map(nodeGraphPathDepth);
    const minimumDepth = depths.length === 0 ? 0 : Math.min(...depths);
    const structureEdges = [...records.values()].flatMap((record) =>
      record.parentPath !== null && records.has(record.parentPath)
        ? [{ source: record.parentPath, target: record.path }]
        : []);
    const model = buildNodeGraphModelFromNodes(
      [...records.keys()].map((id) => ({ id, depth: nodeGraphPathDepth(id) - minimumDepth })),
      structureEdges,
      links,
    );
    const forest = this.buildForest(records);
    return {
      records,
      model,
      layout: layoutNodeGraphForest(forest, { direction: this.settings().layoutDirection }),
      points3D: layoutNodeGraph3D(model),
    };
  }

  private buildDisplayGraphData(source: GraphData): GraphData {
    this.hiddenBranchCount = 0;
    const relationSource = this.relationMode === "structure" && [...source.records.values()].some((record) => record.boundary)
      ? this.graphDataFromRecords(new Map([...source.records].filter(([, record]) => !record.boundary)))
      : source;
    if (this.showAllDensityNodes || relationSource.records.size <= NODE_GRAPH_DENSITY_THRESHOLD) return relationSource;
    const overview = nodeGraphDensityOverview(
      [...relationSource.records.values()].map(({ path, parentPath }) => ({ id: path, parentId: parentPath })),
      this.focusPath,
      new Set<string>(),
      this.graphScope.mode === "global" ? 16 : 12,
      this.graphScope.mode === "global" ? 1 : 2,
      16,
    );
    this.hiddenBranchCount = overview.hiddenBranchCount;
    if (overview.hiddenBranchCount === 0) return relationSource;
    const visibleRecords = new Map([...relationSource.records].filter(([path]) => overview.visibleIds.has(path)));
    return this.graphDataFromRecords(visibleRecords);
  }

  private renderDensityNotice(sourceNodeCount: number): void {
    if (sourceNodeCount <= NODE_GRAPH_DENSITY_THRESHOLD) return;
    const compact = !this.showAllDensityNodes && this.hiddenBranchCount > 0;
    if (!compact && !this.showAllDensityNodes) return;
    const notice = this.contentEl.createDiv({ cls: "folder-nodes-node-graph-density-notice", attr: { role: "status" } });
    notice.createSpan({ text: densityMessage(compact, this.hiddenBranchCount) });
    const button = notice.createEl("button", {
      cls: "folder-nodes-node-graph-density-action",
      text: densityAction(compact),
      attr: { type: "button" },
    });
    button.addEventListener("click", () => {
      this.showAllDensityNodes = compact;
      this.render();
    });
  }

  private collectLocalRecords(records: Map<string, GraphRecord>, settings: NodeGraphSettings): void {
    if (this.graphScope.mode !== "local") return;
    const root = this.service.getFolder(this.graphScope.rootPath);
    if (root === null) return;
    const parent = root.parent;
    if (parent !== null && nodeGraphPathIsConfigured(parent.path, settings)) this.addRecord(records, parent, false);
    this.collectDescendantRecords(records, root, settings, settings.localDepth);
  }

  private collectDescendantRecords(
    records: Map<string, GraphRecord>,
    root: TFolder,
    settings: NodeGraphSettings,
    maximumDepth: number,
  ): void {
    const pending: Array<{ readonly depth: number; readonly folder: TFolder }> = [{ depth: 0, folder: root }];
    while (pending.length > 0) {
      const current = pending.pop();
      if (current === undefined) break;
      const { depth, folder } = current;
      const path = normalizeVaultPath(folder.path);
      if (nodeGraphSubtreeIsExcluded(path, settings)) continue;
      if (nodeGraphPathIsConfigured(path, settings)) this.addRecord(records, folder, false);
      if (depth >= maximumDepth) continue;
      const children = this.service.children(path)
        .flatMap(({ childPath }) => {
          const child = this.service.getFolder(childPath);
          return child === null ? [] : [child];
        })
        .sort((left, right) => left.path.localeCompare(right.path, "en"));
      for (let index = children.length - 1; index >= 0; index -= 1) {
        const child = children[index];
        if (child !== undefined) pending.push({ depth: depth + 1, folder: child });
      }
    }
  }

  private addLinkNeighborRecords(records: Map<string, GraphRecord>, settings: NodeGraphSettings): void {
    const seedNotePaths = new Set([...records.values()].flatMap(({ notePath }) => notePath === null ? [] : [notePath]));
    if (seedNotePaths.size === 0) return;
    const neighborNotePaths = new Set<string>();
    for (const seed of seedNotePaths) {
      for (const target of Object.keys(this.app.metadataCache.resolvedLinks[seed] ?? {})) neighborNotePaths.add(target);
    }
    for (const seed of seedNotePaths) {
      for (const source of this.options.getInboundSources?.(seed) ?? []) neighborNotePaths.add(source);
    }
    for (const notePath of neighborNotePaths) {
      const entry = this.app.vault.getAbstractFileByPath(notePath);
      if (!(entry instanceof TFile)) continue;
      const folder = this.service.folderForFile?.(entry) ?? entry.parent;
      if (folder === null || !nodeGraphPathIsConfigured(folder.path, settings)) continue;
      const canonical = this.service.isCanonicalFile?.(entry)
        ?? this.service.getCanonicalFile(folder.path)?.path === entry.path;
      if (!canonical) continue;
      this.addRecord(records, folder, true);
    }
  }

  private addRecord(records: Map<string, GraphRecord>, folder: TFolder, boundary: boolean): void {
    const path = normalizeVaultPath(folder.path);
    const previous = records.get(path);
    const note = this.service.getCanonicalFile(path);
    records.set(path, {
      path,
      label: path === "" ? this.app.vault.getName() : folder.name,
      boundary: previous?.boundary === false ? false : boundary,
      notePath: note?.path ?? null,
      parentPath: nodeGraphParentPath(path),
      visual: this.visuals.resolve(folder),
    });
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
    for (const tree of trees.values()) tree.children.sort((left, right) => left.id.localeCompare(right.id, "en"));
    return roots.sort((left, right) => left.id.localeCompare(right.id, "en"));
  }

  private settings(): NodeGraphSettings {
    return this.options.getSettings?.() ?? DEFAULT_NODE_GRAPH_SETTINGS;
  }

  private scopeLabel(): string {
    if (this.graphScope.mode === "global") return label("allNodes");
    return `${this.graphScope.mode === "subtree" ? label("subtreeScope") : label("localScope")} · ${this.graphScope.rootPath}`;
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
    for (const edge of edgesForMode(data.model, this.relationMode)) {
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
      node.style.width = `${layout.nodeWidth}px`;
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
    for (const edge of edgesForMode(data.model, this.relationMode)) {
      const source = this.projected3D.get(edge.source);
      const target = this.projected3D.get(edge.target);
      if (source === undefined || target === undefined) continue;
      this.renderRelationEdge(this.threeDSvg, edge, source.x, source.y, target.x, target.y);
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
      this.relationMode,
      this.focusPath,
      {
        label: (key) => label(key),
        onOpen: (path, newLeaf) => void this.service.openFolderNode(path, newLeaf),
        onSelect: (path) => {
          this.focusPath = path;
          this.updateScopeControls();
          this.onNodeSelected(path);
        },
        overviewEdgeLimit: this.settings().overviewEdgeLimit,
        relationSummary,
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
    sourceX: number,
    sourceY: number,
    targetX: number,
    targetY: number,
  ): void {
    if (this.relationMode !== "links" && edge.structure) {
      this.path(svg, edge.source, edge.target, straightEdgePath(sourceX, sourceY, targetX, targetY), "is-structure", 0);
    }
    if (this.relationMode !== "structure" && edge.link) {
      const offset = this.relationMode === "hybrid" && edge.structure ? 4 : 0;
      const shifted = offsetLine(sourceX, sourceY, targetX, targetY, offset);
      this.path(
        svg,
        edge.source,
        edge.target,
        linkedEdgePath(shifted.sourceX, shifted.sourceY, shifted.targetX, shifted.targetY),
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
    const sourceX = source.x + layout.nodeWidth / 2;
    const sourceY = source.y + layout.nodeHeight / 2;
    const targetX = target.x + layout.nodeWidth / 2;
    const targetY = target.y + layout.nodeHeight / 2;
    if (this.relationMode !== "links" && edge.structure) {
      this.path(
        svg,
        edge.source,
        edge.target,
        hierarchyEdgePath(sourceX, sourceY, targetX, targetY, layout),
        "is-structure",
        0,
      );
    }
    if (this.relationMode !== "structure" && edge.link) {
      const offset = this.relationMode === "hybrid" && edge.structure ? 7 : 0;
      const shifted = offsetLine(sourceX, sourceY, targetX, targetY, offset);
      this.path(
        svg,
        edge.source,
        edge.target,
        linkedEdgePath(shifted.sourceX, shifted.sourceY, shifted.targetX, shifted.targetY),
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

  private createNode(canvas: HTMLElement, record: GraphRecord): HTMLButtonElement {
    const title = record.path === "" ? this.app.vault.getName() : record.path;
    const accessibleTitle = record.boundary ? `${title}\n${label("boundaryNode")}` : title;
    const node = canvas.createEl("button", {
      cls: `folder-nodes-node-graph-node${record.boundary ? " is-boundary" : ""}`,
      attr: { "aria-label": accessibleTitle, "data-node-path": record.path, title: accessibleTitle },
    });
    const visual = record.visual;
    if (visual.kind !== "fallback") {
      const icon = node.createSpan({ cls: "folder-nodes-node-graph-icon" });
      renderVisual(icon, visual, record.label);
    }
    node.createSpan({ cls: "folder-nodes-node-graph-label", text: record.label });
    node.addEventListener("click", () => {
      this.focusPath = record.path;
      this.applyFocus(false);
      this.updateScopeControls();
      this.onNodeSelected(record.path);
    });
    node.addEventListener("dblclick", (event) => {
      void this.service.openFolderNode(record.path, event.ctrlKey || event.metaKey);
    });
    node.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      if (event.repeat) return;
      void this.service.openFolderNode(record.path, event.ctrlKey || event.metaKey);
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
      const shifted = offsetLine(source.x, source.y, target.x, target.y, Number.isFinite(offset) ? offset : 0);
      edgeElement.setAttribute("d", edgeElement.classList.contains("is-link")
        ? linkedEdgePath(shifted.sourceX, shifted.sourceY, shifted.targetX, shifted.targetY)
        : straightEdgePath(shifted.sourceX, shifted.sourceY, shifted.targetX, shifted.targetY));
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
    const scale = Math.max(NODE_GRAPH_DOM_MIN_SCALE, Math.min(1.2, point.scale));
    node.style.left = `${point.x}px`;
    node.style.top = `${point.y}px`;
    node.style.zIndex = String(Math.max(1, Math.round(point.scale * 1000)));
    node.style.transform = `translate(-50%, -50%) scale(${scale})`;
    node.removeClass("is-depth-near", "is-depth-mid", "is-depth-far");
    node.addClass(scale >= 1.02 ? "is-depth-near" : scale >= 0.82 ? "is-depth-mid" : "is-depth-far");
  }

  private applyFocus(scrollIntoView: boolean): void {
    for (const [path, element] of this.nodeElements) element.toggleClass("is-focused", path === this.focusPath);
    if (!scrollIntoView || this.focusPath === null) return;
    this.nodeElements.get(this.focusPath)?.scrollIntoView({ block: "center", inline: "center" });
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
    const fit = fitNodeGraphViewport(width, height, surface.clientWidth, surface.clientHeight);
    stage.style.width = `${fit.stageWidth}px`;
    stage.style.height = `${fit.stageHeight}px`;
    canvas.style.left = `${fit.offsetX}px`;
    canvas.style.top = `${fit.offsetY}px`;
    canvas.style.transform = `scale(${fit.scale})`;
    surface.scrollTo({ left: 0, top: 0, behavior: "smooth" });
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

function relationLabel(mode: NodeGraphRelationMode): string {
  const zh = resolvedLanguage() === "zh-CN";
  if (mode === "structure") return zh ? "结构" : "Structure";
  if (mode === "links") return zh ? "链接" : "Links";
  return zh ? "混合" : "Hybrid";
}

function relationSummary(structure: number, links: number): string {
  return resolvedLanguage() === "zh-CN"
    ? `结构 ${structure} · 链接 ${links}`
    : `Structure ${structure} · Links ${links}`;
}

function densityMessage(compact: boolean, hiddenBranchCount: number): string {
  const zh = resolvedLanguage() === "zh-CN";
  if (!compact) return zh ? "当前显示全部节点" : "Showing all nodes";
  return zh
    ? `大型图谱已保持可读比例，收起 ${hiddenBranchCount} 个分支`
    : `Large graph kept readable with ${hiddenBranchCount} branches collapsed`;
}

function densityAction(compact: boolean): string {
  const zh = resolvedLanguage() === "zh-CN";
  if (compact) return zh ? "显示全部" : "Show all";
  return zh ? "恢复精简" : "Restore overview";
}

function label(
  key: "allNodes" | "boundaryNode" | "denseEdges" | "dimension" | "disabledGraph" | "fitGraph" | "globalScope" | "largeGraph" | "localScope" | "nodeGraph" | "readableFit" | "relationship" | "scope" | "subtreeScope",
): string {
  const zh = resolvedLanguage() === "zh-CN";
  if (key === "nodeGraph") return zh ? "节点图谱" : "Node Graph";
  if (key === "disabledGraph") return zh ? "节点图谱已在 Folder Nodes 设置中关闭。" : "Node Graph is disabled in Folder Nodes settings.";
  if (key === "boundaryNode") return zh ? "范围外的链接边界节点" : "Linked boundary node outside the selected scope";
  if (key === "allNodes") return zh ? "全部节点" : "All nodes";
  if (key === "globalScope") return zh ? "全局" : "Global";
  if (key === "subtreeScope") return zh ? "子树" : "Subtree";
  if (key === "localScope") return zh ? "局部" : "Local";
  if (key === "scope") return zh ? "图谱范围" : "Graph scope";
  if (key === "largeGraph") return zh ? "大型节点图谱；拖动平移或旋转，滚轮缩放，回车打开所选节点" : "Large Node Graph; drag to pan or rotate, wheel to zoom, Enter to open the selected node";
  if (key === "denseEdges") return zh ? "稠密关系概览 · 聚焦节点以显示其全部关系" : "Dense relation overview · focus a node to show all of its relations";
  if (key === "readableFit") return zh ? "图谱过大，已保持可读比例并聚焦当前节点" : "Graph is too large to fit legibly; keeping a readable scale around the focused node";
  if (key === "fitGraph") return zh ? "适应视图" : "Fit graph";
  if (key === "relationship") return zh ? "关系模式" : "Relationship mode";
  return zh ? "维度" : "Dimension";
}

function straightEdgePath(sourceX: number, sourceY: number, targetX: number, targetY: number): string {
  return `M ${sourceX} ${sourceY} L ${targetX} ${targetY}`;
}

function hierarchyEdgePath(
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
  layout: NodeGraphLayout,
): string {
  if (layout.direction === "left-to-right") {
    const startX = sourceX + layout.nodeWidth / 2;
    const endX = targetX - layout.nodeWidth / 2;
    const middleX = (startX + endX) / 2;
    return `M ${startX} ${sourceY} C ${middleX} ${sourceY}, ${middleX} ${targetY}, ${endX} ${targetY}`;
  }
  const startY = sourceY + layout.nodeHeight / 2;
  const endY = targetY - layout.nodeHeight / 2;
  const middleY = (startY + endY) / 2;
  return `M ${sourceX} ${startY} C ${sourceX} ${middleY}, ${targetX} ${middleY}, ${targetX} ${endY}`;
}

function linkedEdgePath(sourceX: number, sourceY: number, targetX: number, targetY: number): string {
  const dx = targetX - sourceX;
  const dy = targetY - sourceY;
  const length = Math.hypot(dx, dy) || 1;
  const bend = Math.min(96, Math.max(24, length * 0.14));
  const controlX = (sourceX + targetX) / 2 - dy / length * bend;
  const controlY = (sourceY + targetY) / 2 + dx / length * bend;
  return `M ${sourceX} ${sourceY} Q ${controlX} ${controlY}, ${targetX} ${targetY}`;
}

function offsetLine(sourceX: number, sourceY: number, targetX: number, targetY: number, offset: number): {
  readonly sourceX: number;
  readonly sourceY: number;
  readonly targetX: number;
  readonly targetY: number;
} {
  if (offset === 0) return { sourceX, sourceY, targetX, targetY };
  const dx = targetX - sourceX;
  const dy = targetY - sourceY;
  const length = Math.hypot(dx, dy) || 1;
  const offsetX = -dy / length * offset;
  const offsetY = dx / length * offset;
  return {
    sourceX: sourceX + offsetX,
    sourceY: sourceY + offsetY,
    targetX: targetX + offsetX,
    targetY: targetY + offsetY,
  };
}
