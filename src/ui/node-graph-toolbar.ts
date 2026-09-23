import { SearchComponent, setIcon, setTooltip } from "obsidian";

import type { NodeGraphDimension } from "../core/types";

export interface NodeGraphToolbarLabels {
  readonly clearSearch: string;
  readonly dimension: string;
  readonly expandRange: string;
  readonly expandRangeTooltip: string;
  readonly findNode: string;
  readonly fitGraph: string;
  readonly globalScope: string;
  readonly globalScopeTooltip: string;
  readonly localScope: string;
  readonly localScopeTooltip: string;
  readonly noLinks: string;
  readonly nodeGraph: string;
  readonly scope: string;
  readonly selectNodeFirst: string;
  readonly showLinks: string;
  readonly showLinksTooltip: string;
  readonly subtreeScope: string;
  readonly subtreeScopeTooltip: string;
  readonly viewportHelp: string;
  readonly zoomIn: string;
  readonly zoomOut: string;
  readonly zoomReset: string;
  readonly zoomLevel: string;
}

export interface NodeGraphToolbarModel {
  readonly dimension: NodeGraphDimension;
  readonly focusPath: string | null;
  readonly linkSummary: string;
  readonly scopeLabel: string;
  readonly scopeMode: "global" | "local" | "subtree";
  readonly searchQuery: string;
  readonly showLinks: boolean;
  readonly visibleLinks: number;
}

export interface NodeGraphToolbarActions {
  readonly onDimension: (dimension: NodeGraphDimension) => void;
  readonly onExpansionMenu: (anchor: HTMLElement) => void;
  readonly onLocalScope: () => void;
  readonly onReturnGlobal: () => void;
  readonly onSearchChange: (value: string) => void;
  readonly onSearchEnter: () => boolean;
  readonly onShowLinks: () => void;
  readonly onSubtreeScope: () => void;
}

