import { describe, expect, it } from "vitest";
import {
  ensureExplorerIconPosition,
  ensureExplorerRootRow,
  explorerMarkerPlacement,
  isFolderCollapseControl,
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
