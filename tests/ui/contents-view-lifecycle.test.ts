import { TFile, TFolder } from "obsidian";
import { describe, expect, it, vi } from "vitest";

import { FolderNodeContentsView } from "../../src/ui/contents-view";

function createView(): FolderNodeContentsView {
  const root = Object.assign(new TFolder(), { children: [], name: "", path: "" });
  const app = {
    vault: {
      getAbstractFileByPath: () => null,
      getName: () => "Lifecycle Vault",
      getRoot: () => root,
    },
    workspace: { activeEditor: null },
  };
  const service = {
    children: () => [],
    getCanonicalFile: () => null,
    getFile: () => null,
    getFolder: () => null,
    isCanonicalFile: () => false,
    isIgnoredPath: () => false,
    isIgnoredRootPath: () => false,
    isLeafNoteExempt: () => false,
    moveFile: vi.fn(async () => undefined),
    notePathForFolder: () => "Root.md",
    openFolderNode: vi.fn(async () => undefined),
    placeNode: vi.fn(async (folder: TFolder) => folder),
  };
  const actions = {
    createChild: vi.fn(),
    createMissingNote: vi.fn(),
    editVisual: vi.fn(),
    entryMenu: vi.fn(),
    homepageEnabled: () => false,
    nodeMenu: vi.fn(),
    openHomepage: vi.fn(),
    problemMenu: vi.fn(),
    refresh: vi.fn(),
    reportError: vi.fn(),
  };
  return new FolderNodeContentsView(
    { app } as never,
    service,
    { resolve: () => ({ kind: "fallback", value: "folder", accent: null, inheritedFrom: null }) as const },
    { isReferenced: () => true } as never,
    actions,
    false,
  );
}

describe("Node Contents render extension lifecycle", () => {
  it("filters hidden nodes and restores status during session reveal", async () => {
    const root = Object.assign(new TFolder(), { children: [], name: "", path: "" });
    const visible = Object.assign(new TFolder(), { children: [], name: "Visible", parent: root, path: "Visible" });
    const hidden = Object.assign(new TFolder(), { children: [], name: "Hidden", parent: root, path: "Hidden" });
    root.children.push(visible, hidden);
    const note = (folder: TFolder): TFile => Object.assign(new TFile(), {
      basename: folder.name, extension: "md", name: `${folder.name}.md`, parent: folder, path: `${folder.path}/${folder.name}.md`,
    });
    const notes = new Map([[visible.path, note(visible)], [hidden.path, note(hidden)]]);
    let reveal = false;
    const app = { vault: { getAbstractFileByPath: () => null, getName: () => "Vault", getRoot: () => root }, workspace: { activeEditor: null } };
    const service = {
      children: () => [
        { basename: "Visible", childPath: "Visible", order: null },
        { basename: "Hidden", childPath: "Hidden", order: null },
      ], getCanonicalFile: (path: string) => notes.get(path) ?? null,
      getFile: () => null, getFolder: (path: string) => path === "Visible" ? visible : path === "Hidden" ? hidden : null,
      isCanonicalFile: () => false, isIgnoredPath: () => false, isIgnoredRootPath: () => false, isLeafNoteExempt: () => false,
      hiddenState: (path: string) => ({ explicit: path === "Hidden", sourcePath: path === "Hidden" ? "Hidden" : null, unmanaged: false }),
      isNodeVisible: (path: string) => path !== "Hidden" || reveal, revealingHiddenNodes: () => reveal,
      moveFile: vi.fn(async () => undefined), notePathForFolder: () => "Vault.md", openFolderNode: vi.fn(async () => undefined), placeNode: vi.fn(async (folder: TFolder) => folder),
    };
    const actions = {
      createChild: vi.fn(), createMissingNote: vi.fn(), editVisual: vi.fn(), entryMenu: vi.fn(), homepageEnabled: () => false,
      nodeMenu: vi.fn(), openHomepage: vi.fn(), problemMenu: vi.fn(), refresh: vi.fn(), reportError: vi.fn(),
    };
    const view = new FolderNodeContentsView(
      { app } as never, service,
      { resolve: () => ({ kind: "fallback", value: "folder", accent: null, inheritedFrom: null }) as const },
      { isReferenced: () => false } as never, actions, false,
    );

    await view.onOpen();
    expect([...view.contentEl.querySelectorAll(".folder-nodes-card-title")].map((entry) => entry.textContent)).toEqual(["Visible"]);
    reveal = true;
    view.refresh();
    expect([...view.contentEl.querySelectorAll(".folder-nodes-card-title")].map((entry) => entry.textContent)).toEqual(["Visible", "Hidden"]);
    expect(view.contentEl.querySelector(".folder-nodes-hidden-status svg")).not.toBeNull();
    await view.onClose();
  });

  it("replaces the keyed extension and releases every callback on view close", async () => {
    for (let cycle = 0; cycle < 25; cycle += 1) {
      const view = createView();
      const first = vi.fn(() => undefined);
      const active = vi.fn(() => {
        if (view.contentEl.querySelector(":scope > .test-extension") !== null) return;
        view.contentEl.prepend(view.contentEl.ownerDocument.createElement("div"));
        view.contentEl.firstElementChild?.classList.add("test-extension");
      });
      await view.onOpen();
      view.setRenderExtension("node-graph", first);
      view.setRenderExtension("node-graph", active);
      view.refresh();
      expect(first).toHaveBeenCalledTimes(1);
      expect(active).toHaveBeenCalledTimes(2);
      expect(view.contentEl.querySelectorAll(":scope > .test-extension")).toHaveLength(1);

      await view.onClose();
      expect((view as unknown as { renderExtensions: Map<string, () => void> }).renderExtensions.size).toBe(0);
      view.refresh();
      expect(active).toHaveBeenCalledTimes(2);
    }
  });
});
