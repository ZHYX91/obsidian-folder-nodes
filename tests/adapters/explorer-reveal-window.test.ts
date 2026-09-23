import { App, TFile } from "obsidian";
import { describe, expect, it, vi } from "vitest";
import { Window } from "happy-dom";

import { ExplorerAdapter } from "../../src/adapters/explorer-adapter";
import type { NodeService } from "../../src/adapters/node-service";
import type { VisualService } from "../../src/adapters/visual-service";
import { DEFAULT_SETTINGS } from "../../src/shared/settings";

describe("Explorer reveal window affinity", () => {
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
      {} as NodeService,
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
    expect(secondReveal).toHaveBeenCalledWith(file);
    expect(revealLeaf).toHaveBeenCalledWith(secondLeaf);
  });
});
