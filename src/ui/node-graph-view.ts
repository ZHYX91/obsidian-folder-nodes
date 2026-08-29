import { ItemView, setIcon, TFile, TFolder, WorkspaceLeaf } from "obsidian";

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
import { normalizeNodeGraphLinks } from "../core/node-graph-links";
import { fitNodeGraphViewport, layoutNodeGraph, type NodeGraphLayout, type NodeGraphTree } from "../core/node-graph-layout";
import { buildNodeGraphModel, edgesForMode, type NodeGraphModel, type NodeGraphModelEdge, type NodeGraphRelationMode } from "../core/node-graph-model";
import { normalizeVaultPath } from "../core/paths";
import type { NodeVisual } from "../core/types";
import { renderVisual } from "../presentation/render-visual";
import { resolvedLanguage } from "./i18n";
import {
  NodeGraphCanvasRenderer,
  type NodeGraphCanvasRecord,
} from "./node-graph-canvas-renderer";

interface NodeGraphService {
  getFolder(path: string): TFolder | null;
  getCanonicalFile(folderPath: string): TFile | null;
  children(path: string): readonly { readonly childPath: string }[];
  openFolderNode(path: string, newLeaf?: boolean): Promise<void>;
}

interface NodeGraphVisuals {
  resolve(folder: TFolder): NodeVisual;
}

interface GraphRecord extends NodeGraphCanvasRecord {
  readonly notePath: string | null;
}

interface GraphData {
  readonly layout: NodeGraphLayout;
  readonly tree: NodeGraphTree;
  readonly records: ReadonlyMap<string, GraphRecord>;
  readonly model: NodeGraphModel;
  readonly points3D: readonly NodeGraphPoint3D[];
}

type NodeGraphDimension = "2d" | "3d";

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

export class FolderNodeGraphView extends ItemView {
  private focusPath: string | null = null;
  private relationMode: NodeGraphRelationMode = "structure";
  private dimension: NodeGraphDimension = "2d";
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
  private refreshGeneration = 0;
  private refreshTimer: number | null = null;

  public constructor(
    leaf: WorkspaceLeaf,
    private readonly service: NodeGraphService,
    private readonly visuals: NodeGraphVisuals,
  ) {
    super(leaf);
  }

