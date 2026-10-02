import type { TAbstractFile, TFolder } from "obsidian";
import { EXPLORER_ENTRY_TITLES_SELECTOR, EXPLORER_HOST } from "./explorer-host";

interface HostItem { file?: { path?: string }; }
interface HostSorter {
  getSortedFolderItems: (folder: TFolder) => unknown;
  sort: () => void;
  revealInFolder?: (entry: TAbstractFile) => Promise<void> | void;
  tree?: { infinityScroll?: unknown };
}

export interface ExplorerVirtualOrder {
  refresh(): void;
  settleReveal(): void;
  dispose(): void;
}

// The host's virtual children, geometry and DOM must share one order. Changing only
// the DOM leaves revealInFolder scrolling against the old virtual item positions.
export function installExplorerVirtualOrder(
  view: unknown,
  root: HTMLElement,
  orderFor: (folder: TFolder) => readonly string[] | null,
  revealPathFor: (entry: TAbstractFile) => string | null = (entry) => entry.path,
): ExplorerVirtualOrder | null {
  const host = view as HostSorter | null;
  if (typeof host?.getSortedFolderItems !== "function" || typeof host.sort !== "function" ||
    host.tree?.infinityScroll === undefined) return null;
  const original = host.getSortedFolderItems;
  const descriptor = Object.getOwnPropertyDescriptor(host, "getSortedFolderItems");
  const originalReveal = host.revealInFolder;
  const revealDescriptor = Object.getOwnPropertyDescriptor(host, "revealInFolder");
  let disposed = false;
  let pendingRevealPath: string | null = null;

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

  const settleReveal = (): void => {
    if (disposed || pendingRevealPath === null) return;
    if (ensureRevealTargetVisible(root, pendingRevealPath)) pendingRevealPath = null;
  };

  let wrappedReveal: HostSorter["revealInFolder"];
  if (typeof originalReveal === "function") {
    wrappedReveal = function(this: HostSorter, entry: TAbstractFile): Promise<void> | void {
      try { pendingRevealPath = revealPathFor(entry); } catch { pendingRevealPath = null; }
      let result: Promise<void> | void;
      try {
        result = originalReveal.call(this, entry);
      } catch (error) {
        pendingRevealPath = null;
        throw error;
      }
      if (isPromiseLike(result)) {
        return Promise.resolve(result).then(
          () => { settleReveal(); },
          (error: unknown) => {
            pendingRevealPath = null;
            throw error;
          },
        );
      }
      settleReveal();
      return result;
    };
    try { host.revealInFolder = wrappedReveal; } catch { wrappedReveal = undefined; }
  }

  const refresh = () => {
    const scroll = root.querySelector<HTMLElement>(EXPLORER_HOST.filesContainer);
    const viewport = scroll?.getBoundingClientRect();
    const anchor = viewport === undefined ? undefined : Array.from(root.querySelectorAll(EXPLORER_ENTRY_TITLES_SELECTOR)).find((element) => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && rect.bottom > viewport.top && rect.top < viewport.bottom;
    });
    const before = anchor?.getBoundingClientRect().top;
    host.sort();
    if (scroll !== null && anchor !== undefined && before !== undefined && anchor.isConnected) {
      const delta = anchor.getBoundingClientRect().top - before;
      if (Number.isFinite(delta) && Math.abs(delta) > 0.5) scroll.scrollTop += delta;
    }
    settleReveal();
  };

  return {
    refresh: () => { if (!disposed) refresh(); },
    settleReveal,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      pendingRevealPath = null;
      if (host.getSortedFolderItems === wrapped) {
        if (descriptor === undefined) delete (host as Partial<HostSorter>).getSortedFolderItems;
        else Object.defineProperty(host, "getSortedFolderItems", descriptor);
      }
      if (wrappedReveal !== undefined && host.revealInFolder === wrappedReveal) {
        if (revealDescriptor === undefined) delete host.revealInFolder;
        else Object.defineProperty(host, "revealInFolder", revealDescriptor);
      }
      refresh();
    },
  };
}

function ensureRevealTargetVisible(root: HTMLElement, path: string): boolean {
  const target = findRevealTarget(root, path);
  if (target === null) return false;
  const scroll = target.closest<HTMLElement>(EXPLORER_HOST.filesContainer) ??
    root.querySelector<HTMLElement>(EXPLORER_HOST.filesContainer);
  if (scroll === null) return false;
  const viewport = scroll.getBoundingClientRect();
  const rect = target.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return false;

  let delta = 0;
  if (rect.top < viewport.top) delta = rect.top - viewport.top;
  else if (rect.bottom > viewport.bottom) delta = rect.bottom - viewport.bottom;
  if (Number.isFinite(delta) && Math.abs(delta) > 0.5) scroll.scrollTop += delta;

  const settled = target.getBoundingClientRect();
  return settled.width > 0 && settled.height > 0 &&
    settled.top >= viewport.top - 0.5 && settled.bottom <= viewport.bottom + 0.5;
}

function findRevealTarget(root: HTMLElement, path: string): HTMLElement | null {
  if (path === "") return root.querySelector<HTMLElement>(".folder-nodes-explorer-root");
  for (const title of root.querySelectorAll<HTMLElement>(EXPLORER_ENTRY_TITLES_SELECTOR)) {
    if (title.dataset.path === path) return title;
  }
  return null;
}

function isPromiseLike(value: Promise<void> | void): value is Promise<void> {
  return value !== undefined && typeof (value as PromiseLike<void>).then === "function";
}
