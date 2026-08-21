import { describe, expect, it } from "vitest";
import {
  ensureExplorerIconPosition,
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
