import { App, TFile, TFolder } from "obsidian";
import { describe, expect, it, vi } from "vitest";
import { Window } from "happy-dom";

import { ExplorerAdapter } from "../../src/adapters/explorer-adapter";
import type { NodeService } from "../../src/adapters/node-service";
import type { VisualService } from "../../src/adapters/visual-service";
import { DEFAULT_SETTINGS } from "../../src/shared/settings";

describe("Explorer reveal window affinity", () => {
  it("synchronizes materialized virtual children before revealing and restores the sorter on stop", async () => {
    const root = document.createElement("div");
    document.body.append(root);
    const folder = Object.assign(new TFolder(), { path: "Parent" });
    const items = ["Parent/A", "Parent/B"].map((path) => ({ file: { path } }));
    let virtual = items;
    const original = (parent: TFolder) => parent === folder ? items : [];
    const view = {
      containerEl: root, tree: { infinityScroll: {} }, getSortedFolderItems: original,
      sort: () => { virtual = view.getSortedFolderItems(folder); },
      revealInFolder: vi.fn(() => { expect(virtual.map(({ file }) => file.path)).toEqual(["Parent/B", "Parent/A"]); }),
    };
    const leaf = { view };
    const app = { workspace: {
      getLeavesOfType: (type: string) => type === "file-explorer" ? [leaf] : [],
      getMostRecentLeaf: () => leaf, revealLeaf: async () => undefined,
    } } as unknown as App;
    const adapter = new ExplorerAdapter(app, {
      isNodeVisible: () => true, sortMode: () => "manual",
      children: () => [{ childPath: "Parent/B" }, { childPath: "Parent/A" }],
    } as unknown as NodeService, {} as VisualService, () => structuredClone(DEFAULT_SETTINGS),
    () => ({ createNode: "", incompleteNode: "", missingNodeFolder: "", missingNodeNote: "",
      node: "", nodeConflict: "", root: "", unmanaged: "" }),
    () => undefined, () => undefined, () => undefined, () => undefined);
    try {
      expect(await adapter.reveal(Object.assign(new TFile(), { path: "Parent/B/B.md" }))).toBe(true);
      expect(view.revealInFolder).toHaveBeenCalledOnce();
      adapter.stop();
      expect(view.getSortedFolderItems).toBe(original);
      expect(virtual).toBe(items);
    } finally { adapter.stop(); root.remove(); }
  });

  it("prefers the File Explorer in the most recent workspace document", async () => {
    const firstDocument = new Window().document as unknown as Document;
    const secondDocument = new Window().document as unknown as Document;
    const firstReveal = vi.fn(async () => undefined);
    const secondReveal = vi.fn(async () => undefined);
    const firstLeaf = {
      view: { containerEl: firstDocument.createElement("div"), revealInFolder: firstReveal },
    };
    const secondLeaf = {
      view: { containerEl: secondDocument.createElement("div"), revealInFolder: secondReveal },
    };
    const recentLeaf = { view: { containerEl: secondDocument.createElement("div") } };
    const revealLeaf = vi.fn(async () => undefined);
    const app = {
      workspace: {
        getLeavesOfType: () => [firstLeaf, secondLeaf],
        getMostRecentLeaf: () => recentLeaf,
        revealLeaf,
      },
    } as unknown as App;
    const adapter = new ExplorerAdapter(
      app,
      { isNodeVisible: () => true } as unknown as NodeService,
      {} as VisualService,
      () => structuredClone(DEFAULT_SETTINGS),
      () => ({
        createNode: "", incompleteNode: "", missingNodeFolder: "", missingNodeNote: "",
        node: "", nodeConflict: "", root: "", unmanaged: "",
      }),
      () => undefined,
      () => undefined,
      () => undefined,
      () => undefined,
    );
    const file = Object.assign(new TFile(), { path: "A.md" });

    expect(await adapter.reveal(file)).toBe(true);
    expect(firstReveal).not.toHaveBeenCalled();
    expect(revealLeaf).toHaveBeenCalledWith(secondLeaf);
    expect(secondReveal).toHaveBeenCalledWith(file);
    expect(revealLeaf.mock.invocationCallOrder[0]).toBeLessThan(secondReveal.mock.invocationCallOrder[0]!);
  });


  it("re-reads the Explorer view after revealing a deferred leaf", async () => {
    const ownerDocument = new Window().document as unknown as Document;
    const revealInFolder = vi.fn(async () => undefined);
    const deferredView = { containerEl: ownerDocument.createElement("div") };
    const loadedView = { containerEl: deferredView.containerEl, revealInFolder };
    let currentView = deferredView;
    const leaf = {
      get view() { return currentView; },
    };
    const revealLeaf = vi.fn(async () => { currentView = loadedView; });
    const app = {
      workspace: {
        getLeavesOfType: () => [leaf],
        getMostRecentLeaf: () => ({ view: { containerEl: ownerDocument.createElement("div") } }),
        revealLeaf,
      },
    } as unknown as App;
    const adapter = new ExplorerAdapter(
      app,
      { isNodeVisible: () => true } as unknown as NodeService,
      {} as VisualService,
      () => structuredClone(DEFAULT_SETTINGS),
      () => ({
        createNode: "", incompleteNode: "", missingNodeFolder: "", missingNodeNote: "",
        node: "", nodeConflict: "", root: "", unmanaged: "",
      }),
      () => undefined,
      () => undefined,
      () => undefined,
      () => undefined,
    );
    const file = Object.assign(new TFile(), { path: "Deferred.md" });

    expect(await adapter.reveal(file)).toBe(true);
    expect(revealLeaf).toHaveBeenCalledWith(leaf);
    expect(revealInFolder).toHaveBeenCalledWith(file);
  });

  it("returns false after revealing when the materialized view has no reveal capability", async () => {
    const ownerDocument = new Window().document as unknown as Document;
    const leaf = { view: { containerEl: ownerDocument.createElement("div") } };
    const revealLeaf = vi.fn(async () => undefined);
    const app = {
      workspace: {
        getLeavesOfType: () => [leaf],
        getMostRecentLeaf: () => null,
        revealLeaf,
      },
    } as unknown as App;
    const adapter = new ExplorerAdapter(
      app,
      { isNodeVisible: () => true } as unknown as NodeService,
      {} as VisualService,
      () => structuredClone(DEFAULT_SETTINGS),
      () => ({
        createNode: "", incompleteNode: "", missingNodeFolder: "", missingNodeNote: "",
        node: "", nodeConflict: "", root: "", unmanaged: "",
      }),
      () => undefined,
      () => undefined,
      () => undefined,
      () => undefined,
    );

    expect(await adapter.reveal(Object.assign(new TFile(), { path: "A.md" }))).toBe(false);
    expect(revealLeaf).toHaveBeenCalledWith(leaf);
  });
});
