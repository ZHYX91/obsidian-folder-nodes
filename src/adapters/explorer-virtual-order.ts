import type { TFolder } from "obsidian";
import { EXPLORER_ENTRY_TITLES_SELECTOR, EXPLORER_HOST } from "./explorer-host";

interface HostItem { file?: { path?: string }; }
interface HostSorter {
  getSortedFolderItems: (folder: TFolder) => unknown;
  sort: () => void;
  tree?: { infinityScroll?: unknown };
}

export interface ExplorerVirtualOrder {
  refresh(): void;
  dispose(): void;
}

// The host's virtual children, geometry and DOM must share one order. Changing only
// the DOM leaves revealInFolder scrolling against the old virtual item positions.
export function installExplorerVirtualOrder(
  view: unknown,
  root: HTMLElement,
  orderFor: (folder: TFolder) => readonly string[] | null,
): ExplorerVirtualOrder | null {
  const host = view as HostSorter | null;
  if (typeof host?.getSortedFolderItems !== "function" || typeof host.sort !== "function" ||
    host.tree?.infinityScroll === undefined) return null;
  const original = host.getSortedFolderItems;
  const descriptor = Object.getOwnPropertyDescriptor(host, "getSortedFolderItems");
  let disposed = false;
  const wrapped = function(this: HostSorter, folder: TFolder): unknown {
    const items = original.call(this, folder);
    if (disposed || !Array.isArray(items)) return items;
    let paths: readonly string[] | null;
    try { paths = orderFor(folder); } catch { return items; }
    if (paths === null) return items;
    const order = new Map(paths.map((path, index) => [path, index]));
    const indices: number[] = [];
    const managed: HostItem[] = [];
    for (const [index, item] of items.entries()) {
      const path = (item as HostItem | null)?.file?.path;
      if (path === undefined || !order.has(path)) continue;
      indices.push(index);
      managed.push(item as HostItem);
    }
    const sorted = [...managed].sort((left, right) => order.get(left.file!.path!)! - order.get(right.file!.path!)!);
    if (managed.every((item, index) => item === sorted[index])) return items;
    const result: unknown[] = [...(items as unknown[])];
    indices.forEach((index, offset) => { result[index] = sorted[offset]; });
    return result;
  };
  try { host.getSortedFolderItems = wrapped; } catch { return null; }
  const refresh = () => {
    const scroll = root.querySelector<HTMLElement>(EXPLORER_HOST.filesContainer);
    const viewport = scroll?.getBoundingClientRect();
    const anchor = viewport === undefined ? undefined : Array.from(root.querySelectorAll(EXPLORER_ENTRY_TITLES_SELECTOR)).find((element) => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && rect.bottom > viewport.top && rect.top < viewport.bottom;
    });
    const before = anchor?.getBoundingClientRect().top;
    host.sort();
    if (scroll === null || anchor === undefined || before === undefined || !anchor.isConnected) return;
    const delta = anchor.getBoundingClientRect().top - before;
    if (Number.isFinite(delta) && Math.abs(delta) > 0.5) scroll.scrollTop += delta;
  };
  return {
    refresh: () => { if (!disposed) refresh(); },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      if (host.getSortedFolderItems === wrapped) {
        if (descriptor === undefined) delete (host as Partial<HostSorter>).getSortedFolderItems;
        else Object.defineProperty(host, "getSortedFolderItems", descriptor);
      }
      refresh();
    },
  };
}
