import { setIcon } from "obsidian";

import { normalizeVaultPath } from "../core/paths";
import { resolvedLanguage } from "./i18n";
import { FolderNodeGraphView } from "./node-graph-view";

export class PolishedFolderNodeGraphView extends FolderNodeGraphView {
  private observer: MutationObserver | null = null;
  private selectedPath: string | null = null;
  private searchQuery = "";
  private decorating = false;

  private readonly handleGraphClick = (event: MouseEvent): void => {
    const target = event.target as Element | null;
    const node = target?.closest<HTMLElement>(".folder-nodes-node-graph-node") ?? null;
    if (node === null) return;
    const path = node.dataset.nodePath;
    if (path === undefined) return;
    this.selectedPath = normalizeVaultPath(path);
    queueMicrotask(() => this.applyNeighborhood());
  };

  public override async onOpen(): Promise<void> {
    await super.onOpen();
    this.contentEl.addClass("is-polished");
    this.contentEl.addEventListener("click", this.handleGraphClick);
    this.observer = new MutationObserver(() => this.decorate());
    this.observer.observe(this.contentEl, { childList: true, subtree: true });
    this.decorate();
  }

  public override async onClose(): Promise<void> {
    this.observer?.disconnect();
    this.observer = null;
    this.contentEl.removeEventListener("click", this.handleGraphClick);
    await super.onClose();
  }

  public override setFocus(path: string | null): void {
    this.selectedPath = path === null ? null : normalizeVaultPath(path);
    super.setFocus(path);
    queueMicrotask(() => this.applyNeighborhood());
  }

  private decorate(): void {
    if (this.decorating) return;
    this.decorating = true;
    try {
      this.contentEl.addClass("is-polished");
      const toolbar = this.contentEl.querySelector<HTMLElement>(".folder-nodes-node-graph-toolbar");
      if (toolbar !== null) this.decorateToolbar(toolbar);
      this.decorateNodes();
      this.ensureLegend();
      this.ensureEmptyState();
      this.ensure3DHint();
      this.highlightSearch(this.searchQuery);
      this.applyNeighborhood();
    } finally {
      this.decorating = false;
    }
  }

