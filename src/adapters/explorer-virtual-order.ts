import type { TAbstractFile, TFolder } from "obsidian";
import { EXPLORER_ENTRY_TITLES_SELECTOR, EXPLORER_HOST } from "./explorer-host";

interface HostItem { file?: { path?: string }; }
interface HostSorter {
  getSortedFolderItems: (folder: TFolder) => unknown;
  sort: () => void;
  revealInFolder?: (entry: TAbstractFile) => Promise<void> | void;
  revealActiveFile?: () => void;
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
  const originalActiveReveal = host.revealActiveFile;
  const activeRevealDescriptor = Object.getOwnPropertyDescriptor(host, "revealActiveFile");
  let disposed = false;
  let sortingForRefresh = false;
  interface RevealRequest {
    entry: TAbstractFile;
    path: string;
    completed: boolean;
    scrollTop: number | undefined;
    frame: number | null;
  }
  let pending: RevealRequest | null = null;
  const owner = root.ownerDocument.defaultView;
  const scrollContainer = () => root.querySelector<HTMLElement>(EXPLORER_HOST.filesContainer);
  const clearReveal = (request = pending): void => {
    if (request === null || pending !== request) return;
    if (request.frame !== null) owner?.cancelAnimationFrame(request.frame);
    pending = null;
  };
  const userTakeover = (): void => { clearReveal(); };
  const scrolled = (): void => {
    if (pending?.completed) pending.scrollTop = scrollContainer()?.scrollTop;
  };
  const inputEvents = ["wheel", "pointerdown", "touchstart", "keydown"] as const;
  for (const event of inputEvents) root.addEventListener(event, userTakeover, true);
  root.addEventListener("scroll", scrolled, true);

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

  try { host.getSortedFolderItems = wrapped; } catch {
    for (const event of inputEvents) root.removeEventListener(event, userTakeover, true);
    root.removeEventListener("scroll", scrolled, true);
    return null;
  }

  const settleReveal = (): void => {
    const request = pending;
    if (disposed || request === null || !request.completed) return;
    let currentPath: string | null;
    try { currentPath = revealPathFor(request.entry); } catch { currentPath = null; }
    if (currentPath !== request.path) {
      clearReveal(request);
      return;
    }
    ensureRevealTargetVisible(root, request.path);
    request.scrollTop = scrollContainer()?.scrollTop;
  };
  const completeReveal = (request: RevealRequest | null): void => {
    if (disposed || request === null || pending !== request) return;
    request.completed = true;
    request.scrollTop = scrollContainer()?.scrollTop;
    settleReveal();
    if (pending !== request) return;
    // Only the next rendering opportunity belongs to this explicit reveal.
    // A missing/hidden/clamped row must not retain ownership of future scrolling.
    if (owner === null) { clearReveal(request); return; }
    request.frame = owner.requestAnimationFrame(() => {
      if (pending !== request) return;
      request.frame = null;
      settleReveal();
      clearReveal(request);
    });
  };

  const completeVoidRevealAfterHostFrame = (request: RevealRequest | null): void => {
    if (disposed || request === null || pending !== request) return;
    if (owner === null) {
      completeReveal(request);
      return;
    }
    request.frame = owner.requestAnimationFrame(() => {
      if (pending !== request) return;
      request.frame = null;
      completeReveal(request);
    });
  };

  let wrappedActiveReveal: HostSorter["revealActiveFile"];
  if (typeof originalActiveReveal === "function") {
    wrappedActiveReveal = function(this: HostSorter): void {
      // File Explorer sort() auto-reveals the active file directly through
      // revealActiveFile(). Folder Nodes owns this sort call, so preserve the
      // current viewport instead. Native host calls outside refresh pass through.
      if (sortingForRefresh) return;
      originalActiveReveal.call(this);
    };
    try { host.revealActiveFile = wrappedActiveReveal; } catch { wrappedActiveReveal = undefined; }
  }

  let wrappedReveal: HostSorter["revealInFolder"];
  if (typeof originalReveal === "function") {
    wrappedReveal = function(this: HostSorter, entry: TAbstractFile): Promise<void> | void {
      if (disposed) return originalReveal.call(this, entry);
      if (sortingForRefresh) return undefined;
      clearReveal();
      let path: string | null;
      try { path = revealPathFor(entry); } catch { path = null; }
      const request: RevealRequest | null = path === null ? null : {
        entry, path, completed: false, scrollTop: undefined, frame: null,
      };
      pending = request;
      let result: Promise<void> | void;
      try {
        result = originalReveal.call(this, entry);
      } catch (error) {
        clearReveal(request);
        throw error;
      }
      if (isPromiseLike(result)) {
        return Promise.resolve(result).then(
          () => { completeReveal(request); },
          (error: unknown) => {
            clearReveal(request);
            throw error;
          },
        );
      }
      completeVoidRevealAfterHostFrame(request);
      return result;
    };
    try { host.revealInFolder = wrappedReveal; } catch { wrappedReveal = undefined; }
  }

  const refresh = () => {
    scrolled();
    const scroll = root.querySelector<HTMLElement>(EXPLORER_HOST.filesContainer);
    const viewport = scroll?.getBoundingClientRect();
    const anchor = viewport === undefined ? undefined : Array.from(root.querySelectorAll(EXPLORER_ENTRY_TITLES_SELECTOR)).find((element) => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && rect.bottom > viewport.top && rect.top < viewport.bottom;
    });
    const before = anchor?.getBoundingClientRect().top;
    sortingForRefresh = true;
    try {
      host.sort();
    } finally {
      sortingForRefresh = false;
    }
    if (scroll !== null && anchor !== undefined && before !== undefined && anchor.isConnected) {
      const delta = anchor.getBoundingClientRect().top - before;
      if (Number.isFinite(delta) && Math.abs(delta) > 0.5) scroll.scrollTop += delta;
    }
    // Sorting/anchor compensation and host programmatic scrolling inside the
    // bounded reveal window are ours; explicit user input still cancels it.
    if (pending?.completed) pending.scrollTop = scrollContainer()?.scrollTop;
    settleReveal();
  };

  return {
    refresh: () => { if (!disposed) refresh(); },
    settleReveal,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      clearReveal();
      for (const event of inputEvents) root.removeEventListener(event, userTakeover, true);
      root.removeEventListener("scroll", scrolled, true);
      if (host.getSortedFolderItems === wrapped) {
        if (descriptor === undefined) delete (host as Partial<HostSorter>).getSortedFolderItems;
        else Object.defineProperty(host, "getSortedFolderItems", descriptor);
      }
      if (wrappedReveal !== undefined && host.revealInFolder === wrappedReveal) {
        if (revealDescriptor === undefined) delete host.revealInFolder;
        else Object.defineProperty(host, "revealInFolder", revealDescriptor);
      }
      // Restore native item order without letting this plugin-owned sort invoke
      // File Explorer's active-file auto-reveal.
      refresh();
      if (wrappedActiveReveal !== undefined && host.revealActiveFile === wrappedActiveReveal) {
        if (activeRevealDescriptor === undefined) delete host.revealActiveFile;
        else Object.defineProperty(host, "revealActiveFile", activeRevealDescriptor);
      }
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
