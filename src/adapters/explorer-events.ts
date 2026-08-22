export function isFolderCollapseControl(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(
    ".nav-folder-collapse-indicator, .tree-item-icon.collapse-icon",
  ) !== null;
}

export function ensureExplorerIconPosition(
  container: HTMLElement,
  icon: HTMLElement,
  title: HTMLElement | null,
  position: "before" | "after",
): boolean {
  if (title === null) {
    const positioned = icon.parentElement === container &&
      (position === "before" ? container.firstChild === icon : container.lastChild === icon);
    if (positioned) return false;
    if (position === "before") container.prepend(icon);
    else container.append(icon);
    return true;
  }

  const positioned = icon.parentElement === container &&
    (position === "before" ? icon.nextSibling === title : title.nextSibling === icon);
  if (positioned) return false;
  if (position === "before") container.insertBefore(icon, title);
  else title.insertAdjacentElement("afterend", icon);
  return true;
}

export function explorerMarkerPlacement(
  configured: "after" | "before" | "hidden",
  fallbackVisual: boolean,
): { position: "after" | "before"; useDefault: boolean } {
  return {
    position: configured === "after" ? "after" : "before",
    useDefault: configured === "hidden" || fallbackVisual,
  };
}

export function syncExplorerNodeOrder(container: HTMLElement, orderedPaths: readonly string[]): boolean {
  const order = new Map(orderedPaths.map((path, index) => [path, index]));
  const slots = Array.from(container.children).filter((child) => {
    const title = child.matches(".nav-folder-title[data-path]")
      ? child
      : child.querySelector(":scope > .nav-folder-title[data-path]");
    const path = title?.getAttribute("data-path");
    return path !== null && path !== undefined && order.has(path);
  });
  const pathFor = (element: Element): string => {
    const title = element.matches(".nav-folder-title[data-path]")
      ? element
      : element.querySelector(":scope > .nav-folder-title[data-path]");
    return title?.getAttribute("data-path") ?? "";
  };
  const desired = [...slots].sort((left, right) =>
    (order.get(pathFor(left)) ?? Number.MAX_SAFE_INTEGER) - (order.get(pathFor(right)) ?? Number.MAX_SAFE_INTEGER));
  if (slots.every((element, index) => element === desired[index])) return false;

  const markers = slots.map((element) => {
    const marker = container.ownerDocument.createComment("folder-nodes-order-slot");
    container.insertBefore(marker, element);
    return marker;
  });
  markers.forEach((marker, index) => marker.replaceWith(desired[index]!));
  return true;
}

export interface ExplorerRootRow {
  row: HTMLElement;
  icon: HTMLElement;
  title: HTMLElement;
  badge: HTMLElement;
}

export function ensureExplorerRootRow(container: HTMLElement): ExplorerRootRow {
  let row = container.querySelector<HTMLElement>(":scope > .folder-nodes-explorer-root");
  if (row === null) {
    row = document.createElement("div");
    row.className = "tree-item-self nav-file-title folder-nodes-explorer-root";
    row.tabIndex = 0;
    row.setAttribute("role", "treeitem");
    row.setAttribute("draggable", "false");

    const icon = document.createElement("span");
    icon.className = "folder-nodes-explorer-root-icon";
    icon.dataset.role = "icon";
    const title = document.createElement("span");
    title.className = "nav-file-title-content folder-nodes-explorer-root-title";
    title.dataset.role = "title";
    const badge = document.createElement("span");
    badge.className = "folder-nodes-explorer-root-badge";
    badge.dataset.role = "badge";
    row.append(icon, title, badge);
  }
  if (container.firstElementChild !== row) container.prepend(row);
  const icon = row.querySelector<HTMLElement>(":scope > [data-role=icon]");
  const title = row.querySelector<HTMLElement>(":scope > [data-role=title]");
  const badge = row.querySelector<HTMLElement>(":scope > [data-role=badge]");
  if (icon === null || title === null || badge === null) throw new Error("Invalid Folder Nodes root row");
  return { row, icon, title, badge };
}