  public override getViewType(): string { return NODE_GRAPH_VIEW_TYPE; }
  public override getDisplayText(): string { return label("nodeGraph"); }
  public override getIcon(): string { return "git-fork"; }
  public override async onOpen(): Promise<void> { this.render(); }
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
    if (this.canvasRenderer !== null) this.canvasRenderer.setFocus(this.focusPath, true);
    else if (this.dimension === "3d" && this.focusPath !== null) this.center3DOnFocus();
    else this.applyFocus(true);
  }

  public refresh(): void {
    const generation = ++this.refreshGeneration;
    const ownerWindow = this.contentEl.ownerDocument.defaultView ?? window;
    if (this.refreshTimer !== null) ownerWindow.clearTimeout(this.refreshTimer);
    this.refreshTimer = ownerWindow.setTimeout(() => {
      this.refreshTimer = null;
      if (generation !== this.refreshGeneration) return;
      this.graphData = null;
      this.render();
    }, 50);
  }

  private render(): void {
    this.canvasRenderer?.destroy();
    this.canvasRenderer = null;
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

    const data = this.graphData ?? this.buildGraphData(this.app.vault.getRoot());
    this.graphData = data;
    const toolbar = this.renderToolbar();
    const fit = toolbar.querySelector<HTMLButtonElement>("[data-node-graph-action='fit']");
    const surface = this.contentEl.createDiv({ cls: "folder-nodes-node-graph-scroll" });
    if (shouldUseNodeGraphCanvas(data.model.nodes.length)) this.renderCanvas(surface, data, fit);
    else if (this.dimension === "2d") this.render2D(surface, data, fit);
    else this.render3D(surface, data, fit);
    if (this.canvasRenderer === null) this.applyFocus(this.dimension === "2d");
    this.didRender();
  }

  protected didRender(): void {}

  protected currentGraphModel(): NodeGraphModel | null { return this.graphData?.model ?? null; }
  protected currentRelationMode(): NodeGraphRelationMode { return this.relationMode; }
  protected currentDimension(): NodeGraphDimension { return this.dimension; }
  protected isCanvasGraph(): boolean { return this.canvasRenderer !== null; }
  protected setCanvasSearchQuery(query: string): void { this.canvasRenderer?.setSearchQuery(query); }
  protected graphSearchRecords(): readonly { readonly label: string; readonly path: string }[] {
    return this.graphData === null ? [] : [...this.graphData.records.values()];
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

  private buildGraphData(root: TFolder): GraphData {
    const records = new Map<string, GraphRecord>();
    type MutableTree = { readonly id: string; readonly children: MutableTree[] };
    const tree: MutableTree = { id: normalizeVaultPath(root.path), children: [] };
    const pending: Array<{ readonly folder: TFolder; readonly tree: MutableTree }> = [{ folder: root, tree }];
    while (pending.length > 0) {
      const current = pending.pop();
      if (current === undefined) break;
      const { folder, tree: currentTree } = current;
      const path = normalizeVaultPath(folder.path);
      const note = this.service.getCanonicalFile(path);
      records.set(path, {
        path,
        label: path === "" ? this.app.vault.getName() : folder.name,
        notePath: note?.path ?? null,
        visual: this.visuals.resolve(folder),
      });
      const children = this.service.children(path)
        .flatMap(({ childPath }) => {
          const child = this.service.getFolder(childPath);
          return child === null ? [] : [child];
        })
        .sort((left, right) => left.path.localeCompare(right.path, "en"));
      for (const child of children) currentTree.children.push({ id: normalizeVaultPath(child.path), children: [] });
      for (let index = children.length - 1; index >= 0; index -= 1) {
        const child = children[index];
        const childTree = currentTree.children[index];
        if (child !== undefined && childTree !== undefined) pending.push({ folder: child, tree: childTree });
      }
    }
    const sources = [...records.values()].flatMap((record) => record.notePath === null
      ? []
      : [{ nodeId: record.path, notePath: record.notePath }]);
    const notePathToNodeId = new Map(sources.map(({ nodeId, notePath }) => [notePath, nodeId]));
    const links = normalizeNodeGraphLinks(sources, this.app.metadataCache.resolvedLinks, notePathToNodeId);
    const model = buildNodeGraphModel(tree, links);
    return {
      tree,
      records,
      model,
      layout: layoutNodeGraph(tree),
      points3D: layoutNodeGraph3D(model),
    };
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
      this.renderRelationEdge(
        svg,
        edge,
        source.x + layout.nodeWidth / 2,
        source.y + layout.nodeHeight / 2,
        target.x + layout.nodeWidth / 2,
        target.y + layout.nodeHeight / 2,
      );
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
          this.onNodeSelected(path);
        },
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
      this.line(svg, edge.source, edge.target, sourceX, sourceY, targetX, targetY, "is-structure", 0);
    }
    if (this.relationMode !== "structure" && edge.link) {
      const offset = this.relationMode === "hybrid" && edge.structure ? 4 : 0;
      const shifted = offsetLine(sourceX, sourceY, targetX, targetY, offset);
      this.line(svg, edge.source, edge.target, shifted.sourceX, shifted.sourceY, shifted.targetX, shifted.targetY, "is-link", offset);
    }
  }

  private line(
    svg: SVGSVGElement,
    source: string,
    target: string,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    kind: "is-link" | "is-structure",
    offset: number,
  ): void {
    svg.createSvg("line", {
      cls: kind,
      attr: {
        x1: String(x1), y1: String(y1), x2: String(x2), y2: String(y2),
        "data-edge-source": source,
        "data-edge-target": target,
        "data-edge-offset": String(offset),
      },
    });
  }

  private createNode(canvas: HTMLElement, record: GraphRecord): HTMLButtonElement {
    const node = canvas.createEl("button", {
      cls: "folder-nodes-node-graph-node",
      attr: { "data-node-path": record.path, title: record.path === "" ? this.app.vault.getName() : record.path },
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
    for (const line of this.threeDSvg.querySelectorAll<SVGLineElement>("line[data-edge-source][data-edge-target]")) {
      const sourceId = line.dataset.edgeSource;
      const targetId = line.dataset.edgeTarget;
      if (sourceId === undefined || targetId === undefined) continue;
      const source = this.projected3D.get(sourceId);
      const target = this.projected3D.get(targetId);
      if (source === undefined || target === undefined) continue;
      const offset = Number(line.dataset.edgeOffset ?? 0);
      const shifted = offsetLine(source.x, source.y, target.x, target.y, Number.isFinite(offset) ? offset : 0);
      line.setAttribute("x1", String(shifted.sourceX));
      line.setAttribute("y1", String(shifted.sourceY));
      line.setAttribute("x2", String(shifted.targetX));
      line.setAttribute("y2", String(shifted.targetY));
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
    const scale = Math.max(0.65, Math.min(1.2, point.scale));
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

function label(key: "dimension" | "fitGraph" | "largeGraph" | "nodeGraph" | "relationship"): string {
  const zh = resolvedLanguage() === "zh-CN";
  if (key === "nodeGraph") return zh ? "节点图谱" : "Node Graph";
  if (key === "largeGraph") return zh ? "大型节点图谱；拖动平移或旋转，滚轮缩放，回车打开所选节点" : "Large Node Graph; drag to pan or rotate, wheel to zoom, Enter to open the selected node";
  if (key === "fitGraph") return zh ? "适应视图" : "Fit graph";
  if (key === "relationship") return zh ? "关系模式" : "Relationship mode";
  return zh ? "维度" : "Dimension";
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