  private decorateToolbar(toolbar: HTMLElement): void {
    if (toolbar.dataset.nodeGraphPolished === "true") return;
    const title = toolbar.querySelector<HTMLElement>(":scope > .folder-nodes-node-graph-title");
    const switches = [...toolbar.querySelectorAll<HTMLElement>(":scope > .folder-nodes-node-graph-switch")];
    const relation = switches[0] ?? null;
    const dimension = switches[1] ?? null;
    const fit = toolbar.querySelector<HTMLElement>(":scope > [data-node-graph-action='fit']");
    if (title === null || relation === null || dimension === null || fit === null) return;

    toolbar.dataset.nodeGraphPolished = "true";
    toolbar.addClass("is-polished");
    const primary = toolbar.createDiv({ cls: "folder-nodes-node-graph-toolbar-primary" });
    const secondary = toolbar.createDiv({ cls: "folder-nodes-node-graph-toolbar-secondary" });
    primary.append(title);

    const search = primary.createDiv({ cls: "folder-nodes-node-graph-search" });
    const searchIcon = search.createSpan({ cls: "folder-nodes-node-graph-search-icon", attr: { "aria-hidden": "true" } });
    setIcon(searchIcon, "search");
    const input = search.createEl("input", {
      cls: "folder-nodes-node-graph-search-input",
      attr: {
        type: "search",
        placeholder: text("findNode"),
        "aria-label": text("findNode"),
        autocomplete: "off",
        spellcheck: "false",
      },
    });
    input.value = this.searchQuery;
    input.addEventListener("input", () => {
      this.searchQuery = input.value;
      this.highlightSearch(this.searchQuery);
    });
    input.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        input.value = "";
        this.searchQuery = "";
        this.highlightSearch("");
        return;
      }
      if (event.key !== "Enter") return;
      const match = this.firstSearchMatch(input.value);
      if (match === null) return;
      event.preventDefault();
      this.setFocus(match);
    });

    primary.append(dimension, fit);
    secondary.createSpan({ cls: "folder-nodes-node-graph-toolbar-label", text: text("relationships") });
    secondary.append(relation);
  }

  private decorateNodes(): void {
    const lines = [...this.contentEl.querySelectorAll<SVGLineElement>(".folder-nodes-node-graph-edges line")];
    for (const node of this.graphNodeElements()) {
      const path = node.dataset.nodePath;
      if (path === undefined) continue;
      const baseTitle = node.dataset.nodeGraphBaseTitle ?? node.getAttribute("title") ?? path;
      node.dataset.nodeGraphBaseTitle = baseTitle;
      const structure = lines.filter((line) => line.classList.contains("is-structure") && touches(line, path)).length;
      const links = lines.filter((line) => line.classList.contains("is-link") && touches(line, path)).length;
      node.setAttribute("title", `${baseTitle}\n${text("structureCount", structure)} · ${text("linkCount", links)}`);
      if (!node.classList.contains("is-3d")) continue;
      node.removeClass("is-depth-near", "is-depth-mid", "is-depth-far");
      const scale = parseScale(node.style.transform);
      node.addClass(scale >= 1.02 ? "is-depth-near" : scale >= 0.82 ? "is-depth-mid" : "is-depth-far");
    }
  }

  private ensureLegend(): void {
    this.contentEl.querySelector(":scope > .folder-nodes-node-graph-legend")?.remove();
    const hasStructure = this.contentEl.querySelector("line.is-structure") !== null;
    const hasLinks = this.contentEl.querySelector("line.is-link") !== null;
    if (!hasStructure && !hasLinks) return;
    const legend = this.contentEl.createDiv({ cls: "folder-nodes-node-graph-legend", attr: { "aria-label": text("legend") } });
    if (hasStructure) this.legendItem(legend, "is-structure", text("structure"));
    if (hasLinks) this.legendItem(legend, "is-link", text("links"));
  }

  private legendItem(legend: HTMLElement, kind: "is-link" | "is-structure", label: string): void {
    const item = legend.createSpan({ cls: "folder-nodes-node-graph-legend-item" });
    item.createSpan({ cls: `folder-nodes-node-graph-legend-line ${kind}`, attr: { "aria-hidden": "true" } });
    item.createSpan({ text: label });
  }

  private ensureEmptyState(): void {
    this.contentEl.querySelector(":scope > .folder-nodes-node-graph-empty")?.remove();
    const active = this.activeRelationMode();
    if (active !== "links" || this.contentEl.querySelector("line.is-link") !== null) return;
    const empty = this.contentEl.createDiv({ cls: "folder-nodes-node-graph-empty" });
    empty.createDiv({ cls: "folder-nodes-node-graph-empty-title", text: text("noLinks") });
    empty.createDiv({ cls: "folder-nodes-node-graph-empty-description", text: text("noLinksDesc") });
  }

  private ensure3DHint(): void {
    this.contentEl.querySelector(":scope > .folder-nodes-node-graph-3d-hint")?.remove();
    if (!this.contentEl.hasClass("is-3d")) return;
    this.contentEl.createDiv({ cls: "folder-nodes-node-graph-3d-hint", text: text("threeDHint") });
  }

  private applyNeighborhood(): void {
    const selected = this.selectedPath;
    const lines = [...this.contentEl.querySelectorAll<SVGLineElement>(".folder-nodes-node-graph-edges line")];
    const neighbors = new Set<string>();
    if (selected !== null) {
      for (const line of lines) {
        const source = line.dataset.edgeSource;
        const target = line.dataset.edgeTarget;
        if (source === selected && target !== undefined) neighbors.add(target);
        else if (target === selected && source !== undefined) neighbors.add(source);
      }
    }
    for (const node of this.graphNodeElements()) {
      const path = node.dataset.nodePath;
      const neighbor = path !== undefined && neighbors.has(path);
      node.toggleClass("is-neighbor", neighbor);
      node.toggleClass("is-muted", selected !== null && path !== selected && !neighbor);
    }
    for (const line of lines) {
      const connected = selected !== null && touches(line, selected);
      line.toggleClass("is-connected", connected);
      line.toggleClass("is-muted", selected !== null && !connected);
    }
  }

  private highlightSearch(rawQuery: string): void {
    const query = rawQuery.trim().toLocaleLowerCase();
    for (const node of this.graphNodeElements()) {
      const path = node.dataset.nodePath ?? "";
      const label = node.querySelector(".folder-nodes-node-graph-label")?.textContent ?? "";
      const match = query !== "" && `${label}\n${path}`.toLocaleLowerCase().includes(query);
      node.toggleClass("is-search-match", match);
    }
  }

  private firstSearchMatch(rawQuery: string): string | null {
    const query = rawQuery.trim().toLocaleLowerCase();
    if (query === "") return null;
    const candidates = this.graphNodeElements().flatMap((node) => {
      const path = node.dataset.nodePath;
      if (path === undefined) return [];
      const label = node.querySelector(".folder-nodes-node-graph-label")?.textContent ?? "";
      const normalizedLabel = label.toLocaleLowerCase();
      const normalizedPath = path.toLocaleLowerCase();
      if (!normalizedLabel.includes(query) && !normalizedPath.includes(query)) return [];
      const rank = normalizedLabel === query ? 0 : normalizedLabel.startsWith(query) ? 1 : normalizedPath.startsWith(query) ? 2 : 3;
      return [{ path, rank, label: normalizedLabel }];
    });
    candidates.sort((left, right) => left.rank - right.rank || left.label.localeCompare(right.label, "en"));
    return candidates[0]?.path ?? null;
  }

  private activeRelationMode(): "hybrid" | "links" | "structure" | null {
    const secondary = this.contentEl.querySelector(".folder-nodes-node-graph-toolbar-secondary");
    const active = secondary?.querySelector<HTMLButtonElement>(".folder-nodes-node-graph-switch-button.is-active");
    const value = active?.textContent?.trim().toLocaleLowerCase() ?? "";
    if (value === "links" || value === "链接") return "links";
    if (value === "hybrid" || value === "混合") return "hybrid";
    if (value === "structure" || value === "结构") return "structure";
    return null;
  }

  private graphNodeElements(): HTMLElement[] {
    return [...this.contentEl.querySelectorAll<HTMLElement>(".folder-nodes-node-graph-node")];
  }
}

