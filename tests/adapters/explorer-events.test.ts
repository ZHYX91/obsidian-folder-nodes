import { describe, expect, it } from "vitest";
import { isFolderCollapseControl } from "../../src/adapters/explorer-events";

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
