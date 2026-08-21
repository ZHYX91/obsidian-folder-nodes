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
