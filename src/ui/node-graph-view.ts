import { ItemView, setIcon, TFile, TFolder, WorkspaceLeaf } from "obsidian";

import {
  defaultNodeGraphCamera,
  layoutNodeGraph3D,
  panNodeGraphCamera,
  projectNodeGraph3D,
  rotateNodeGraphCamera,
  zoomNodeGraphCamera,
  type NodeGraphCamera,
  type NodeGraphPoint3D,
  type NodeGraphProjectedPoint,
} from "../core/node-graph-3d";
import { normalizeNodeGraphLinks } from "../core/node-graph-links";
import { fitNodeGraphViewport, layoutNodeGraph, type NodeGraphTree } from "../core/node-graph-layout";
import { buildNodeGraphModel, edgesForMode, type NodeGraphModel, type NodeGraphModelEdge, type NodeGraphRelationMode } from "../core/node-graph-model";
import { normalizeVaultPath } from "../core/paths";
import type { NodeVisual } from "../core/types";
import { renderVisual } from "../presentation/render-visual";
import { resolvedLanguage } from "./i18n";

interface NodeGraphService {
  getFolder(path: string): TFolder | null;
  getCanonicalFile(folderPath: string): TFile | null;
  children(path: string): readonly { readonly childPath: string }[];
  openFolderNode(path: string, newLeaf?: boolean): Promise<void>;
}

interface NodeGraphVisuals {
  resolve(folder: TFolder): NodeVisual;
}

interface GraphRecord {
  readonly path: string;
  readonly label: string;
  readonly folder: TFolder;
  readonly note: TFile | null;
}

interface GraphData {
  readonly tree: NodeGraphTree;
  readonly records: ReadonlyMap<string, GraphRecord>;
  readonly model: NodeGraphModel;
}

type NodeGraphDimension = "2d" | "3d";