export function renderNodeGraphToolbar(
  container: HTMLElement,
  model: NodeGraphToolbarModel,
  labels: NodeGraphToolbarLabels,
  actions: NodeGraphToolbarActions,
): HTMLElement {
  const toolbar = container.createDiv({ cls: "folder-nodes-node-graph-toolbar" });
  const primary = toolbar.createDiv({ cls: "folder-nodes-node-graph-toolbar-primary" });
  const secondary = toolbar.createDiv({ cls: "folder-nodes-node-graph-toolbar-secondary" });
  primary.createDiv({ cls: "folder-nodes-node-graph-title", text: labels.nodeGraph });

  const searchHost = primary.createDiv({ cls: "folder-nodes-node-graph-search" });
  const search = new SearchComponent(searchHost)
    .setPlaceholder(labels.findNode)
    .setValue(model.searchQuery)
    .onChange(actions.onSearchChange);
  search.inputEl.setAttribute("aria-label", labels.findNode);
  search.inputEl.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      search.setValue("");
      actions.onSearchChange("");
      return;
    }
    if (event.key !== "Enter" || !actions.onSearchEnter()) return;
    event.preventDefault();
  });
  setTooltip(search.inputEl, labels.findNode);
  search.clearButtonEl.setAttribute("aria-label", labels.clearSearch);
  setTooltip(search.clearButtonEl, labels.clearSearch);

  const linksToggle = primary.createEl("button", {
    cls: `folder-nodes-node-graph-links-toggle${model.showLinks ? " is-active" : ""}`,
    attr: {
      "aria-checked": String(model.showLinks),
      "aria-label": labels.showLinksTooltip,
      role: "switch",
      type: "button",
    },
  });
  linksToggle.createSpan({ text: labels.showLinks });
  linksToggle.createSpan({
    cls: "folder-nodes-node-graph-toggle-track",
    attr: { "aria-hidden": "true" },
  });
  setTooltip(linksToggle, labels.showLinksTooltip);
  linksToggle.addEventListener("click", actions.onShowLinks);

  if (model.showLinks) {
    const summary = primary.createSpan({
      cls: `folder-nodes-node-graph-link-summary${model.visibleLinks === 0 ? " is-empty" : ""}`,
      attr: { role: "status" },
    });
    summary.createSpan({
      cls: "folder-nodes-node-graph-link-swatch",
      attr: { "aria-hidden": "true" },
    });
    summary.createSpan({ text: model.visibleLinks === 0 ? labels.noLinks : model.linkSummary });
  }

  const scope = toolbar.createDiv({
    cls: "folder-nodes-node-graph-scope",
    attr: { "aria-label": labels.scope, "data-node-graph-scope": model.scopeMode },
  });
  secondary.append(scope);
  scope.createSpan({ cls: "folder-nodes-node-graph-scope-path", text: model.scopeLabel });
  scopeButton(scope, labels.globalScope, labels.globalScopeTooltip, actions.onReturnGlobal, model.scopeMode === "global");
  scopeButton(scope, labels.subtreeScope, labels.subtreeScopeTooltip, actions.onSubtreeScope, model.focusPath === null, "subtree", labels.selectNodeFirst);
  scopeButton(scope, labels.localScope, labels.localScopeTooltip, actions.onLocalScope, model.focusPath === null, "local", labels.selectNodeFirst);

  const range = secondary.createEl("button", {
    cls: "folder-nodes-node-graph-range-button",
    attr: { "aria-haspopup": "menu", "aria-label": labels.expandRangeTooltip, type: "button" },
  });
  range.createSpan({ text: labels.expandRange });
  setIcon(range.createSpan({ cls: "folder-nodes-node-graph-range-chevron" }), "chevron-down");
  setTooltip(range, labels.expandRangeTooltip);
  range.addEventListener("click", () => actions.onExpansionMenu(range));

  const dimension = primary.createDiv({
    cls: "folder-nodes-node-graph-switch",
    attr: { "aria-label": labels.dimension, "data-node-graph-switch": "dimension" },
  });
  for (const mode of ["2d", "3d"] as const) {
    switchButton(dimension, mode.toUpperCase(), model.dimension === mode, labels.dimension, () => actions.onDimension(mode));
  }

  const viewport = primary.createDiv({
    cls: "folder-nodes-node-graph-viewport-controls",
    attr: { "aria-label": labels.viewportHelp },
  });
  const zoomOut = viewport.createEl("button", {
    cls: "clickable-icon",
    attr: { "aria-label": labels.zoomOut, "data-node-graph-action": "zoom-out", type: "button" },
  });
  setIcon(zoomOut, "minus");
  setTooltip(zoomOut, labels.zoomOut);

  const zoomReset = viewport.createEl("button", {
    cls: "folder-nodes-node-graph-zoom-level",
    text: "100%",
    attr: { "aria-label": labels.zoomLevel, "data-node-graph-action": "zoom-reset", type: "button" },
  });
  setTooltip(zoomReset, labels.zoomReset);

  const zoomIn = viewport.createEl("button", {
    cls: "clickable-icon",
    attr: { "aria-label": labels.zoomIn, "data-node-graph-action": "zoom-in", type: "button" },
  });
  setIcon(zoomIn, "plus");
  setTooltip(zoomIn, labels.zoomIn);

  const fit = viewport.createEl("button", {
    cls: "clickable-icon",
    attr: { "aria-label": labels.fitGraph, "data-node-graph-action": "fit", type: "button" },
  });
  setIcon(fit, "maximize-2");
  setTooltip(fit, labels.fitGraph);

  const help = viewport.createSpan({
    cls: "folder-nodes-node-graph-viewport-help",
    attr: { "aria-label": labels.viewportHelp, role: "img", tabindex: "0" },
  });
  setIcon(help, "circle-help");
  setTooltip(help, labels.viewportHelp);
  return toolbar;
}

function switchButton(
  container: HTMLElement,
  text: string,
  active: boolean,
  dimensionLabel: string,
  onClick: () => void,
): void {
  const button = container.createEl("button", {
    cls: `folder-nodes-node-graph-switch-button${active ? " is-active" : ""}`,
    text,
    attr: { "aria-pressed": String(active) },
  });
  setTooltip(button, `${text} ${dimensionLabel}`);
  button.addEventListener("click", onClick);
}

function scopeButton(
  container: HTMLElement,
  text: string,
  tooltip: string,
  onClick: () => void,
  disabled = false,
  action: "local" | "subtree" | null = null,
  selectNodeFirst = "",
): void {
  const button = container.createEl("button", {
    cls: "folder-nodes-node-graph-scope-button",
    text,
    attr: { type: "button", ...(action === null ? {} : { "data-node-graph-scope-action": action }) },
  });
  button.disabled = disabled;
  const description = disabled && action !== null ? selectNodeFirst : tooltip;
  button.setAttribute("aria-label", description);
  button.title = description;
  setTooltip(button, description);
  button.addEventListener("click", onClick);
}
