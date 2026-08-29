import { ItemView, setIcon, TFile, TFolder, WorkspaceLeaf } from "obsidian";

import { layoutNodeGraph, type NodeGraphTree } from "../core/node-graph-layout";
import type { NodeVisual } from "../core/types";
import { normalizeVaultPath } from "../core/paths";
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
}

export const NODE_GRAPH_VIEW_TYPE = "folder-nodes-node-graph";

export class FolderNodeGraphView extends ItemView {
  private focusPath: string | null = null;
  private readonly nodeElements = new Map<string, HTMLElement>();

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
  public override async onClose(): Promise<void> { this.nodeElements.clear(); }

  public setFocus(path: string | null): void {
    this.focusPath = path === null ? null : normalizeVaultPath(path);
    this.applyFocus(true);
  }

  public refresh(): void { this.render(); }

  private render(): void {
    this.nodeElements.clear();
    this.contentEl.empty();
    this.contentEl.addClass("folder-nodes-node-graph-view");

    const toolbar = this.contentEl.createDiv({ cls: "folder-nodes-node-graph-toolbar" });
    const title = toolbar.createDiv({ cls: "folder-nodes-node-graph-title", text: label("nodeGraph") });
    title.setAttr("title", label("structureOnly"));
    const fit = toolbar.createEl("button", { cls: "clickable-icon", attr: { "aria-label": label("fitGraph") } });
    setIcon(fit, "maximize-2");

    const scroll = this.contentEl.createDiv({ cls: "folder-nodes-node-graph-scroll" });
    const root = this.app.vault.getRoot();
    const graph = this.buildTree(root);
    const layout = layoutNodeGraph(graph);
    const canvas = scroll.createDiv({ cls: "folder-nodes-node-graph-canvas" });
    canvas.style.width = `${layout.width}px`;
    canvas.style.height = `${layout.height}px`;

    const svg = canvas.createSvg("svg", {
      cls: "folder-nodes-node-graph-edges",
      attr: {
        width: String(layout.width),
        height: String(layout.height),
        viewBox: `0 0 ${layout.width} ${layout.height}`,
        "aria-hidden": "true",
      },
    });
    const positions = new Map(layout.nodes.map((node) => [node.id, node]));
    for (const edge of layout.edges) {
      const source = positions.get(edge.source);
      const target = positions.get(edge.target);
      if (source === undefined || target === undefined) continue;
      svg.createSvg("line", {
        attr: {
          x1: String(source.x + layout.nodeWidth / 2),
          y1: String(source.y + layout.nodeHeight),
          x2: String(target.x + layout.nodeWidth / 2),
          y2: String(target.y),
        },
      });
    }

    const records = this.collectRecords(root);
    for (const position of layout.nodes) {
      const record = records.get(position.id);
      if (record === undefined) continue;
      const node = canvas.createEl("button", {
        cls: "folder-nodes-node-graph-node",
        attr: { "data-node-path": record.path, title: record.path === "" ? this.app.vault.getName() : record.path },
      });
      node.style.left = `${position.x}px`;
      node.style.top = `${position.y}px`;
      node.style.width = `${layout.nodeWidth}px`;
      node.style.height = `${layout.nodeHeight}px`;
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
      this.nodeElements.set(record.path, node);
    }

    fit.addEventListener("click", () => this.fit(scroll, layout.width, layout.height));
    this.applyFocus(true);
  }

  private buildTree(folder: TFolder): NodeGraphTree {
    const path = normalizeVaultPath(folder.path);
    return {
      id: path,
      children: this.service.children(path).flatMap(({ childPath }) => {
        const child = this.service.getFolder(childPath);
        return child === null ? [] : [this.buildTree(child)];
      }),
    };
  }

  private collectRecords(root: TFolder): Map<string, GraphRecord> {
    const records = new Map<string, GraphRecord>();
    const visit = (folder: TFolder): void => {
      const path = normalizeVaultPath(folder.path);
      records.set(path, {
        path,
        label: path === "" ? this.app.vault.getName() : folder.name,
        folder,
      });
      for (const { childPath } of this.service.children(path)) {
        const child = this.service.getFolder(childPath);
        if (child !== null) visit(child);
      }
    };
    visit(root);
    return records;
  }

  private applyFocus(scrollIntoView: boolean): void {
    for (const [path, element] of this.nodeElements) element.toggleClass("is-focused", path === this.focusPath);
    if (!scrollIntoView || this.focusPath === null) return;
    this.nodeElements.get(this.focusPath)?.scrollIntoView({ block: "center", inline: "center" });
  }

  private fit(scroll: HTMLElement, width: number, height: number): void {
    const left = Math.max(0, (width - scroll.clientWidth) / 2);
    const top = Math.max(0, (height - scroll.clientHeight) / 2);
    scroll.scrollTo({ left, top, behavior: "smooth" });
  }
}

function label(key: "fitGraph" | "nodeGraph" | "structureOnly"): string {
  const zh = resolvedLanguage() === "zh-CN";
  if (key === "nodeGraph") return zh ? "节点图谱" : "Node Graph";
  if (key === "fitGraph") return zh ? "适应视图" : "Fit graph";
  return zh ? "Folder Node 结构视图" : "Folder Node structure view";
}
