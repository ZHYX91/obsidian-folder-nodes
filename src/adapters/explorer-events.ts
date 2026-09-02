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

export interface ExplorerRootRow {
  row: HTMLElement;
  icon: HTMLElement;
  title: HTMLElement;
  badge: HTMLElement;
  visibility: HTMLButtonElement;
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

export function alignNoteTitleIcon(title: HTMLElement, icon: HTMLElement): void {
  const host = title.parentElement;
  if (host === null) return;
  const computed = title.ownerDocument.defaultView?.getComputedStyle(title);
  const parsedFontSize = Number.parseFloat(computed?.fontSize ?? "");
  const fontSize = Number.isFinite(parsedFontSize) && parsedFontSize > 0 ? parsedFontSize : 16;
  const parsedLineHeight = Number.parseFloat(computed?.lineHeight ?? "");
  const lineHeight = Number.isFinite(parsedLineHeight) && parsedLineHeight > 0 ? parsedLineHeight : fontSize * 1.2;
  const parsedPaddingBlockStart = Number.parseFloat(computed?.paddingBlockStart ?? "");
  const parsedPaddingTop = Number.parseFloat(computed?.paddingTop ?? "");
  const paddingBlockStart = Number.isFinite(parsedPaddingBlockStart) && parsedPaddingBlockStart > 0
    ? parsedPaddingBlockStart
    : Number.isFinite(parsedPaddingTop) && parsedPaddingTop > 0 ? parsedPaddingTop : 0;
  const iconSize = fontSize * 0.85;
  const iconGap = fontSize * 0.25;
  const titleRect = title.getBoundingClientRect();
  const firstLineRect = firstTitleLineRect(title);
  const hostRect = host.getBoundingClientRect();
  const lineTop = firstLineRect?.top ?? titleRect.top + paddingBlockStart;
  const measuredLineHeight = firstLineRect?.height ?? lineHeight;
  const blockOffset = lineTop - hostRect.top - host.clientTop + host.scrollTop + Math.max(0, (measuredLineHeight - iconSize) / 2);
  const rightBorder = Math.max(0, host.offsetWidth - host.clientWidth - host.clientLeft);
  const titleInlineOffset = computed?.direction === "rtl"
    ? hostRect.right - titleRect.right - rightBorder
    : titleRect.left - hostRect.left - host.clientLeft + host.scrollLeft;
  const inlineOffset = titleInlineOffset - iconSize - iconGap;
  icon.style.setProperty("--folder-nodes-note-title-font-size", `${fontSize}px`);
  icon.style.setProperty("--folder-nodes-note-title-offset", `${Math.max(0, blockOffset)}px`);
  icon.style.setProperty("--folder-nodes-note-title-inline-offset", `${inlineOffset}px`);
}

function firstTitleLineRect(title: HTMLElement): DOMRect | null {
  const view = title.ownerDocument.defaultView;
  const walker = title.ownerDocument.createTreeWalker(title, view?.NodeFilter.SHOW_TEXT ?? 4);
  const node = walker.nextNode();
  if (node === null || node.nodeType !== 3 || node.textContent === null || node.textContent.length === 0) return null;
  const text = node as Text;
  const range = title.ownerDocument.createRange();
  range.setStart(text, 0);
  range.setEnd(text, 1);
  const rect = range.getBoundingClientRect();
  return rect.height > 0 ? rect : null;
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
    row.className = "folder-nodes-explorer-root";
    row.tabIndex = 0;
    row.setAttribute("role", "treeitem");
    row.setAttribute("draggable", "false");

    const icon = container.ownerDocument.createElement("span");
    icon.className = "folder-nodes-explorer-root-icon";
    icon.dataset.role = "icon";
    const title = container.ownerDocument.createElement("span");
    title.className = "folder-nodes-explorer-root-title";
    title.dataset.role = "title";
    const badge = container.ownerDocument.createElement("span");
    badge.className = "folder-nodes-explorer-root-badge";
    badge.dataset.role = "badge";
    const visibility = container.ownerDocument.createElement("button");
    visibility.type = "button";
    visibility.className = "clickable-icon folder-nodes-explorer-root-visibility";
    visibility.dataset.role = "visibility";
    row.append(icon, title, badge, visibility);
  }
  if (container.firstElementChild !== row) container.prepend(row);
  const icon = row.querySelector<HTMLElement>(":scope > [data-role=icon]");
  const title = row.querySelector<HTMLElement>(":scope > [data-role=title]");
  const badge = row.querySelector<HTMLElement>(":scope > [data-role=badge]");
  const visibility = row.querySelector<HTMLButtonElement>(":scope > [data-role=visibility]");
  if (icon === null || title === null || badge === null || visibility === null) throw new Error("Invalid Folder Nodes root row");
  return { row, icon, title, badge, visibility };
}

function isElementTarget(target: EventTarget | null): target is Element {
  return target !== null && typeof (target as Element).closest === "function";
}
