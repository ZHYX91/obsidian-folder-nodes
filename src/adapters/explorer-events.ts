export function isFolderCollapseControl(target: EventTarget | null): boolean {
  return isElementTarget(target) && target.closest(
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

export function setNativeCreateActionsHidden(container: HTMLElement, labels: ReadonlySet<string>, hidden: boolean): number {
  let matched = 0;
  for (const action of container.querySelectorAll<HTMLElement>(":scope > [aria-label]")) {
    const label = action.getAttribute("aria-label");
    if (label === null || !labels.has(label)) continue;
    action.classList.toggle("folder-nodes-native-create-hidden", hidden);
    matched += 1;
  }
  return matched;
}

export interface ExplorerRootRow {
  row: HTMLElement;
  icon: HTMLElement;
  title: HTMLElement;
  badge: HTMLElement;
}

export function ensureNoteTitleIcon(title: HTMLElement): HTMLElement {
  const host = title.parentElement;
  if (host === null) throw new Error("Inline title has no host element");
  let icon = host.querySelector<HTMLElement>(":scope > .folder-nodes-note-title-icon");
  if (icon === null) {
    icon = title.ownerDocument.createElement("span");
    icon.className = "folder-nodes-note-title-icon";
    icon.contentEditable = "false";
    icon.setAttribute("aria-hidden", "true");
    host.insertBefore(icon, title);
  }
  host.classList.add("folder-nodes-note-title-host");
  title.classList.add("folder-nodes-has-title-icon");
  return icon;
}

export function removeNoteTitleIcon(title: HTMLElement): void {
  const host = title.parentElement;
  host?.querySelector(":scope > .folder-nodes-note-title-icon")?.remove();
  host?.classList.remove("folder-nodes-note-title-host");
  title.classList.remove("folder-nodes-has-title-icon");
}

export function ensureExplorerRootRow(container: HTMLElement): ExplorerRootRow {
  let row = container.querySelector<HTMLElement>(":scope > .folder-nodes-explorer-root");
  if (row === null) {
    row = container.ownerDocument.createElement("div");
    row.className = "tree-item-self nav-file-title folder-nodes-explorer-root";
    row.tabIndex = 0;
    row.setAttribute("role", "treeitem");
    row.setAttribute("draggable", "false");

    const icon = container.ownerDocument.createElement("span");
    icon.className = "folder-nodes-explorer-root-icon";
    icon.dataset.role = "icon";
    const title = container.ownerDocument.createElement("span");
    title.className = "nav-file-title-content folder-nodes-explorer-root-title";
    title.dataset.role = "title";
    const badge = container.ownerDocument.createElement("span");
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

function isElementTarget(target: EventTarget | null): target is Element {
  return target !== null && typeof (target as Element).closest === "function";
}