function touches(line: SVGLineElement, path: string): boolean {
  return line.dataset.edgeSource === path || line.dataset.edgeTarget === path;
}

function parseScale(transform: string): number {
  const match = /scale\(([-+0-9.eE]+)\)/u.exec(transform);
  const scale = Number(match?.[1] ?? 1);
  return Number.isFinite(scale) ? scale : 1;
}

function text(
  key: "findNode" | "legend" | "links" | "noLinks" | "noLinksDesc" | "relationships" | "structure" | "threeDHint",
): string;
function text(key: "linkCount" | "structureCount", count: number): string;
function text(key: string, count?: number): string {
  const zh = resolvedLanguage() === "zh-CN";
  const dictionary: Record<string, [string, string]> = {
    findNode: ["查找节点", "Find node"],
    legend: ["关系图例", "Relationship legend"],
    links: ["链接", "Links"],
    noLinks: ["没有 Folder Node 链接", "No links between Folder Nodes"],
    noLinksDesc: ["仅显示 canonical Node Note 之间可解析的链接。", "Only resolved links between canonical Node Notes appear here."],
    relationships: ["关系", "Relationships"],
    structure: ["结构", "Structure"],
    threeDHint: ["拖动旋转 · Shift/中键拖动平移 · 滚轮缩放", "Drag to rotate · Shift/middle drag to pan · Wheel to zoom"],
  };
  if (key === "structureCount") return zh ? `结构 ${count ?? 0}` : `Structure ${count ?? 0}`;
  if (key === "linkCount") return zh ? `链接 ${count ?? 0}` : `Links ${count ?? 0}`;
  const pair = dictionary[key] ?? [key, key];
  return zh ? pair[0] : pair[1];
}
