import {
  fitNodeGraphCanvasCamera,
  hitTestNodeGraphCanvas,
  panNodeGraphCanvasCamera,
  pointIsVisible,
  zoomNodeGraphCanvasCamera,
  type NodeGraphCanvasCamera,
  type NodeGraphCanvasPoint,
} from "../core/node-graph-canvas";
import {
  defaultNodeGraphCamera,
  fitNodeGraphCamera,
  panNodeGraphCamera,
  projectNodeGraph3D,
  rotateNodeGraphCamera,
  zoomNodeGraphCamera,
  type NodeGraphCamera,
  type NodeGraphPoint3D,
} from "../core/node-graph-3d";
import type { NodeGraphLayout } from "../core/node-graph-layout";
import {
  edgesForMode,
  type NodeGraphModel,
  type NodeGraphModelEdge,
  type NodeGraphRelationMode,
} from "../core/node-graph-model";
import type { NodeVisual } from "../core/types";
import { renderVisual } from "../presentation/render-visual";

export type NodeGraphCanvasDimension = "2d" | "3d";

export interface NodeGraphCanvasRecord {
  readonly label: string;
  readonly path: string;
  readonly visual: NodeVisual;
}

export interface NodeGraphCanvasData {
  readonly layout: NodeGraphLayout;
  readonly model: NodeGraphModel;
  readonly points3D: readonly NodeGraphPoint3D[];
  readonly records: ReadonlyMap<string, NodeGraphCanvasRecord>;
}

interface NodeGraphCanvasCallbacks {
  readonly label: (key: "largeGraph" | "nodeGraph") => string;
  readonly onOpen: (path: string, newLeaf: boolean) => void;
  readonly onSelect: (path: string) => void;
  readonly relationSummary: (structure: number, links: number) => string;
}

interface CanvasDrag {
  readonly pan: boolean;
  readonly pointerId: number;
  moved: boolean;
  x: number;
  y: number;
}

interface CanvasPointer {
  readonly pointerType: string;
  x: number;
  y: number;
}

interface CanvasPalette {
  readonly accent: string;
  readonly background: string;
  readonly border: string;
  readonly link: string;
  readonly mutedText: string;
  readonly node: string;
  readonly nodeHover: string;
  readonly text: string;
}

const NODE_WIDTH = 180;
const NODE_HEIGHT = 46;
const NODE_HALF_WIDTH = NODE_WIDTH / 2;
const NODE_HALF_HEIGHT = NODE_HEIGHT / 2;

export class NodeGraphCanvasRenderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly context: CanvasRenderingContext2D | null;
  private readonly focusOverlay: HTMLButtonElement;
  private readonly edges: readonly NodeGraphModelEdge[];
  private readonly tooltip: HTMLElement;
  private readonly layoutPositions: ReadonlyMap<string, { readonly x: number; readonly y: number }>;
  private readonly pointers = new Map<number, CanvasPointer>();
  private readonly projectedById = new Map<string, NodeGraphCanvasPoint>();
  private camera2D: NodeGraphCanvasCamera = { panX: 0, panY: 0, zoom: 1 };
  private camera3D: NodeGraphCamera = defaultNodeGraphCamera();
  private destroyed = false;
  private drag: CanvasDrag | null = null;
  private frameId: number | null = null;
  private frameUsesTimeout = false;
  private focusPath: string | null;
  private height = 1;
  private hoveredPath: string | null = null;
  private neighbors = new Set<string>();
  private overlayPath: string | null = null;
  private palette: CanvasPalette;
  private relationCounts = new Map<string, { readonly links: number; readonly structure: number }>();
  private searchMatches = new Set<string>();
  private visiblePoints: readonly NodeGraphCanvasPoint[] = [];
  private width = 1;

  public constructor(
    private readonly surface: HTMLElement,
    private readonly data: NodeGraphCanvasData,
    private readonly dimension: NodeGraphCanvasDimension,
    private readonly relationMode: NodeGraphRelationMode,
    focusPath: string | null,
    private readonly callbacks: NodeGraphCanvasCallbacks,
  ) {
    this.focusPath = focusPath;
    this.edges = edgesForMode(data.model, relationMode);
    this.layoutPositions = new Map(data.layout.nodes.map((node) => [
      node.id,
      { x: node.x + data.layout.nodeWidth / 2, y: node.y + data.layout.nodeHeight / 2 },
    ]));
    this.surface.addClass("folder-nodes-node-graph-canvas-surface");
    this.canvas = surface.createEl("canvas", {
      cls: "folder-nodes-node-graph-render-canvas",
      attr: { role: "application", tabindex: "0", "aria-label": callbacks.label("largeGraph") },
    });
    this.context = this.canvas.getContext("2d");
    this.focusOverlay = surface.createEl("button", {
      cls: "folder-nodes-node-graph-focus-overlay",
      attr: { type: "button" },
    });
    this.tooltip = surface.createDiv({ cls: "folder-nodes-node-graph-canvas-tooltip" });
    this.tooltip.hidden = true;
    this.focusOverlay.hidden = true;
    this.palette = this.readPalette();
    this.updateDerivedState();
    this.bindEvents();
    this.resize(true);
  }

  public destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.cancelFrame();
    this.unbindEvents();
    this.pointers.clear();
    this.drag = null;
    this.visiblePoints = [];
    this.projectedById.clear();
    this.searchMatches.clear();
    this.neighbors.clear();
    this.relationCounts.clear();
    this.canvas.remove();
    this.focusOverlay.remove();
    this.tooltip.remove();
    this.surface.removeClass("folder-nodes-node-graph-canvas-surface", "is-dragging");
  }

  public fit(): void {
    if (this.dimension === "2d") {
      this.camera2D = fitNodeGraphCanvasCamera(
        { width: this.data.layout.width, height: this.data.layout.height },
        { width: this.width, height: this.height },
      );
    } else {
      this.camera3D = fitNodeGraphCamera(this.data.points3D, this.camera3D, this.width, this.height);
    }
    this.scheduleDraw();
  }

  public resize(fit = false): void {
    if (this.destroyed) return;
    const bounds = this.surface.getBoundingClientRect();
    const width = Math.max(1, Math.round(this.surface.clientWidth || bounds.width || 800));
    const height = Math.max(1, Math.round(this.surface.clientHeight || bounds.height || 600));
    if (width === this.width && height === this.height && !fit) return;
    this.width = width;
    this.height = height;
    const ratio = Math.min(2, Math.max(1, this.surface.ownerDocument.defaultView?.devicePixelRatio ?? 1));
    this.canvas.width = Math.max(1, Math.round(width * ratio));
    this.canvas.height = Math.max(1, Math.round(height * ratio));
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.context?.setTransform(ratio, 0, 0, ratio, 0, 0);
    this.palette = this.readPalette();
    if (fit) this.fit();
    else this.scheduleDraw();
  }

  public setFocus(path: string | null, center: boolean): void {
    this.focusPath = path;
    this.updateDerivedState();
    if (center && path !== null) this.centerOn(path);
    this.scheduleDraw();
  }

  public setSearchQuery(rawQuery: string): void {
    const query = rawQuery.trim().toLocaleLowerCase();
    this.searchMatches.clear();
    if (query !== "") {
      for (const record of this.data.records.values()) {
        if (`${record.label}\n${record.path}`.toLocaleLowerCase().includes(query)) this.searchMatches.add(record.path);
      }
    }
    this.scheduleDraw();
  }

  private readonly handleDoubleClick = (event: MouseEvent): void => {
    const path = this.hitTest(event.offsetX, event.offsetY);
    if (path !== null) this.callbacks.onOpen(path, event.ctrlKey || event.metaKey);
  };

  private readonly handleOverlayDoubleClick = (event: MouseEvent): void => {
    if (this.focusPath !== null) this.callbacks.onOpen(this.focusPath, event.ctrlKey || event.metaKey);
  };

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== "Enter" || this.focusPath === null || event.repeat) return;
    event.preventDefault();
    this.callbacks.onOpen(this.focusPath, event.ctrlKey || event.metaKey);
  };

  private readonly handlePointerDown = (event: PointerEvent): void => {
    this.pointers.set(event.pointerId, { pointerType: event.pointerType, x: event.clientX, y: event.clientY });
    const pan = this.dimension === "2d" || event.shiftKey || event.button === 1;
    this.drag = { moved: false, pan, pointerId: event.pointerId, x: event.clientX, y: event.clientY };
    if (event.pointerType === "touch" && this.pointers.size > 1) this.drag = null;
    this.canvas.setPointerCapture?.(event.pointerId);
    this.surface.addClass("is-dragging");
    this.hideTooltip();
  };

  private readonly handlePointerMove = (event: PointerEvent): void => {
    const pointer = this.pointers.get(event.pointerId);
    if (pointer?.pointerType === "touch" && this.pointers.size > 1) {
      const before = touchGesture(this.pointers.values());
      pointer.x = event.clientX;
      pointer.y = event.clientY;
      const after = touchGesture(this.pointers.values());
      if (before !== null && after !== null) {
        const deltaX = after.centerX - before.centerX;
        const deltaY = after.centerY - before.centerY;
        const bounds = this.canvas.getBoundingClientRect();
        const anchorX = after.centerX - bounds.left;
        const anchorY = after.centerY - bounds.top;
        if (this.dimension === "2d") {
          this.camera2D = panNodeGraphCanvasCamera(this.camera2D, deltaX, deltaY);
          if (before.distance > 0 && after.distance > 0) {
            this.camera2D = zoomNodeGraphCanvasCamera(
              this.camera2D,
              -Math.log(after.distance / before.distance) / 0.0015,
              anchorX,
              anchorY,
            );
          }
        } else {
          this.camera3D = panNodeGraphCamera(this.camera3D, deltaX, deltaY);
          if (before.distance > 0 && after.distance > 0) {
            this.camera3D = zoomNodeGraphCamera(
              this.camera3D,
              -Math.log(after.distance / before.distance) / 0.0015,
            );
          }
        }
        this.scheduleDraw();
      }
      return;
    }
    if (this.drag === null || event.pointerId !== this.drag.pointerId) {
      this.showTooltip(event.offsetX, event.offsetY);
      return;
    }
    const deltaX = event.clientX - this.drag.x;
    const deltaY = event.clientY - this.drag.y;
    this.drag.x = event.clientX;
    this.drag.y = event.clientY;
    if (Math.abs(deltaX) + Math.abs(deltaY) > 1) this.drag.moved = true;
    if (pointer !== undefined) {
      pointer.x = event.clientX;
      pointer.y = event.clientY;
    }
    if (this.dimension === "2d") {
      this.camera2D = panNodeGraphCanvasCamera(this.camera2D, deltaX, deltaY);
    } else {
      this.camera3D = this.drag.pan
        ? panNodeGraphCamera(this.camera3D, deltaX, deltaY)
        : rotateNodeGraphCamera(this.camera3D, deltaX, deltaY);
    }
    this.scheduleDraw();
  };

  private readonly handlePointerFinish = (event: PointerEvent): void => {
    const wasClick = this.drag?.pointerId === event.pointerId && !this.drag.moved;
    this.pointers.delete(event.pointerId);
    if (wasClick) {
      const path = this.hitTest(event.offsetX, event.offsetY);
      if (path !== null) {
        this.focusPath = path;
        this.updateDerivedState();
        this.callbacks.onSelect(path);
      }
    }
    const remaining = this.pointers.entries().next().value;
    this.drag = remaining === undefined ? null : {
      moved: true,
      pan: this.dimension === "2d",
      pointerId: remaining[0],
      x: remaining[1].x,
      y: remaining[1].y,
    };
    if (this.pointers.size === 0) this.surface.removeClass("is-dragging");
    this.scheduleDraw();
  };

  private readonly handlePointerLeave = (): void => {
    if (this.drag === null) this.hideTooltip();
  };

  private readonly handleWheel = (event: WheelEvent): void => {
    event.preventDefault();
    if (this.dimension === "2d") {
      this.camera2D = zoomNodeGraphCanvasCamera(this.camera2D, event.deltaY, event.offsetX, event.offsetY);
    } else {
      this.camera3D = zoomNodeGraphCamera(this.camera3D, event.deltaY);
    }
    this.scheduleDraw();
  };

  private bindEvents(): void {
    this.canvas.addEventListener("dblclick", this.handleDoubleClick);
    this.canvas.addEventListener("keydown", this.handleKeyDown);
    this.canvas.addEventListener("pointerdown", this.handlePointerDown);
    this.canvas.addEventListener("pointermove", this.handlePointerMove);
    this.canvas.addEventListener("pointerup", this.handlePointerFinish);
    this.canvas.addEventListener("pointercancel", this.handlePointerFinish);
    this.canvas.addEventListener("pointerleave", this.handlePointerLeave);
    this.canvas.addEventListener("wheel", this.handleWheel, { passive: false });
    this.focusOverlay.addEventListener("dblclick", this.handleOverlayDoubleClick);
    this.focusOverlay.addEventListener("keydown", this.handleKeyDown);
  }

  private unbindEvents(): void {
    this.canvas.removeEventListener("dblclick", this.handleDoubleClick);
    this.canvas.removeEventListener("keydown", this.handleKeyDown);
    this.canvas.removeEventListener("pointerdown", this.handlePointerDown);
    this.canvas.removeEventListener("pointermove", this.handlePointerMove);
    this.canvas.removeEventListener("pointerup", this.handlePointerFinish);
    this.canvas.removeEventListener("pointercancel", this.handlePointerFinish);
    this.canvas.removeEventListener("pointerleave", this.handlePointerLeave);
    this.canvas.removeEventListener("wheel", this.handleWheel);
    this.focusOverlay.removeEventListener("dblclick", this.handleOverlayDoubleClick);
    this.focusOverlay.removeEventListener("keydown", this.handleKeyDown);
  }

  private scheduleDraw(): void {
    if (this.destroyed || this.frameId !== null) return;
    const ownerWindow = this.surface.ownerDocument.defaultView;
    if (typeof ownerWindow?.requestAnimationFrame === "function") {
      this.frameUsesTimeout = false;
      this.frameId = ownerWindow.requestAnimationFrame(() => this.drawFrame());
      return;
    }
    this.frameUsesTimeout = true;
    this.frameId = ownerWindow?.setTimeout(() => this.drawFrame(), 0) ?? window.setTimeout(() => this.drawFrame(), 0);
  }

  private cancelFrame(): void {
    if (this.frameId === null) return;
    const ownerWindow = this.surface.ownerDocument.defaultView;
    if (this.frameUsesTimeout) (ownerWindow ?? window).clearTimeout(this.frameId);
    else ownerWindow?.cancelAnimationFrame(this.frameId);
    this.frameId = null;
  }

  private drawFrame(): void {
    this.frameId = null;
    if (this.destroyed || this.context === null) return;
    this.context.clearRect(0, 0, this.width, this.height);
    this.context.fillStyle = this.palette.background;
    this.context.fillRect(0, 0, this.width, this.height);
    const projected = this.dimension === "2d" ? this.project2D() : projectNodeGraph3D(this.data.points3D, this.camera3D, this.width, this.height);
    this.projectedById.clear();
    for (const point of projected) this.projectedById.set(point.id, point);
    this.drawEdges(this.projectedById);
    this.visiblePoints = projected
      .filter((point) => pointIsVisible(point, { width: this.width, height: this.height }, NODE_HALF_WIDTH, NODE_HALF_HEIGHT))
      .sort((left, right) => left.scale - right.scale || left.id.localeCompare(right.id, "en"));
    for (const point of this.visiblePoints) this.drawNode(point);
    this.updateFocusOverlay(this.projectedById);
  }

  private project2D(): readonly NodeGraphCanvasPoint[] {
    return this.data.layout.nodes.map((node) => ({
      id: node.id,
      scale: this.camera2D.zoom,
      x: (node.x + this.data.layout.nodeWidth / 2) * this.camera2D.zoom + this.camera2D.panX,
      y: (node.y + this.data.layout.nodeHeight / 2) * this.camera2D.zoom + this.camera2D.panY,
    }));
  }

  private drawEdges(projected: ReadonlyMap<string, NodeGraphCanvasPoint>): void {
    if (this.context === null) return;
    for (const edge of this.edges) {
      const source = projected.get(edge.source);
      const target = projected.get(edge.target);
      if (source === undefined || target === undefined || !lineMightBeVisible(source, target, this.width, this.height)) continue;
      const connected = this.focusPath !== null && (edge.source === this.focusPath || edge.target === this.focusPath);
      const alpha = this.focusPath === null || connected ? 1 : 0.08;
      if (this.relationMode !== "links" && edge.structure) {
        this.drawEdgeLine(source, target, this.palette.border, false, alpha, 0);
      }
      if (this.relationMode !== "structure" && edge.link) {
        const offset = this.relationMode === "hybrid" && edge.structure ? 4 : 0;
        this.drawEdgeLine(source, target, this.palette.link, true, alpha, offset);
      }
    }
  }

  private drawEdgeLine(
    source: NodeGraphCanvasPoint,
    target: NodeGraphCanvasPoint,
    color: string,
    dashed: boolean,
    alpha: number,
    offset: number,
  ): void {
    if (this.context === null) return;
    const shifted = offsetLine(source.x, source.y, target.x, target.y, offset);
    this.context.save();
    this.context.globalAlpha = alpha;
    this.context.strokeStyle = color;
    this.context.lineWidth = alpha === 1 ? 1.7 : 1;
    this.context.setLineDash(dashed ? [6, 5] : []);
    this.context.beginPath();
    this.context.moveTo(shifted.sourceX, shifted.sourceY);
    this.context.lineTo(shifted.targetX, shifted.targetY);
    this.context.stroke();
    this.context.restore();
  }

  private drawNode(point: NodeGraphCanvasPoint): void {
    if (this.context === null) return;
    const record = this.data.records.get(point.id);
    if (record === undefined) return;
    const focused = point.id === this.focusPath;
    const neighbor = this.neighbors.has(point.id);
    const match = this.searchMatches.has(point.id);
    const unrelated = this.focusPath !== null && !focused && !neighbor;
    const scale = this.dimension === "2d" ? point.scale : Math.max(0.65, Math.min(1.2, point.scale));
    const alpha = unrelated ? 0.22 : this.dimension === "3d" ? Math.max(0.5, Math.min(1, scale)) : 1;
    this.context.save();
    this.context.globalAlpha = alpha;
    if (scale < 0.08) {
      this.context.fillStyle = focused || match ? this.palette.accent : record.visual.accent ?? this.palette.border;
      this.context.beginPath();
      this.context.arc(point.x, point.y, focused ? 4 : 2, 0, Math.PI * 2);
      this.context.fill();
      this.context.restore();
      return;
    }
    const width = Math.max(12, NODE_WIDTH * scale);
    const height = Math.max(7, NODE_HEIGHT * scale);
    const left = point.x - width / 2;
    const top = point.y - height / 2;
    this.context.fillStyle = point.id === this.hoveredPath ? this.palette.nodeHover : this.palette.node;
    this.context.strokeStyle = focused || match ? this.palette.accent : neighbor ? this.palette.mutedText : this.palette.border;
    this.context.lineWidth = focused ? 2.5 : match ? 2 : 1;
    this.context.fillRect(left, top, width, height);
    this.context.strokeRect(left, top, width, height);
    if (scale >= 0.38) {
      const fontSize = Math.max(10, Math.min(14, 13 * scale));
      this.context.fillStyle = this.palette.text;
      this.context.font = `${fontSize}px sans-serif`;
      this.context.textAlign = "center";
      this.context.textBaseline = "middle";
      this.context.fillText(record.label, point.x, point.y, Math.max(10, width - 14));
    }
    this.context.restore();
  }

  private updateFocusOverlay(projected: ReadonlyMap<string, NodeGraphCanvasPoint>): void {
    const path = this.focusPath;
    const point = path === null ? undefined : projected.get(path);
    const record = path === null ? undefined : this.data.records.get(path);
    if (path === null || point === undefined || record === undefined) {
      this.focusOverlay.hidden = true;
      return;
    }
    if (this.overlayPath !== path) {
      this.overlayPath = path;
      this.focusOverlay.empty();
      if (record.visual.kind !== "fallback") {
        const icon = this.focusOverlay.createSpan({ cls: "folder-nodes-node-graph-icon" });
        renderVisual(icon, record.visual, record.label);
      }
      this.focusOverlay.createSpan({ cls: "folder-nodes-node-graph-label", text: record.label });
      this.focusOverlay.dataset.nodePath = path;
    }
    const counts = this.relationCounts.get(path) ?? { links: 0, structure: 0 };
    this.focusOverlay.setAttribute("title", `${path}\n${this.callbacks.relationSummary(counts.structure, counts.links)}`);
    this.focusOverlay.style.left = `${point.x}px`;
    this.focusOverlay.style.top = `${point.y}px`;
    this.focusOverlay.hidden = false;
  }

  private updateDerivedState(): void {
    this.neighbors.clear();
    this.relationCounts.clear();
    for (const edge of this.edges) {
      const structure = this.relationMode !== "links" && edge.structure ? 1 : 0;
      const links = this.relationMode !== "structure" && edge.link ? 1 : 0;
      for (const path of [edge.source, edge.target]) {
        const counts = this.relationCounts.get(path) ?? { links: 0, structure: 0 };
        this.relationCounts.set(path, { links: counts.links + links, structure: counts.structure + structure });
      }
      if (this.focusPath === edge.source) this.neighbors.add(edge.target);
      else if (this.focusPath === edge.target) this.neighbors.add(edge.source);
    }
  }

  private centerOn(path: string): void {
    if (this.dimension === "2d") {
      const point = this.layoutPositions.get(path);
      if (point === undefined) return;
      const zoom = Math.max(0.8, this.camera2D.zoom);
      this.camera2D = {
        zoom,
        panX: this.width / 2 - point.x * zoom,
        panY: this.height / 2 - point.y * zoom,
      };
      return;
    }
    const point = projectNodeGraph3D(this.data.points3D, this.camera3D, this.width, this.height)
      .find((candidate) => candidate.id === path);
    if (point === undefined) return;
    this.camera3D = panNodeGraphCamera(this.camera3D, this.width / 2 - point.x, this.height / 2 - point.y);
  }

  private hitTest(x: number, y: number): string | null {
    return hitTestNodeGraphCanvas(this.visiblePoints, x, y, NODE_HALF_WIDTH, NODE_HALF_HEIGHT);
  }

  private showTooltip(x: number, y: number): void {
    const path = this.hitTest(x, y);
    if (path === this.hoveredPath) return;
    this.hoveredPath = path;
    if (path === null) {
      this.hideTooltip();
      this.scheduleDraw();
      return;
    }
    const record = this.data.records.get(path);
    if (record === undefined) return;
    const counts = this.relationCounts.get(path) ?? { links: 0, structure: 0 };
    this.tooltip.setText(`${record.label}\n${path}\n${this.callbacks.relationSummary(counts.structure, counts.links)}`);
    this.tooltip.style.left = `${Math.min(this.width - 16, x + 12)}px`;
    this.tooltip.style.top = `${Math.min(this.height - 16, y + 12)}px`;
    this.tooltip.hidden = false;
    this.scheduleDraw();
  }

  private hideTooltip(): void {
    this.hoveredPath = null;
    this.tooltip.hidden = true;
  }

  private readPalette(): CanvasPalette {
    const ownerWindow = this.surface.ownerDocument.defaultView;
    const style = ownerWindow?.getComputedStyle(this.surface);
    const color = (name: string, fallback: string): string => style?.getPropertyValue(name).trim() || fallback;
    return {
      accent: color("--interactive-accent", "#7c5cff"),
      background: color("--background-primary", "#1e1e1e"),
      border: color("--background-modifier-border-hover", "#666"),
      link: color("--interactive-accent", "#7c5cff"),
      mutedText: color("--text-muted", "#999"),
      node: color("--background-secondary", "#2b2b2b"),
      nodeHover: color("--background-modifier-hover", "#3b3b3b"),
      text: color("--text-normal", "#ddd"),
    };
  }
}

function lineMightBeVisible(
  source: NodeGraphCanvasPoint,
  target: NodeGraphCanvasPoint,
  width: number,
  height: number,
): boolean {
  const padding = 32;
  return Math.max(source.x, target.x) >= -padding
    && Math.min(source.x, target.x) <= width + padding
    && Math.max(source.y, target.y) >= -padding
    && Math.min(source.y, target.y) <= height + padding;
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

function touchGesture(pointers: Iterable<CanvasPointer>): {
  readonly centerX: number;
  readonly centerY: number;
  readonly distance: number;
} | null {
  const touch = [...pointers].filter(({ pointerType }) => pointerType === "touch");
  const first = touch[0];
  const second = touch[1];
  if (first === undefined || second === undefined) return null;
  return {
    centerX: (first.x + second.x) / 2,
    centerY: (first.y + second.y) / 2,
    distance: Math.hypot(second.x - first.x, second.y - first.y),
  };
}
