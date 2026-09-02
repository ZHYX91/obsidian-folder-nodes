import {
  buildNodeGraphCanvasSpatialIndex,
  fitNodeGraphCanvasCamera,
  NODE_GRAPH_CANVAS_NODE_WIDTH,
  nodeGraphCanvasGeometry,
  panNodeGraphCanvasCamera,
  pointIsVisible,
  queryNodeGraphCanvasSpatialIndex,
  selectNodeGraphCanvasOverviewEdges,
  zoomNodeGraphCanvasCamera,
  type NodeGraphCanvasCamera,
  type NodeGraphCanvasPoint,
  type NodeGraphCanvasSpatialIndex,
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
import {
  nodeGraphBoxContains,
  nodeGraphBoxFromCenter,
  nodeGraphLinkGeometry,
  nodeGraphStructureGeometry,
  type NodeGraphBox,
} from "../core/node-graph-geometry";
import type { NodeGraphLayout } from "../core/node-graph-layout";
import {
  nodeGraphLinkEdges,
  nodeGraphStructureEdges,
  type NodeGraphModel,
  type NodeGraphModelEdge,
} from "../core/node-graph-model";
import type { NodeVisual } from "../core/types";
import { fitNodeGraphCardLabel } from "../core/node-graph-card-width";
import { renderVisual } from "../presentation/render-visual";

export type NodeGraphCanvasDimension = "2d" | "3d";

export interface NodeGraphCanvasViewportState {
  readonly camera2D: NodeGraphCanvasCamera;
  readonly camera3D: NodeGraphCamera;
  readonly dimension: NodeGraphCanvasDimension;
}

export interface NodeGraphCanvasRecord {
  readonly boundary?: boolean;
  readonly childCount?: number;
  readonly expanded?: boolean;
  readonly hiddenExplicit?: boolean;
  readonly hiddenSourcePath?: string | null;
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
  readonly hiddenLabel?: (sourcePath: string, explicit: boolean) => string;
  readonly label: (key: "altBranchHint" | "boundaryNode" | "largeGraph" | "nodeGraph") => string;
  readonly onContextMenu?: (path: string, event: MouseEvent) => void;
  readonly onOpen: (path: string, newLeaf: boolean) => void;
  readonly onSelect: (path: string | null) => void;
  readonly onToggle?: (path: string, branch: boolean) => void;
  readonly overviewEdgeLimit?: number;
  readonly relationSummary: (structure: number, links: number) => string;
  readonly toggleLabel?: (label: string, childCount: number, expanded: boolean) => string;
}

interface CanvasDrag {
  readonly pan: boolean;
  readonly pointerId: number;
  moved: boolean;
  travel: number;
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
  readonly emojiFont: string;
  readonly glyphFont: string;
  readonly link: string;
  readonly mutedText: string;
  readonly node: string;
  readonly nodeHover: string;
  readonly text: string;
}

type EdgeBatchKey =
  | "link-active"
  | "link-muted"
  | "link-offset-active"
  | "link-offset-muted"
  | "structure-active"
  | "structure-muted";

const MIN_READABLE_2D_ZOOM = 0.38;
const MIN_READABLE_3D_ZOOM = 0.32;
const DENSE_3D_DOT_THRESHOLD = 48;
const MOUSE_DRAG_SLOP = 3;
const TOUCH_DRAG_SLOP = 8;

interface CanvasNodePresentation {
  readonly box: NodeGraphBox;
  readonly kind: "card" | "dot";
  readonly label: boolean;
  readonly radius: number;
  readonly scale: number;
}

export class NodeGraphCanvasRenderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly activeAnnouncement: HTMLElement;
  private readonly context: CanvasRenderingContext2D | null;
  private readonly edgeBatches: Record<EdgeBatchKey, number[]> = {
    "link-active": [],
    "link-muted": [],
    "link-offset-active": [],
    "link-offset-muted": [],
    "structure-active": [],
    "structure-muted": [],
  };
  private readonly focusOverlay: HTMLElement;
  private readonly focusOverlayBody: HTMLButtonElement;
  private readonly focusOverlayToggle: HTMLButtonElement;
  private readonly structureEdges: readonly NodeGraphModelEdge[];
  private readonly structureParentEdges = new Map<string, NodeGraphModelEdge>();
  private readonly linkEdges: readonly NodeGraphModelEdge[];
  private readonly incidentStructureEdges = new Map<string, NodeGraphModelEdge[]>();
  private readonly incidentLinkEdges = new Map<string, NodeGraphModelEdge[]>();
  private readonly overviewLinkEdges: readonly NodeGraphModelEdge[];
  private readonly overviewLinkEdgeSet: ReadonlySet<NodeGraphModelEdge>;
  private readonly tooltip: HTMLElement;
  private readonly visualImages = new Map<string, HTMLImageElement>();
  private readonly layoutPositions: ReadonlyMap<string, { readonly width: number; readonly x: number; readonly y: number }>;
  private readonly layoutSpatialIndex: NodeGraphCanvasSpatialIndex;
  private readonly pointers = new Map<number, CanvasPointer>();
  private readonly projectedById = new Map<string, NodeGraphCanvasPoint>();
  private themeObserver: MutationObserver | null = null;
  private camera2D: NodeGraphCanvasCamera = { panX: 0, panY: 0, zoom: 1 };
  private camera3D: NodeGraphCamera = defaultNodeGraphCamera();
  private destroyed = false;
  private drag: CanvasDrag | null = null;
  private frameId: number | null = null;
  private frameUsesTimeout = false;
  private focusPath: string | null;
  private readonly focusContextPaths = new Set<string>();
  private height = 1;
  private hoveredPath: string | null = null;
  private neighbors = new Set<string>();
  private overlayPath: string | null = null;
  private palette: CanvasPalette;
  private readonly relationCounts = new Map<string, { readonly links: number; readonly structure: number }>();
  private searchMatches = new Set<string>();
  private visiblePoints: readonly NodeGraphCanvasPoint[] = [];
  private width = 1;

  public constructor(
    private readonly surface: HTMLElement,
    private readonly data: NodeGraphCanvasData,
    private readonly dimension: NodeGraphCanvasDimension,
    showLinks: boolean,
    focusPath: string | null,
    private readonly callbacks: NodeGraphCanvasCallbacks,
  ) {
    this.focusPath = focusPath;
    this.structureEdges = nodeGraphStructureEdges(data.model);
    for (const edge of this.structureEdges) this.structureParentEdges.set(edge.target, edge);
    this.linkEdges = showLinks ? nodeGraphLinkEdges(data.model) : [];
    this.buildEdgeIndex();
    this.overviewLinkEdges = selectNodeGraphCanvasOverviewEdges(this.linkEdges, callbacks.overviewEdgeLimit);
    this.overviewLinkEdgeSet = new Set(this.overviewLinkEdges);
    this.layoutPositions = new Map(data.layout.nodes.map((node) => [
      node.id,
      { width: node.width, x: node.x + node.width / 2, y: node.y + data.layout.nodeHeight / 2 },
    ]));
    this.layoutSpatialIndex = buildNodeGraphCanvasSpatialIndex(
      data.layout.nodes.map((node) => ({
        id: node.id,
        x: node.x + node.width / 2,
        y: node.y + data.layout.nodeHeight / 2,
      })),
    );
    this.surface.addClass("folder-nodes-node-graph-canvas-surface");
    this.canvas = surface.createEl("canvas", {
      cls: "folder-nodes-node-graph-render-canvas",
      attr: { role: "application", tabindex: "0", "aria-label": callbacks.label("largeGraph") },
    });
    this.activeAnnouncement = surface.createDiv({
      cls: "folder-nodes-node-graph-canvas-announcement",
      attr: { "aria-live": "polite", role: "status" },
    });
    this.context = this.canvas.getContext("2d");
    this.focusOverlay = surface.createDiv({
      cls: "folder-nodes-node-graph-focus-overlay",
      attr: { role: "group" },
    });
    this.focusOverlayBody = this.focusOverlay.createEl("button", {
      cls: "folder-nodes-node-graph-focus-overlay-body",
      attr: { type: "button" },
    });
    this.focusOverlayToggle = this.focusOverlay.createEl("button", {
      cls: "folder-nodes-node-graph-focus-overlay-toggle",
      attr: { type: "button" },
    });
    this.tooltip = surface.createDiv({ cls: "folder-nodes-node-graph-canvas-tooltip" });
    this.tooltip.hidden = true;
    this.focusOverlay.hidden = true;
    this.palette = this.readPalette();
    this.updateDerivedState();
    this.announceFocus();
    this.bindEvents();
    this.bindThemeChanges();
    this.resize(true);
  }

  public destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.cancelFrame();
    this.unbindEvents();
    this.themeObserver?.disconnect();
    this.themeObserver = null;
    this.pointers.clear();
    this.drag = null;
    this.visiblePoints = [];
    this.projectedById.clear();
    this.searchMatches.clear();
    this.neighbors.clear();
    this.focusContextPaths.clear();
    this.relationCounts.clear();
    this.visualImages.clear();
    this.canvas.remove();
    this.activeAnnouncement.remove();
    this.focusOverlay.remove();
    this.tooltip.remove();
    this.surface.removeClass("folder-nodes-node-graph-canvas-surface", "is-dragging");
  }

  public fit(): void {
    const targetPath = this.focusPath ?? [...this.data.model.nodes]
      .sort((left, right) => left.depth - right.depth)[0]?.id ?? null;
    if (this.dimension === "2d") {
      const target = targetPath === null ? undefined : this.layoutPositions.get(targetPath);
      this.camera2D = fitNodeGraphCanvasCamera(
        { width: this.data.layout.width, height: this.data.layout.height },
        { width: this.width, height: this.height },
        32,
        MIN_READABLE_2D_ZOOM,
        target,
      );
    } else {
      const fitted = fitNodeGraphCamera(this.data.points3D, this.camera3D, this.width, this.height);
      const constrained = fitted.zoom < MIN_READABLE_3D_ZOOM;
      this.camera3D = constrained ? { ...fitted, zoom: MIN_READABLE_3D_ZOOM } : fitted;
      if (constrained && targetPath !== null) this.centerOn(targetPath);
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

  public refreshPalette(): void {
    if (this.destroyed) return;
    this.palette = this.readPalette();
    this.visualImages.clear();
    this.scheduleDraw();
  }

  public setFocus(path: string | null, center: boolean): void {
    this.focusPath = path;
    this.updateDerivedState();
    this.announceFocus();
    if (center && path !== null) this.centerOn(path);
    this.scheduleDraw();
  }

  public centerPath(path: string): void {
    if (this.destroyed) return;
    this.centerOn(path);
    this.scheduleDraw();
  }

  public setSearchMatches(paths: Iterable<string>): void {
    this.searchMatches = new Set(paths);
    this.scheduleDraw();
  }

  public captureViewportState(): NodeGraphCanvasViewportState {
    return {
      camera2D: { ...this.camera2D },
      camera3D: { ...this.camera3D },
      dimension: this.dimension,
    };
  }

  public restoreViewportState(state: NodeGraphCanvasViewportState): void {
    if (state.dimension !== this.dimension) return;
    this.camera2D = { ...state.camera2D, zoom: Math.max(MIN_READABLE_2D_ZOOM, state.camera2D.zoom) };
    this.camera3D = { ...state.camera3D };
    this.scheduleDraw();
  }

  private readonly handleDoubleClick = (event: MouseEvent): void => {
    const path = this.hitTest(event.offsetX, event.offsetY);
    if (path !== null) this.callbacks.onOpen(path, event.ctrlKey || event.metaKey);
  };

  private readonly handleOverlayDoubleClick = (event: MouseEvent): void => {
    if (this.overlayPath !== null) this.callbacks.onOpen(this.overlayPath, event.ctrlKey || event.metaKey);
  };

  private readonly handleOverlayClick = (): void => {
    if (this.overlayPath !== null && this.overlayPath !== this.focusPath) this.selectFromCanvas(this.overlayPath, false);
  };

  private readonly handleOverlayKeyDown = (event: KeyboardEvent): void => {
    if (event.repeat || this.overlayPath === null) return;
    if (event.key !== "Enter" && event.key !== " " && event.key !== "Spacebar") return;
    event.preventDefault();
    this.callbacks.onOpen(this.overlayPath, event.ctrlKey || event.metaKey);
  };

  private readonly handleOverlayToggle = (event: MouseEvent): void => {
    if (this.overlayPath === null || this.callbacks.onToggle === undefined) return;
    event.preventDefault();
    event.stopPropagation();
    this.callbacks.onToggle(this.overlayPath, event.altKey);
  };

  private readonly handleContextMenu = (event: MouseEvent): void => {
    const path = this.hitTest(event.offsetX, event.offsetY);
    if (path === null || this.callbacks.onContextMenu === undefined) return;
    event.preventDefault();
    if (path !== this.focusPath) this.selectFromCanvas(path, false);
    this.callbacks.onContextMenu(path, event);
  };

  private readonly handleOverlayContextMenu = (event: MouseEvent): void => {
    if (this.overlayPath === null || this.callbacks.onContextMenu === undefined) return;
    event.preventDefault();
    this.callbacks.onContextMenu(this.overlayPath, event);
  };

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (event.repeat) return;
    if (event.key === "Escape" && this.focusPath !== null) {
      event.preventDefault();
      event.stopPropagation();
      this.selectFromCanvas(null, false);
      return;
    }
    if (event.key === "ContextMenu" || (event.key === "F10" && event.shiftKey)) {
      if (this.focusPath === null || this.callbacks.onContextMenu === undefined) return;
      event.preventDefault();
      const point = this.projectedById.get(this.focusPath);
      const bounds = this.canvas.getBoundingClientRect();
      const EventConstructor = this.surface.ownerDocument.defaultView?.MouseEvent ?? MouseEvent;
      const menuEvent = new EventConstructor("contextmenu", {
        bubbles: false,
        clientX: bounds.left + (point?.x ?? this.width / 2),
        clientY: bounds.top + (point?.y ?? this.height / 2),
      });
      this.callbacks.onContextMenu(this.focusPath, menuEvent);
      return;
    }
    if (["ArrowDown", "ArrowLeft", "ArrowRight", "ArrowUp", "End", "Home"].includes(event.key)) {
      const ordered = this.keyboardPaths();
      if (ordered.length === 0) return;
      const current = this.focusPath === null ? -1 : ordered.indexOf(this.focusPath);
      const backwards = event.key === "ArrowLeft" || event.key === "ArrowUp";
      const nextIndex = event.key === "Home"
        ? 0
        : event.key === "End"
          ? ordered.length - 1
          : current < 0
            ? 0
            : (current + (backwards ? -1 : 1) + ordered.length) % ordered.length;
      const next = ordered[nextIndex];
      if (next === undefined) return;
      event.preventDefault();
      this.selectFromCanvas(next, true);
      return;
    }
    if (event.key !== "Enter" && event.key !== " " && event.key !== "Spacebar") return;
    event.preventDefault();
    if (this.focusPath === null) {
      const first = this.keyboardPaths()[0];
      if (first !== undefined) this.selectFromCanvas(first, true);
      return;
    }
    this.callbacks.onOpen(this.focusPath, event.ctrlKey || event.metaKey);
  };

  private readonly handlePointerDown = (event: PointerEvent): void => {
    this.pointers.set(event.pointerId, { pointerType: event.pointerType, x: event.clientX, y: event.clientY });
    const pan = this.dimension === "2d" || event.shiftKey || event.button === 1;
    this.drag = { moved: false, pan, pointerId: event.pointerId, travel: 0, x: event.clientX, y: event.clientY };
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
              MIN_READABLE_2D_ZOOM,
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
    this.drag.travel += Math.hypot(deltaX, deltaY);
    const dragSlop = pointer?.pointerType === "touch" ? TOUCH_DRAG_SLOP : MOUSE_DRAG_SLOP;
    if (this.drag.travel > dragSlop) this.drag.moved = true;
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
    this.finishPointer(event, true);
  };

  private readonly handlePointerCancel = (event: PointerEvent): void => {
    this.finishPointer(event, false);
  };

  private finishPointer(event: PointerEvent, allowSelection: boolean): void {
    const wasClick = allowSelection && this.drag?.pointerId === event.pointerId && !this.drag.moved;
    this.pointers.delete(event.pointerId);
    if (wasClick) {
      const path = this.hitTest(event.offsetX, event.offsetY);
      if (path !== null && this.isToggleHit(path, event.offsetX, event.offsetY)) {
        this.callbacks.onToggle?.(path, event.altKey);
      } else if (path !== null) this.selectFromCanvas(path, false);
      else this.selectFromCanvas(null, false);
    }
    const remaining = this.pointers.entries().next().value;
    this.drag = remaining === undefined ? null : {
      moved: true,
      pan: this.dimension === "2d",
      pointerId: remaining[0],
      travel: 0,
      x: remaining[1].x,
      y: remaining[1].y,
    };
    if (this.pointers.size === 0) this.surface.removeClass("is-dragging");
    this.scheduleDraw();
  }

  private readonly handlePointerLeave = (event: PointerEvent): void => {
    const related = event.relatedTarget;
    if (related instanceof Node && this.focusOverlay.contains(related)) return;
    if (this.drag === null) this.hideTooltip();
    this.scheduleDraw();
  };

  private readonly handleOverlayPointerLeave = (event: PointerEvent): void => {
    const related = event.relatedTarget;
    if (related === this.canvas) return;
    this.hideTooltip();
    this.scheduleDraw();
  };

  private readonly handleWheel = (event: WheelEvent): void => {
    event.preventDefault();
    if (this.dimension === "2d") {
      this.camera2D = zoomNodeGraphCanvasCamera(
        this.camera2D,
        event.deltaY,
        event.offsetX,
        event.offsetY,
        MIN_READABLE_2D_ZOOM,
      );
    } else {
      this.camera3D = zoomNodeGraphCamera(this.camera3D, event.deltaY);
    }
    this.scheduleDraw();
  };

  private bindEvents(): void {
    this.canvas.addEventListener("contextmenu", this.handleContextMenu);
    this.canvas.addEventListener("dblclick", this.handleDoubleClick);
    this.canvas.addEventListener("keydown", this.handleKeyDown);
    this.canvas.addEventListener("pointerdown", this.handlePointerDown);
    this.canvas.addEventListener("pointermove", this.handlePointerMove);
    this.canvas.addEventListener("pointerup", this.handlePointerFinish);
    this.canvas.addEventListener("pointercancel", this.handlePointerCancel);
    this.canvas.addEventListener("lostpointercapture", this.handlePointerCancel);
    this.canvas.addEventListener("pointerleave", this.handlePointerLeave);
    this.canvas.addEventListener("wheel", this.handleWheel, { passive: false });
    this.focusOverlayBody.addEventListener("click", this.handleOverlayClick);
    this.focusOverlayBody.addEventListener("dblclick", this.handleOverlayDoubleClick);
    this.focusOverlayBody.addEventListener("keydown", this.handleOverlayKeyDown);
    this.focusOverlay.addEventListener("contextmenu", this.handleOverlayContextMenu);
    this.focusOverlay.addEventListener("pointerleave", this.handleOverlayPointerLeave);
    this.focusOverlayToggle.addEventListener("click", this.handleOverlayToggle);
  }

  private unbindEvents(): void {
    this.canvas.removeEventListener("contextmenu", this.handleContextMenu);
    this.canvas.removeEventListener("dblclick", this.handleDoubleClick);
    this.canvas.removeEventListener("keydown", this.handleKeyDown);
    this.canvas.removeEventListener("pointerdown", this.handlePointerDown);
    this.canvas.removeEventListener("pointermove", this.handlePointerMove);
    this.canvas.removeEventListener("pointerup", this.handlePointerFinish);
    this.canvas.removeEventListener("pointercancel", this.handlePointerCancel);
    this.canvas.removeEventListener("lostpointercapture", this.handlePointerCancel);
    this.canvas.removeEventListener("pointerleave", this.handlePointerLeave);
    this.canvas.removeEventListener("wheel", this.handleWheel);
    this.focusOverlayBody.removeEventListener("click", this.handleOverlayClick);
    this.focusOverlayBody.removeEventListener("dblclick", this.handleOverlayDoubleClick);
    this.focusOverlayBody.removeEventListener("keydown", this.handleOverlayKeyDown);
    this.focusOverlay.removeEventListener("contextmenu", this.handleOverlayContextMenu);
    this.focusOverlay.removeEventListener("pointerleave", this.handleOverlayPointerLeave);
    this.focusOverlayToggle.removeEventListener("click", this.handleOverlayToggle);
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
    this.drawEdges(this.dimension === "2d" ? this.project2DEdgeEndpoints(projected) : this.projectedById);
    this.visiblePoints = this.orderVisiblePoints(
      projected.filter((point) => pointIsVisible(point, { width: this.width, height: this.height })),
    );
    for (const point of this.visiblePoints) this.drawNode(point);
    this.updateFocusOverlay(this.projectedById);
  }

  private project2D(): readonly NodeGraphCanvasPoint[] {
    const zoom = this.camera2D.zoom;
    const padding = Math.max(this.data.layout.maxNodeWidth, this.data.layout.nodeHeight) / 2 + 32 / zoom;
    const candidates = queryNodeGraphCanvasSpatialIndex(this.layoutSpatialIndex, {
      minX: -this.camera2D.panX / zoom - padding,
      maxX: (this.width - this.camera2D.panX) / zoom + padding,
      minY: -this.camera2D.panY / zoom - padding,
      maxY: (this.height - this.camera2D.panY) / zoom + padding,
    });
    return candidates.map((node) => ({
      id: node.id,
      scale: this.camera2D.zoom,
      width: this.layoutPositions.get(node.id)?.width ?? this.data.layout.maxNodeWidth,
      x: node.x * this.camera2D.zoom + this.camera2D.panX,
      y: node.y * this.camera2D.zoom + this.camera2D.panY,
    }));
  }

  private project2DEdgeEndpoints(
    projected: readonly NodeGraphCanvasPoint[],
  ): ReadonlyMap<string, NodeGraphCanvasPoint> {
    const endpoints = new Map(projected.map((point) => [point.id, point]));
    for (const point of projected) {
      for (const edge of this.incidentStructureEdges.get(point.id) ?? []) {
        const otherId = edge.source === point.id ? edge.target : edge.source;
        if (endpoints.has(otherId)) continue;
        const other = this.layoutPositions.get(otherId);
        if (other === undefined) continue;
        endpoints.set(otherId, {
          id: otherId,
          scale: this.camera2D.zoom,
          width: other.width,
          x: other.x * this.camera2D.zoom + this.camera2D.panX,
          y: other.y * this.camera2D.zoom + this.camera2D.panY,
        });
      }
    }
    return endpoints;
  }

  private orderVisiblePoints(points: readonly NodeGraphCanvasPoint[]): readonly NodeGraphCanvasPoint[] {
    if (this.dimension !== "3d" || points.length < 2_000) {
      return [...points].sort((left, right) => left.scale - right.scale || left.id.localeCompare(right.id, "en"));
    }
    const buckets = Array.from({ length: 64 }, (): NodeGraphCanvasPoint[] => []);
    for (const point of points) {
      const index = Math.max(0, Math.min(buckets.length - 1, Math.floor(point.scale / 1.2 * buckets.length)));
      buckets[index]?.push(point);
    }
    return buckets.flat();
  }

  private drawEdges(projected: ReadonlyMap<string, NodeGraphCanvasPoint>): void {
    if (this.context === null) return;
    for (const segments of Object.values(this.edgeBatches)) segments.length = 0;
    const structureEdges = this.dimension === "2d"
      ? [...projected.keys()].flatMap((id) => {
        const edge = this.structureParentEdges.get(id);
        return edge !== undefined && projected.has(edge.source) ? [edge] : [];
      })
      : this.structureEdges;
    for (const edge of structureEdges) {
      const source = projected.get(edge.source);
      const target = projected.get(edge.target);
      if (source === undefined || target === undefined) continue;
      const sourceBox = this.presentationForPoint(source).box;
      const targetBox = this.presentationForPoint(target).box;
      if (!lineMightBeVisible(sourceBox, targetBox, this.width, this.height)) continue;
      const contextual = this.focusPath !== null
        && this.focusContextPaths.has(edge.source)
        && this.focusContextPaths.has(edge.target);
      const muted = this.focusPath !== null && !contextual;
      this.appendStructureEdgeBatch(
        muted ? "structure-muted" : "structure-active",
        sourceBox,
        targetBox,
      );
    }
    for (const edge of this.drawnLinkEdges()) {
      const source = projected.get(edge.source);
      const target = projected.get(edge.target);
      if (source === undefined || target === undefined) continue;
      const sourceBox = this.presentationForPoint(source).box;
      const targetBox = this.presentationForPoint(target).box;
      if (!lineMightBeVisible(sourceBox, targetBox, this.width, this.height)) continue;
      const contextual = this.focusPath !== null
        && this.focusContextPaths.has(edge.source)
        && this.focusContextPaths.has(edge.target);
      const muted = this.focusPath !== null && !contextual;
      const offset = edge.structure ? 7 : 0;
      const key = offset === 0
        ? muted ? "link-muted" : "link-active"
        : muted ? "link-offset-muted" : "link-offset-active";
      this.appendLinkEdgeBatch(
        key,
        sourceBox,
        targetBox,
        offset,
      );
    }
    this.strokeEdgeBatch("structure-active", this.palette.border, false, 1);
    this.strokeEdgeBatch("structure-muted", this.palette.border, false, 0.08);
    this.strokeEdgeBatch("link-active", this.palette.link, true, 1);
    this.strokeEdgeBatch("link-muted", this.palette.link, true, 0.08);
    this.strokeEdgeBatch("link-offset-active", this.palette.link, true, 1);
    this.strokeEdgeBatch("link-offset-muted", this.palette.link, true, 0.08);
  }

  private appendStructureEdgeBatch(
    key: "structure-active" | "structure-muted",
    source: NodeGraphBox,
    target: NodeGraphBox,
  ): void {
    const geometry = nodeGraphStructureGeometry(source, target, this.data.layout.direction);
    this.edgeBatches[key].push(
      geometry.source.x,
      geometry.source.y,
      geometry.control1.x,
      geometry.control1.y,
      geometry.control2.x,
      geometry.control2.y,
      geometry.target.x,
      geometry.target.y,
    );
  }

  private appendLinkEdgeBatch(
    key: "link-active" | "link-muted" | "link-offset-active" | "link-offset-muted",
    source: NodeGraphBox,
    target: NodeGraphBox,
    offset: number,
  ): void {
    const geometry = nodeGraphLinkGeometry(source, target, offset);
    this.edgeBatches[key].push(
      geometry.source.x,
      geometry.source.y,
      geometry.control.x,
      geometry.control.y,
      geometry.target.x,
      geometry.target.y,
    );
  }

  private strokeEdgeBatch(key: EdgeBatchKey, color: string, dashed: boolean, alpha: number): void {
    if (this.context === null) return;
    const segments = this.edgeBatches[key];
    if (segments.length === 0) return;
    this.context.save();
    this.context.globalAlpha = alpha;
    this.context.strokeStyle = color;
    this.context.lineWidth = alpha === 1 ? 1.7 : 1;
    this.context.setLineDash(dashed ? [6, 5] : []);
    this.context.beginPath();
    const link = key.startsWith("link");
    const stride = link ? 6 : 8;
    for (let index = 0; index < segments.length; index += stride) {
      this.context.moveTo(segments[index] ?? 0, segments[index + 1] ?? 0);
      if (link) {
        this.context.quadraticCurveTo(
          segments[index + 2] ?? 0,
          segments[index + 3] ?? 0,
          segments[index + 4] ?? 0,
          segments[index + 5] ?? 0,
        );
      } else {
        this.context.bezierCurveTo(
          segments[index + 2] ?? 0,
          segments[index + 3] ?? 0,
          segments[index + 4] ?? 0,
          segments[index + 5] ?? 0,
          segments[index + 6] ?? 0,
          segments[index + 7] ?? 0,
        );
      }
    }
    this.context.stroke();
    this.context.restore();
  }

  private drawnLinkEdges(): readonly NodeGraphModelEdge[] {
    if (this.overviewLinkEdges.length === this.linkEdges.length || this.focusPath === null) return this.overviewLinkEdges;
    const incident = this.incidentLinkEdges.get(this.focusPath) ?? [];
    if (incident.length === 0) return this.overviewLinkEdges;
    return [...this.overviewLinkEdges, ...incident.filter((edge) => !this.overviewLinkEdgeSet.has(edge))];
  }

  private drawNode(point: NodeGraphCanvasPoint): void {
    if (this.context === null) return;
    const record = this.data.records.get(point.id);
    if (record === undefined) return;
    const focused = point.id === this.focusPath;
    const neighbor = this.neighbors.has(point.id);
    const match = this.searchMatches.has(point.id);
    const unrelated = this.focusPath !== null && !this.focusContextPaths.has(point.id);
    const presentation = this.presentationForPoint(point);
    const depthAlpha = this.dimension === "3d" ? Math.max(0.5, Math.min(1, presentation.scale)) : 1;
    const hiddenAlpha = record.hiddenSourcePath !== null && record.hiddenSourcePath !== undefined && record.hiddenExplicit !== true ? 0.62 : 1;
    const alpha = unrelated ? 0.22 : (record.boundary === true ? 0.62 : 1) * depthAlpha * hiddenAlpha;
    this.context.save();
    this.context.globalAlpha = alpha;
    if (presentation.kind === "dot") {
      this.context.fillStyle = focused || match ? this.palette.accent : record.visual.accent ?? this.palette.border;
      this.context.beginPath();
      this.context.arc(point.x, point.y, presentation.radius, 0, Math.PI * 2);
      this.context.fill();
      this.context.restore();
      return;
    }
    const width = presentation.box.width;
    const height = presentation.box.height;
    const left = point.x - width / 2;
    const top = point.y - height / 2;
    this.context.fillStyle = point.id === this.hoveredPath ? this.palette.nodeHover : this.palette.node;
    this.context.strokeStyle = focused || match ? this.palette.accent : neighbor ? this.palette.mutedText : this.palette.border;
    this.context.lineWidth = focused ? 2.5 : match ? 2 : 1;
    this.context.fillRect(left, top, width, height);
    this.context.strokeRect(left, top, width, height);
    if (this.dimension === "2d") this.drawVisualHandle(record, presentation);
    if (presentation.label) {
      const fontSize = Math.max(10, Math.min(14, 13 * presentation.scale));
      const childCount = Math.max(0, record.childCount ?? 0);
      const leftInset = this.dimension === "2d" && this.data.layout.direction === "left-to-right" ? 22 : 7;
      const rightInset = childCount > 0 && this.data.layout.direction === "left-to-right" ? 44 : 7;
      const labelX = left + leftInset + Math.max(0, width - leftInset - rightInset) / 2;
      this.context.fillStyle = this.palette.text;
      this.context.font = `${fontSize}px sans-serif`;
      this.context.textAlign = "center";
      this.context.textBaseline = "middle";
      const maxLabelWidth = Math.max(10, width - leftInset - rightInset - 4);
      const visibleLabel = fitNodeGraphCardLabel(
        record.label,
        maxLabelWidth,
        (text) => this.context?.measureText(text).width ?? Number.POSITIVE_INFINITY,
      );
      this.context.fillText(visibleLabel, labelX, point.y);
      if (record.hiddenExplicit === true) this.drawHiddenStatus(left + width - 13, top + 10, Math.max(0.75, presentation.scale));
      if (childCount > 0) {
        this.context.fillStyle = this.palette.mutedText;
        if (this.data.layout.direction === "top-to-bottom") {
          this.context.textAlign = "center";
          this.context.fillText(`${record.expanded === true ? "−" : "+"}${childCount}`, point.x, top + height - 5, 38);
        } else {
          this.context.textAlign = "right";
          this.context.fillText(`${record.expanded === true ? "−" : "+"}${childCount}`, point.x + width / 2 - 5, point.y, 38);
        }
      }
    }
    this.context.restore();
  }

  private drawHiddenStatus(x: number, y: number, scale: number): void {
    if (this.context === null) return;
    const radius = 5 * scale;
    this.context.save();
    this.context.strokeStyle = this.palette.mutedText;
    this.context.lineWidth = Math.max(1, scale);
    this.context.beginPath();
    this.context.ellipse(x, y, radius, radius * 0.62, 0, 0, Math.PI * 2);
    this.context.moveTo(x - radius - 2 * scale, y - radius);
    this.context.lineTo(x + radius + 2 * scale, y + radius);
    this.context.stroke();
    this.context.restore();
  }

  private drawVisualHandle(record: NodeGraphCanvasRecord, presentation: CanvasNodePresentation): void {
    if (this.context === null) return;
    const topToBottom = this.data.layout.direction === "top-to-bottom";
    const radius = 7;
    const x = topToBottom ? presentation.box.x : presentation.box.x - presentation.box.width / 2;
    const y = topToBottom ? presentation.box.y - presentation.box.height / 2 : presentation.box.y;
    const visual = record.visual;
    this.context.fillStyle = visual.kind === "color"
      ? visual.value
      : visual.accent ?? this.palette.border;
    this.context.beginPath();
    this.context.arc(x, y, radius, 0, Math.PI * 2);
    this.context.fill();
    if (record.visual.kind === "image" || record.visual.kind === "lucide") {
      const image = this.visualImageFor(record);
      if (image.complete && image.naturalWidth > 0) {
        this.context.drawImage(image, x - radius, y - radius, radius * 2, radius * 2);
      }
      return;
    }
    const glyph = visual.kind === "emoji" || visual.kind === "glyph"
      ? visual.value
      : visual.kind === "fallback" ? visual.value === "home" ? "⌂" : "▰" : null;
    if (glyph === null) return;
    this.context.fillStyle = visual.accent === null ? this.palette.text : this.palette.background;
    this.context.font = visual.kind === "emoji"
      ? `12px ${this.palette.emojiFont}`
      : visual.kind === "glyph" ? `600 11px ${this.palette.glyphFont}` : "11px sans-serif";
    this.context.textAlign = "center";
    this.context.textBaseline = "middle";
    this.context.fillText(glyph, x, y, radius * 2);
  }

  private visualImageFor(record: NodeGraphCanvasRecord): HTMLImageElement {
    const visual = record.visual;
    const key = `${visual.kind}\u0000${visual.value}\u0000${visual.accent ?? ""}`;
    const cached = this.visualImages.get(key);
    if (cached !== undefined) return cached;
    if (this.visualImages.size >= 256) {
      const oldest = this.visualImages.keys().next().value;
      if (oldest !== undefined) this.visualImages.delete(oldest);
    }
    const image = this.surface.ownerDocument.createElement("img");
    image.addEventListener("load", () => this.scheduleDraw(), { once: true });
    image.addEventListener("error", () => this.scheduleDraw(), { once: true });
    if (visual.kind === "image") image.src = visual.value;
    else {
      const host = this.surface.ownerDocument.createElement("span");
      renderVisual(host, visual, record.label);
      const svg = host.querySelector("svg");
      if (svg !== null) {
        svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
        svg.setAttribute("width", "18");
        svg.setAttribute("height", "18");
        svg.style.color = visual.accent ?? this.palette.text;
        image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.outerHTML)}`;
      }
    }
    this.visualImages.set(key, image);
    return image;
  }

  private updateFocusOverlay(projected: ReadonlyMap<string, NodeGraphCanvasPoint>): void {
    const path = this.hoveredPath ?? this.focusPath;
    const point = path === null ? undefined : projected.get(path);
    const record = path === null ? undefined : this.data.records.get(path);
    if (path === null || point === undefined || record === undefined) {
      this.focusOverlay.hidden = true;
      return;
    }
    if (this.overlayPath !== path) {
      this.overlayPath = path;
      this.focusOverlayBody.empty();
      const icon = this.focusOverlayBody.createSpan({ cls: "folder-nodes-node-graph-icon" });
      renderVisual(icon, record.visual, record.label);
      this.focusOverlayBody.createSpan({ cls: "folder-nodes-node-graph-label", text: record.label });
      if (record.hiddenExplicit === true) {
        this.focusOverlayBody.createSpan({ cls: "folder-nodes-hidden-status folder-nodes-status-badge is-hidden", text: this.callbacks.hiddenLabel?.(path, true) ?? "Hidden", attr: { "aria-hidden": "true" } });
      }
      this.focusOverlay.dataset.nodePath = path;
      this.focusOverlayBody.dataset.nodePath = path;
    }
    const counts = this.relationCounts.get(path) ?? { links: 0, structure: 0 };
    const boundary = record.boundary ? `\n${this.callbacks.label("boundaryNode")}` : "";
    const pathDetail = path === "" ? "" : `\n${path}`;
    const hidden = record.hiddenSourcePath === null || record.hiddenSourcePath === undefined
      ? ""
      : `\n${this.callbacks.hiddenLabel?.(record.hiddenSourcePath, record.hiddenExplicit === true) ?? record.hiddenSourcePath}`;
    const title = `${record.label}${pathDetail}${boundary}${hidden}\n${this.callbacks.relationSummary(counts.structure, counts.links)}`;
    this.focusOverlayBody.setAttribute("aria-label", title);
    this.focusOverlay.setAttribute("title", title);
    const childCount = Math.max(0, record.childCount ?? 0);
    this.focusOverlayToggle.hidden = childCount === 0 || this.callbacks.onToggle === undefined;
    this.focusOverlayToggle.setText(`${record.expanded === true ? "−" : "+"} ${childCount}`);
    this.focusOverlayToggle.setAttribute("aria-label", this.callbacks.toggleLabel?.(
      record.label,
      childCount,
      record.expanded === true,
    ) ?? `${record.expanded === true ? "Collapse" : "Expand"} ${record.label}; ${childCount}`);
    if (this.focusOverlayToggle.hidden) {
      this.focusOverlayToggle.removeAttribute("aria-expanded");
      this.focusOverlayToggle.removeAttribute("title");
    } else {
      this.focusOverlayToggle.setAttribute("aria-expanded", String(record.expanded === true));
      this.focusOverlayToggle.setAttribute(
        "title",
        `${this.focusOverlayToggle.getAttribute("aria-label") ?? ""}\n${this.callbacks.label("altBranchHint")}`,
      );
    }
    this.focusOverlay.style.left = `${point.x}px`;
    this.focusOverlay.style.top = `${point.y}px`;
    this.focusOverlay.style.width = `${point.width ?? NODE_GRAPH_CANVAS_NODE_WIDTH}px`;
    this.focusOverlay.hidden = false;
  }

  private updateDerivedState(): void {
    this.neighbors.clear();
    this.focusContextPaths.clear();
    if (this.focusPath === null) return;
    this.focusContextPaths.add(this.focusPath);
    let parentId: string | null = null;
    for (const edge of this.incidentStructureEdges.get(this.focusPath) ?? []) {
      const neighbor = edge.source === this.focusPath ? edge.target : edge.source;
      this.neighbors.add(neighbor);
      this.focusContextPaths.add(neighbor);
      if (edge.target === this.focusPath) parentId = edge.source;
    }
    if (parentId !== null) {
      for (const edge of this.incidentStructureEdges.get(parentId) ?? []) {
        if (edge.source === parentId) this.focusContextPaths.add(edge.target);
      }
    }
    for (const edge of this.incidentLinkEdges.get(this.focusPath) ?? []) {
      const neighbor = edge.source === this.focusPath ? edge.target : edge.source;
      this.neighbors.add(neighbor);
      this.focusContextPaths.add(neighbor);
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
    for (let index = this.visiblePoints.length - 1; index >= 0; index -= 1) {
      const point = this.visiblePoints[index];
      if (point === undefined) continue;
      if (nodeGraphBoxContains(this.presentationForPoint(point).box, { x, y })) return point.id;
    }
    return null;
  }

  private isToggleHit(path: string, x: number, y: number): boolean {
    if (this.callbacks.onToggle === undefined) return false;
    const record = this.data.records.get(path);
    const point = this.projectedById.get(path);
    if (record === undefined || point === undefined || (record.childCount ?? 0) <= 0) return false;
    const presentation = this.presentationForPoint(point);
    if (presentation.kind !== "card") return false;
    if (this.data.layout.direction === "top-to-bottom") {
      const zoneHeight = Math.max(20, Math.min(32, presentation.box.height * 0.38));
      return y >= presentation.box.y + presentation.box.height / 2 - zoneHeight;
    }
    const zoneWidth = Math.max(24, Math.min(44, presentation.box.width * 0.3));
    return x >= presentation.box.x + presentation.box.width / 2 - zoneWidth;
  }

  private presentationForPoint(point: NodeGraphCanvasPoint): CanvasNodePresentation {
    const geometry = nodeGraphCanvasGeometry(point.scale, point.width);
    const denseDot = this.dimension === "3d"
      && this.data.model.nodes.length > DENSE_3D_DOT_THRESHOLD
      && point.id !== this.focusPath
      && point.id !== this.hoveredPath;
    const kind = geometry.kind === "dot" || denseDot ? "dot" : "card";
    const radius = kind === "dot" ? denseDot ? 4 : geometry.radius : 0;
    const halfWidth = kind === "dot" ? radius : geometry.halfWidth;
    const halfHeight = kind === "dot" ? radius : geometry.halfHeight;
    return {
      box: nodeGraphBoxFromCenter(point.x, point.y, halfWidth, halfHeight),
      kind,
      label: kind === "card" && geometry.label,
      radius,
      scale: geometry.scale,
    };
  }

  private keyboardPaths(): readonly string[] {
    return [...this.data.model.nodes]
      .sort((left, right) => left.depth - right.depth)
      .map(({ id }) => id);
  }

  private selectFromCanvas(path: string | null, center: boolean): void {
    if (path === null && this.focusPath === null) return;
    this.focusPath = path;
    this.updateDerivedState();
    if (center && path !== null) this.centerOn(path);
    this.callbacks.onSelect(path);
    this.announceFocus();
    this.scheduleDraw();
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
    const boundary = record.boundary ? `\n${this.callbacks.label("boundaryNode")}` : "";
    const childCount = Math.max(0, record.childCount ?? 0);
    const toggleHint = childCount > 0 && this.isToggleHit(path, x, y)
      ? `\n${this.callbacks.toggleLabel?.(record.label, childCount, record.expanded === true)
        ?? `${record.expanded === true ? "Collapse" : "Expand"} ${record.label}; ${childCount}`}\n${this.callbacks.label("altBranchHint")}`
      : "";
    const hidden = record.hiddenSourcePath === null || record.hiddenSourcePath === undefined
      ? ""
      : `\n${this.callbacks.hiddenLabel?.(record.hiddenSourcePath, record.hiddenExplicit === true) ?? record.hiddenSourcePath}`;
    this.tooltip.setText(`${record.label}\n${path}${boundary}${hidden}\n${this.callbacks.relationSummary(counts.structure, counts.links)}${toggleHint}`);
    this.tooltip.style.left = `${Math.min(this.width - 16, x + 12)}px`;
    this.tooltip.style.top = `${Math.min(this.height - 16, y + 12)}px`;
    this.tooltip.hidden = false;
    this.scheduleDraw();
  }

  private hideTooltip(): void {
    this.hoveredPath = null;
    this.tooltip.hidden = true;
  }

  private announceFocus(): void {
    const record = this.focusPath === null ? undefined : this.data.records.get(this.focusPath);
    const baseLabel = this.callbacks.label("largeGraph");
    if (record === undefined) {
      this.canvas.setAttribute("aria-label", baseLabel);
      this.activeAnnouncement.setText("");
      return;
    }
    const counts = this.relationCounts.get(record.path) ?? { links: 0, structure: 0 };
    const hidden = record.hiddenSourcePath === null || record.hiddenSourcePath === undefined
      ? ""
      : `. ${this.callbacks.hiddenLabel?.(record.hiddenSourcePath, record.hiddenExplicit === true) ?? record.hiddenSourcePath}`;
    const announcement = `${record.label}. ${record.path}${hidden}. ${this.callbacks.relationSummary(counts.structure, counts.links)}`;
    this.canvas.setAttribute("aria-label", `${baseLabel}. ${announcement}`);
    this.activeAnnouncement.setText(announcement);
  }

  private readPalette(): CanvasPalette {
    const ownerWindow = this.surface.ownerDocument.defaultView;
    const style = ownerWindow?.getComputedStyle(this.surface);
    const color = (name: string, fallback: string): string => style?.getPropertyValue(name).trim() || fallback;
    return {
      accent: color("--interactive-accent", "#7c5cff"),
      background: color("--background-primary", "#1e1e1e"),
      border: color("--background-modifier-border-hover", "#666"),
      emojiFont: color("--folder-nodes-emoji-font", '"Segoe UI Emoji", emoji'),
      glyphFont: color("--folder-nodes-glyph-font", "sans-serif"),
      link: color("--interactive-accent", "#7c5cff"),
      mutedText: color("--text-muted", "#999"),
      node: color("--background-secondary", "#2b2b2b"),
      nodeHover: color("--background-modifier-hover", "#3b3b3b"),
      text: color("--text-normal", "#ddd"),
    };
  }

  private buildEdgeIndex(): void {
    for (const edge of this.structureEdges) {
      for (const path of [edge.source, edge.target]) {
        const incident = this.incidentStructureEdges.get(path) ?? [];
        incident.push(edge);
        this.incidentStructureEdges.set(path, incident);
        const counts = this.relationCounts.get(path) ?? { links: 0, structure: 0 };
        this.relationCounts.set(path, {
          links: counts.links,
          structure: counts.structure + 1,
        });
      }
    }
    for (const edge of this.linkEdges) {
      for (const path of [edge.source, edge.target]) {
        const incident = this.incidentLinkEdges.get(path) ?? [];
        incident.push(edge);
        this.incidentLinkEdges.set(path, incident);
        const counts = this.relationCounts.get(path) ?? { links: 0, structure: 0 };
        this.relationCounts.set(path, {
          links: counts.links + 1,
          structure: counts.structure,
        });
      }
    }
  }

  private bindThemeChanges(): void {
    const ownerDocument = this.surface.ownerDocument;
    const Observer = ownerDocument.defaultView?.MutationObserver;
    if (Observer === undefined) return;
    this.themeObserver = new Observer(() => this.refreshPalette());
    this.themeObserver.observe(ownerDocument.documentElement, {
      attributes: true,
      attributeFilter: ["class", "style"],
    });
    if (ownerDocument.body !== null) {
      this.themeObserver.observe(ownerDocument.body, {
        attributes: true,
        attributeFilter: ["class", "style"],
      });
    }
  }
}

function lineMightBeVisible(
  source: NodeGraphBox,
  target: NodeGraphBox,
  width: number,
  height: number,
): boolean {
  const padding = 32;
  return Math.max(source.x + source.width / 2, target.x + target.width / 2) >= -padding
    && Math.min(source.x - source.width / 2, target.x - target.width / 2) <= width + padding
    && Math.max(source.y + source.height / 2, target.y + target.height / 2) >= -padding
    && Math.min(source.y - source.height / 2, target.y - target.height / 2) <= height + padding;
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
