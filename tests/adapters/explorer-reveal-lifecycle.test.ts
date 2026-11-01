import { App, TFile } from "obsidian";
import { describe, expect, it, vi } from "vitest";

import { ExplorerAdapter } from "../../src/adapters/explorer-adapter";
import type { NodeService } from "../../src/adapters/node-service";
import type { VisualService } from "../../src/adapters/visual-service";
import { DEFAULT_SETTINGS } from "../../src/shared/settings";

function pending() {
  let resume = () => undefined as void;
  const promise = new Promise<void>((resolve) => { resume = resolve; });
  return { promise, resume };
}

function fixture() {
  const root = document.body.createDiv();
  const nativeReveal = vi.fn(async (): Promise<void> => undefined);
  const nativeSort = () => [];
  const view = {
    containerEl: root, tree: { infinityScroll: {} },
    getSortedFolderItems: nativeSort, sort: vi.fn(), revealInFolder: nativeReveal,
  };
  const leaf = { view };
  const revealLeaf = vi.fn(async (): Promise<void> => undefined);
  let visible = true;
  const adapter = new ExplorerAdapter({ vault: { getRoot: () => null }, workspace: {
    getLeavesOfType: (type: string) => type === "file-explorer" ? [leaf] : [],
    getMostRecentLeaf: () => leaf, getActiveFile: () => null, revealLeaf,
  } } as unknown as App, {
    isNodeVisible: () => visible, sortMode: () => "natural", nodeNoteCandidates: () => [],
  } as unknown as NodeService, {} as VisualService, () => structuredClone(DEFAULT_SETTINGS),
  () => ({ createNode: "", incompleteNode: "", missingNodeFolder: "", missingNodeNote: "",
    node: "", nodeConflict: "", root: "", unmanaged: "" }),
  () => undefined, () => undefined, () => undefined, () => undefined);
  return {
    adapter, root, view, nativeReveal, nativeSort, revealLeaf,
    hide: () => { visible = false; },
    dispose: () => { adapter.stop(); root.remove(); },
  };
}

describe("Explorer reveal lifecycle", () => {
  it.each([false, true])("invalidates the pending leaf reveal across stop (restart=%s)", async (restart) => {
    const current = fixture();
    const gate = pending();
    current.revealLeaf.mockReturnValueOnce(gate.promise);
    const observe = vi.spyOn(MutationObserver.prototype, "observe");
    const listen = vi.spyOn(current.root, "addEventListener");
    try {
      current.adapter.start();
      const result = current.adapter.reveal(Object.assign(new TFile(), { path: "A.md" }));
      expect(current.revealLeaf).toHaveBeenCalledOnce();
      current.adapter.stop();
      expect(current.view.getSortedFolderItems).toBe(current.nativeSort);
      expect(current.view.revealInFolder).toBe(current.nativeReveal);
      if (restart) current.adapter.start();
      const currentSort = current.view.getSortedFolderItems;
      const currentReveal = current.view.revealInFolder;
      observe.mockClear();
      listen.mockClear();

      gate.resume();
      expect(await result).toBe(false);
      expect(observe).not.toHaveBeenCalled();
      expect(listen).not.toHaveBeenCalled();
      expect(current.nativeReveal).not.toHaveBeenCalled();
      expect(current.view.getSortedFolderItems).toBe(currentSort);
      expect(current.view.revealInFolder).toBe(currentReveal);
      expect((current.adapter as unknown as { surfaces: Map<unknown, unknown> }).surfaces.size).toBe(restart ? 1 : 0);
      if (restart) {
        expect(await current.adapter.reveal(Object.assign(new TFile(), { path: "B.md" }))).toBe(true);
        expect(current.nativeReveal).toHaveBeenCalledOnce();
      }
    } finally { current.dispose(); observe.mockRestore(); listen.mockRestore(); }
  });

  it("returns an invalid result when native reveal finishes after unload", async () => {
    const current = fixture();
    const gate = pending();
    current.nativeReveal.mockReturnValueOnce(gate.promise);
    try {
      current.adapter.start();
      const result = current.adapter.reveal(Object.assign(new TFile(), { path: "A.md" }));
      await Promise.resolve();
      expect(current.nativeReveal).toHaveBeenCalledOnce();
      current.adapter.onunload();
      gate.resume();
      expect(await result).toBe(false);
      expect(current.view.revealInFolder).toBe(current.nativeReveal);
      expect((current.adapter as unknown as { surfaces: Map<unknown, unknown> }).surfaces.size).toBe(0);
    } finally { current.dispose(); }
  });

  it("rechecks visibility after materializing a deferred Explorer", async () => {
    const current = fixture();
    const gate = pending();
    current.revealLeaf.mockReturnValueOnce(gate.promise);
    try {
      current.adapter.start();
      const result = current.adapter.reveal(Object.assign(new TFile(), { path: "A.md" }));
      current.hide();
      gate.resume();
      expect(await result).toBe(false);
      expect(current.nativeReveal).not.toHaveBeenCalled();
    } finally { current.dispose(); }
  });

  it("keeps refreshes and queued mutation decoration inert while stopped", async () => {
    const current = fixture();
    const observe = vi.spyOn(MutationObserver.prototype, "observe");
    try {
      current.adapter.start();
      current.root.createDiv();
      await new Promise((resolve) => window.setTimeout(resolve, 0));
      current.adapter.stop();
      observe.mockClear();
      current.adapter.refresh();
      current.adapter.refreshActiveState();
      expect(await current.adapter.reveal(Object.assign(new TFile(), { path: "A.md" }))).toBe(false);
      await new Promise((resolve) => window.setTimeout(resolve, 40));
      expect(observe).not.toHaveBeenCalled();
      expect(current.revealLeaf).not.toHaveBeenCalled();
      expect((current.adapter as unknown as { surfaces: Map<unknown, unknown> }).surfaces.size).toBe(0);
    } finally { current.dispose(); observe.mockRestore(); }
  });
});
