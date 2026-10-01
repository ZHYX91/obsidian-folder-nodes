import type { TFolder } from "obsidian";

// Keep optional private-host capabilities guarded. The host owns its current sort.
export function nativeExplorerOrder(view: unknown, folder: TFolder | null): Element[] | null {
  const host = view as { getSortedFolderItems?: (folder: TFolder) => unknown } | null;
  if (folder === null || typeof host?.getSortedFolderItems !== "function") return null;
  try {
    const items = host.getSortedFolderItems(folder);
    if (!Array.isArray(items)) return null;
    const elements: Element[] = [];
    for (const item of items) {
      const element = (item as { el?: Element } | null)?.el;
      if (element === undefined || element.nodeType !== 1) return null;
      elements.push(element);
    }
    return elements;
  } catch {
    return null;
  }
}

export function restoreExplorerOrder(container: HTMLElement, order: readonly Element[]): void {
  const survivors = order.filter((element) => element.parentElement === container);
  const owned = new Set(survivors);
  const slots = Array.from(container.children).filter((element) => owned.has(element));
  if (slots.every((element, index) => element === survivors[index])) return;
  const markers = slots.map((element) => {
    const marker = container.ownerDocument.createComment("folder-nodes-restore-order");
    container.insertBefore(marker, element);
    return marker;
  });
  markers.forEach((marker, index) => marker.replaceWith(survivors[index]!));
}
