import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

function methodSource(source: string, start: string, end: string): string {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex);

  expect(startIndex).toBeGreaterThanOrEqual(0);
  expect(endIndex).toBeGreaterThan(startIndex);
  return source.slice(startIndex, endIndex);
}

describe("Node Contents menu boundary", () => {
  const source = readFileSync(resolve(process.cwd(), "src/app/plugin.ts"), "utf8");

  it("keeps healthy and problem Node menus owned by Folder Nodes", () => {
    const problemMenu = methodSource(source, "public openProblemMenu", "private addProblemMenuItems");
    const nodeMenu = methodSource(source, "public openNodeMenu", "protected contributeNodeActions");
    const actions = methodSource(source, "private buildNodeActions", "private openEntryMenu");

    expect(problemMenu).not.toContain('workspace.trigger("file-menu"');
    expect(nodeMenu).not.toContain('workspace.trigger("file-menu"');
    expect(problemMenu).toContain('t("revealInExplorer")');
    expect(nodeMenu).toContain('t("nodeActions")');
    expect(nodeMenu).toContain('t("createChild")');
    expect(actions).toContain('t("revealInExplorer")');
    expect(actions).toContain('t("hideNodeSubtree")');
    expect(actions).toContain('t("deleteNodeSubtree")');
  });

  it("continues to expose ordinary Files entries to other plugins", () => {
    const entryMenu = methodSource(source, "private openEntryMenu", "private async runRepair");

    expect(entryMenu).toContain('workspace.trigger("file-menu", menu, entry, CONTENTS_MENU_SOURCE)');
  });

  it("keeps native folder operations and labels whole-node actions on Node Note tabs", () => {
    const contextMenu = methodSource(source, "private addContextMenu", "private addNativeNodeMenuItems");
    const nodeItems = methodSource(source, "private addNativeNodeMenuItems", "private openEntryMenu");
    const actions = methodSource(source, "private buildNodeActions", "private openEntryMenu");

    expect(contextMenu).toContain('"native-folder"');
    expect(contextMenu).toContain('"native-note"');
    expect(nodeItems).toContain('t("nodeActions")');
    expect(actions).toContain('surface !== "native-folder"');
    expect(actions).toContain('t("rename")');
    expect(actions).toContain('t("setUnmanagedSubtree")');
  });
});
