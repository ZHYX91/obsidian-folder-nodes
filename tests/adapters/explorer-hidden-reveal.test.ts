import { App, TFile, TFolder } from "obsidian";
import { describe, expect, it, vi } from "vitest";
import { Window } from "happy-dom";

import { ExplorerAdapter } from "../../src/adapters/explorer-adapter";
import type { NodeService } from "../../src/adapters/node-service";
import type { VisualService } from "../../src/adapters/visual-service";
import { DEFAULT_SETTINGS } from "../../src/shared/settings";

function createAdapter(visible: () => boolean) {
  const ownerDocument = new Window().document as unknown as Document;
  const revealInFolder = vi.fn(async () => undefined);
  const leaf = { view: { containerEl: ownerDocument.createElement("div"), revealInFolder } };
  const revealLeaf = vi.fn(async () => undefined);
  const app = {
    workspace: {
      getLeavesOfType: () => [leaf],
      getMostRecentLeaf: () => null,
      revealLeaf,
    },
  } as unknown as App;
  const service = {
    isNodeVisible: () => visible(),
  } as unknown as NodeService;
  return {
    adapter: new ExplorerAdapter(
      app,
      service,
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
    ),
    revealInFolder,
    revealLeaf,
  };
}

describe("Explorer hidden reveal contract", () => {
  it("fails closed before calling host reveal APIs for a hidden folder", async () => {
    let visible = false;
    const { adapter, revealInFolder, revealLeaf } = createAdapter(() => visible);
    const folder = Object.assign(new TFolder(), { name: "Hidden", path: "Hidden" });

    expect(adapter.canReveal(folder)).toBe(false);
    expect(await adapter.reveal(folder)).toBe(false);
    expect(revealInFolder).not.toHaveBeenCalled();
    expect(revealLeaf).not.toHaveBeenCalled();

    visible = true;
    expect(adapter.canReveal(folder)).toBe(true);
    expect(await adapter.reveal(folder)).toBe(true);
    expect(revealInFolder).toHaveBeenCalledWith(folder);
    expect(revealLeaf).toHaveBeenCalled();
  });

  it("uses a file's containing folder for hidden projection", async () => {
    const hidden = Object.assign(new TFolder(), { name: "Hidden", path: "Hidden" });
    const file = Object.assign(new TFile(), {
      basename: "note", extension: "md", name: "note.md", parent: hidden, path: "Hidden/note.md",
    });
    const { adapter } = createAdapter(() => false);

    expect(adapter.canReveal(file)).toBe(false);
    expect(await adapter.reveal(file)).toBe(false);
  });
});
