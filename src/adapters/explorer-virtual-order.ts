import type { TAbstractFile, TFolder } from "obsidian";
import { EXPLORER_ENTRY_TITLES_SELECTOR, EXPLORER_HOST } from "./explorer-host";

const MAX_REVEAL_LAYOUT_WAIT_MS = 1_000;

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
    frame: number | null;
    cancelLayoutWait: (() => void) | null;
  }
  let pending: RevealRequest | null = null;
  const owner = root.ownerDocument.defaultView;
  const clearReveal = (request = pending): void => {
    if (request === null || pending !== request) return;
    if (request.frame !== null) owner?.cancelAnimationFrame(request.frame);
    request.cancelLayoutWait?.();
    request.cancelLayoutWait = null;
    pending = null;
  };
  const userTakeover = (): void => { clearReveal(); };
  const inputEvents = ["wheel", "pointerdown", "touchstart", "keydown"] as const;
  for (const event of inputEvents) root.addEventListener(event, userTakeover, true);

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
  };
  const completeReveal = (request: RevealRequest | null): void => {
    if (disposed || request === null || pending !== request) return;
    request.completed = true;
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
      // Mobile revealLeaf() can return while the drawer is still animating.
      // Wait for that finite layout work, rather than expiring a missing row
      // after two frames or retaining ownership of unrelated future scrolling.
      const animations = activeLayoutAnimations(root);
      if (animations.length === 0) completeReveal(request);
      else {
        // A finite animation can later pause or become zero-speed. Never let
        // its unfinished promise retain reveal ownership indefinitely.
        let waiting = true;
        const timeout = owner.setTimeout(() => { clearReveal(request); }, MAX_REVEAL_LAYOUT_WAIT_MS);
        request.cancelLayoutWait = () => { waiting = false; owner.clearTimeout(timeout); };
        void Promise.allSettled(animations.map((animation) => animation.finished)).then(() => {
          if (!waiting) return;
          request.cancelLayoutWait?.();
          request.cancelLayoutWait = null;
          completeReveal(request);
        });
      }
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
        entry, path, completed: false, frame: null, cancelLayoutWait: null,
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
  const rect = target.getBoundingClientRect();
  const viewport = visibleRevealViewport(root, scroll, rect);
  if (rect.width <= 0 || rect.height <= 0 || viewport.bottom <= viewport.top) return false;

  let delta = 0;
  if (rect.top < viewport.top) delta = rect.top - viewport.top;
  else if (rect.bottom > viewport.bottom) delta = rect.bottom - viewport.bottom;
  if (Number.isFinite(delta) && Math.abs(delta) > 0.5) scroll.scrollTop += delta;

  const settled = target.getBoundingClientRect();
  return settled.width > 0 && settled.height > 0 &&
    settled.top >= viewport.top - 0.5 && settled.bottom <= viewport.bottom + 0.5;
}

function activeLayoutAnimations(root: HTMLElement): Animation[] {
  const animations = new Set<Animation>();
  for (let element: HTMLElement | null = root; element !== null; element = element.parentElement) {
    if (typeof element.getAnimations !== "function") continue;
    for (const animation of element.getAnimations()) {
      if ((animation.playState === "running" || animation.pending) && animation.playbackRate !== 0 &&
          Number.isFinite(animation.effect?.getComputedTiming().endTime)) animations.add(animation);
    }
  }
  return [...animations];
}

function visibleRevealViewport(root: HTMLElement, scroll: HTMLElement, target: DOMRect): { top: number; bottom: number } {
  const viewport = scroll.getBoundingClientRect();
  const owner = root.ownerDocument.defaultView;
  let { top, bottom } = viewport;
  for (let element = scroll.parentElement; element !== null; element = element.parentElement) {
    const style = owner?.getComputedStyle(element);
    if (!/^(auto|scroll|hidden|clip)$/u.test(style?.overflowY || style?.overflow || "")) continue;
    const bounds = element.getBoundingClientRect();
    if (bounds.height <= 0) continue;
    top = Math.max(top, bounds.top);
    bottom = Math.min(bottom, bounds.bottom);
  }
  const visual = owner?.visualViewport;
  if (visual !== null && visual !== undefined && visual.height > 0) {
    top = Math.max(top, visual.offsetTop);
    bottom = Math.min(bottom, visual.offsetTop + visual.height);
  }
  // The phone drawer's bottom toolbar overlays the scroll container instead of
  // reducing its clientHeight. A row behind it is not a successful reveal.
  for (const toolbar of root.querySelectorAll<HTMLElement>(".nav-buttons-container")) {
    const style = owner?.getComputedStyle(toolbar);
    if ((style?.position !== "absolute" && style?.position !== "fixed") ||
        style.visibility === "hidden" || style.visibility === "collapse" ||
        style.display === "none" || Number.parseFloat(style.opacity) === 0) continue;
    const bounds = toolbar.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0 || bounds.left >= target.right || bounds.right <= target.left) continue;
    if (bounds.top > top && bounds.top < bottom && bounds.bottom >= bottom) bottom = bounds.top;
    else if (bounds.top <= top && bounds.bottom > top && bounds.bottom < bottom) top = bounds.bottom;
  }
  return { top, bottom };
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
