import { describe, expect, it, vi } from "vitest";
import {
  alignNoteTitleIcon,
  ensureExplorerIconPosition,
  ensureExplorerRootRow,
  ensureNoteTitleIcon,
  explorerMarkerPlacement,
  isFolderCollapseControl,
  removeNoteTitleIcon,
  syncExplorerNodeOrder,
} from "../../src/adapters/explorer-events";

describe("File Explorer disclosure controls", () => {
  it("recognizes the current Obsidian collapse icon and its SVG descendants", () => {
    const icon = document.createElement("div");
    icon.className = "tree-item-icon collapse-icon";
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    svg.append(path);
    icon.append(svg);

    expect(isFolderCollapseControl(icon)).toBe(true);
    expect(isFolderCollapseControl(path)).toBe(true);
  });

  it("keeps compatibility with the legacy indicator without treating the title as disclosure", () => {
    const legacy = document.createElement("span");
    legacy.className = "nav-folder-collapse-indicator";
    const title = document.createElement("span");
    title.className = "nav-folder-title-content";

    expect(isFolderCollapseControl(legacy)).toBe(true);
    expect(isFolderCollapseControl(title)).toBe(false);
    expect(isFolderCollapseControl(null)).toBe(false);
  });
});

describe("File Explorer visual placement", () => {
  it("retains a default node marker when custom icons are hidden or missing", () => {
    expect(explorerMarkerPlacement("hidden", false)).toEqual({ position: "before", useDefault: true });
    expect(explorerMarkerPlacement("after", true)).toEqual({ position: "after", useDefault: true });
    expect(explorerMarkerPlacement("after", false)).toEqual({ position: "after", useDefault: false });
  });

  it("stops mutating after an icon reaches its requested position", async () => {
    const row = document.createElement("div");
    const title = document.createElement("span");
    title.className = "nav-folder-title-content";
    row.append(title);
    const icon = document.createElement("span");
    icon.className = "folder-nodes-explorer-icon";
    let callbacks = 0;
    const observer = new MutationObserver(() => {
      callbacks += 1;
      ensureExplorerIconPosition(row, icon, title, "before");
    });
    observer.observe(row, { childList: true });

    expect(ensureExplorerIconPosition(row, icon, title, "before")).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(callbacks).toBe(1);
    expect(ensureExplorerIconPosition(row, icon, title, "before")).toBe(false);
    observer.disconnect();
  });

  it("moves an existing icon only when its requested side changes", () => {
    const row = document.createElement("div");
    const title = document.createElement("span");
    const icon = document.createElement("span");
    row.append(icon, title);

    expect(ensureExplorerIconPosition(row, icon, title, "before")).toBe(false);
    expect(ensureExplorerIconPosition(row, icon, title, "after")).toBe(true);
    expect(ensureExplorerIconPosition(row, icon, title, "after")).toBe(false);
  });
});

describe("File Explorer root row", () => {
  it("creates one stable, non-collapsible row at the top", () => {
    const container = document.createElement("div");
    const tree = document.createElement("div");
    container.append(tree);

    const first = ensureExplorerRootRow(container);
    const second = ensureExplorerRootRow(container);

    expect(first.row).toBe(second.row);
    expect(container.firstElementChild).toBe(first.row);
    expect(container.querySelectorAll(".folder-nodes-explorer-root")).toHaveLength(1);
    expect(first.row.getAttribute("draggable")).toBe("false");
    expect(first.row.querySelector(".collapse-icon")).toBeNull();
    expect(isFolderCollapseControl(first.row)).toBe(false);
  });
});

describe("File Explorer node ordering", () => {
  function folder(path: string): HTMLElement {
    const wrapper = document.createElement("div");
    wrapper.className = "nav-folder";
    const title = document.createElement("div");
    title.className = "nav-folder-title";
    title.dataset.path = path;
    wrapper.append(title);
    return wrapper;
  }

  it("reorders only managed node slots and leaves ordinary entries anchored", () => {
    const container = document.createElement("div");
    const first = folder("生活/餐饮");
    const file = document.createElement("div");
    file.className = "nav-file";
    const third = folder("生活/宠物");
    const unmanaged = folder("生活/_附件");
    const second = folder("生活/购物");
    container.append(first, file, third, unmanaged, second);

    expect(syncExplorerNodeOrder(container, ["生活/餐饮", "生活/购物", "生活/宠物"])).toBe(true);
    expect(Array.from(container.children)).toEqual([first, file, second, unmanaged, third]);
    expect(syncExplorerNodeOrder(container, ["生活/餐饮", "生活/购物", "生活/宠物"])).toBe(false);
  });

  it("settles after one mutation-observer refresh", async () => {
    const container = document.createElement("div");
    const first = folder("A");
    const second = folder("B");
    container.append(second, first);
    let callbacks = 0;
    const observer = new MutationObserver(() => {
      callbacks += 1;
      syncExplorerNodeOrder(container, ["A", "B"]);
    });
    observer.observe(container, { childList: true });

    expect(syncExplorerNodeOrder(container, ["A", "B"])).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(callbacks).toBe(1);
    expect(Array.from(container.children)).toEqual([first, second]);
    observer.disconnect();
  });
});

describe("inline title decoration", () => {
  it("keeps visual text outside the editable title and aligns to its first line inside a padded host", () => {
    const host = document.createElement("div");
    const title = document.createElement("div");
    title.className = "inline-title";
    title.contentEditable = "true";
    title.textContent = "Node";
    title.style.fontSize = "40px";
    title.style.lineHeight = "48px";
    title.style.paddingTop = "18px";
    host.append(title);
    document.body.append(host);
    Object.defineProperties(host, {
      clientLeft: { configurable: true, value: 3 },
      clientTop: { configurable: true, value: 2 },
      clientWidth: { configurable: true, value: 594 },
      offsetWidth: { configurable: true, value: 600 },
      scrollLeft: { configurable: true, value: 7 },
      scrollTop: { configurable: true, value: 5 },
    });
    host.getBoundingClientRect = () => ({ bottom: 440, height: 400, left: 20, right: 620, top: 40, width: 600, x: 20, y: 40, toJSON: () => ({}) });
    title.getBoundingClientRect = () => ({ bottom: 208, height: 96, left: 68, right: 500, top: 112, width: 432, x: 68, y: 112, toJSON: () => ({}) });
    const createRange = vi.spyOn(document, "createRange").mockReturnValue({
      getBoundingClientRect: () => ({ bottom: 180, height: 40, left: 68, right: 96, top: 140, width: 28, x: 68, y: 140, toJSON: () => ({}) }),
      setEnd: vi.fn(),
      setStart: vi.fn(),
    } as unknown as Range);

    const icon = ensureNoteTitleIcon(title);
    icon.textContent = "📔";

    expect(title.contains(icon)).toBe(false);
    expect(title.textContent).toBe("Node");
    expect(icon.contentEditable).toBe("false");
    expect(icon.nextElementSibling).toBe(title);
    alignNoteTitleIcon(title, icon);
    expect(icon.style.getPropertyValue("--folder-nodes-note-title-font-size")).toBe("40px");
    expect(icon.style.getPropertyValue("--folder-nodes-note-title-offset")).toBe("106px");
    expect(icon.style.getPropertyValue("--folder-nodes-note-title-inline-offset")).toBe("8px");
    removeNoteTitleIcon(title);
    expect(host.querySelector(".folder-nodes-note-title-icon")).toBeNull();
    expect(title.classList.contains("folder-nodes-has-title-icon")).toBe(false);
    createRange.mockRestore();
    host.remove();
  });
});