type GraphDrag = {
  readonly pointerId: number;
  readonly pan: boolean;
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
  private readonly nodeElements = new Map<string, HTMLElement>();
  private projected3D = new Map<string, NodeGraphProjectedPoint>();
  private threeDPoints: readonly NodeGraphPoint3D[] = [];
  private threeDSvg: SVGSVGElement | null = null;
  private threeDViewport: { width: number; height: number } | null = null;

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
  public override async onClose(): Promise<void> {
    this.nodeElements.clear();
    this.projected3D.clear();
    this.threeDPoints = [];
    this.threeDSvg = null;
    this.drag = null;
  }

  public setFocus(path: string | null): void {
    this.focusPath = path === null ? null : normalizeVaultPath(path);
    if (this.dimension === "3d" && this.focusPath !== null) this.center3DOnFocus();
    else this.applyFocus(true);
  }

  public refresh(): void { this.render(); }

  private render(): void {
    this.nodeElements.clear();
    this.projected3D.clear();
    this.threeDPoints = [];
    this.threeDSvg = null;
    this.drag = null;
    this.contentEl.empty();
    this.contentEl.addClass("folder-nodes-node-graph-view");
    this.contentEl.toggleClass("is-3d", this.dimension === "3d");

    const data = this.buildGraphData(this.app.vault.getRoot());
    const toolbar = this.renderToolbar();
    const fit = toolbar.querySelector<HTMLButtonElement>("[data-node-graph-action='fit']");
    const surface = this.contentEl.createDiv({ cls: "folder-nodes-node-graph-scroll" });
    if (this.dimension === "2d") this.render2D(surface, data, fit);
    else this.render3D(surface, data, fit);
    this.applyFocus(this.dimension === "2d");
  }

  private renderToolbar(): HTMLElement {
    const toolbar = this.contentEl.createDiv({ cls: "folder-nodes-node-graph-toolbar" });
    toolbar.createDiv({ cls: "folder-nodes-node-graph-title", text: label("nodeGraph") });
    const relation = toolbar.createDiv({ cls: "folder-nodes-node-graph-switch", attr: { "aria-label": label("relationship") } });
    for (const mode of ["structure", "links", "hybrid"] as const) {
      this.switchButton(relation, relationLabel(mode), this.relationMode === mode, () => {
        if (this.relationMode === mode) return;
        this.relationMode = mode;
        this.render();
      });
    }
    const dimension = toolbar.createDiv({ cls: "folder-nodes-node-graph-switch", attr: { "aria-label": label("dimension") } });
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
    const build = (folder: TFolder): NodeGraphTree => {
      const path = normalizeVaultPath(folder.path);
      records.set(path, {
        path,
        label: path === "" ? this.app.vault.getName() : folder.name,
        folder,
        note: this.service.getCanonicalFile(path),
      });
      return {
        id: path,
        children: this.service.children(path).flatMap(({ childPath }) => {
          const child = this.service.getFolder(childPath);
          return child === null ? [] : [build(child)];
        }),
      };
    };
    const tree = build(root);
    const sources = [...records.values()].flatMap((record) => record.note === null ? [] : [{ nodeId: record.path, notePath: record.note.path }]);
    const notePathToNodeId = new Map(sources.map(({ nodeId, notePath }) => [notePath, nodeId]));
    const links = normalizeNodeGraphLinks(sources, this.app.metadataCache.resolvedLinks, notePathToNodeId);
    return { tree, records, model: buildNodeGraphModel(tree, links) };
  }

  private render2D(surface: HTMLElement, data: GraphData, fit: HTMLButtonElement | null): void {
    const layout = layoutNodeGraph(data.tree);
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
    this.threeDPoints = layoutNodeGraph3D(data.model);
    const canvas = surface.createDiv({ cls: "folder-nodes-node-graph-canvas folder-nodes-node-graph-canvas-3d" });
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
      this.camera = defaultNodeGraphCamera();
      this.update3DProjection();
    });
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
    const visual = this.visuals.resolve(record.folder);
    if (visual.kind !== "fallback") {
      const icon = node.createSpan({ cls: "folder-nodes-node-graph-icon" });
      renderVisual(icon, visual, record.label);
    }
    node.createSpan({ cls: "folder-nodes-node-graph-label", text: record.label });
    node.addEventListener("click", () => {
      this.focusPath = record.path;
      this.applyFocus(false);
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
      if (target?.closest(".folder-nodes-node-graph-node") !== null) return;
      this.drag = { pointerId: event.pointerId, pan: event.shiftKey || event.button === 1, x: event.clientX, y: event.clientY };
      surface.setPointerCapture?.(event.pointerId);
      surface.addClass("is-dragging");
    });
    surface.addEventListener("pointermove", (event) => {
      if (this.drag === null || event.pointerId !== this.drag.pointerId) return;
      const deltaX = event.clientX - this.drag.x;
      const deltaY = event.clientY - this.drag.y;
      this.drag.x = event.clientX;
      this.drag.y = event.clientY;
      this.camera = this.drag.pan
        ? panNodeGraphCamera(this.camera, deltaX, deltaY)
        : rotateNodeGraphCamera(this.camera, deltaX, deltaY);
      this.update3DProjection();
    });
    const finish = (event: PointerEvent): void => {
      if (this.drag === null || event.pointerId !== this.drag.pointerId) return;
      this.drag = null;
      surface.removeClass("is-dragging");
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

  private position3DNode(node: HTMLElement, point: NodeGraphProjectedPoint): void {
    node.style.left = `${point.x}px`;
    node.style.top = `${point.y}px`;
    node.style.zIndex = String(Math.max(1, Math.round(point.scale * 1000)));
    node.style.transform = `translate(-50%, -50%) scale(${Math.max(0.65, Math.min(1.2, point.scale))})`;
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

function relationLabel(mode: NodeGraphRelationMode): string {
  const zh = resolvedLanguage() === "zh-CN";
  if (mode === "structure") return zh ? "结构" : "Structure";
  if (mode === "links") return zh ? "链接" : "Links";
  return zh ? "混合" : "Hybrid";
}

function label(key: "dimension" | "fitGraph" | "nodeGraph" | "relationship"): string {
  const zh = resolvedLanguage() === "zh-CN";
  if (key === "nodeGraph") return zh ? "节点图谱" : "Node Graph";
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
