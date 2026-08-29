import { TFile, TFolder } from "obsidian";
import { describe, expect, it, vi } from "vitest";

import { PolishedFolderNodeGraphView } from "../../src/ui/node-graph-polish-view";

function fixture(withLinks = true) {
  const root = Object.assign(new TFolder(), { children: [] as Array<TFile | TFolder>, name: "", path: "" });
  const a = Object.assign(new TFolder(), { children: [] as Array<TFile | TFolder>, name: "A", path: "A", parent: root });
  const b = Object.assign(new TFolder(), { children: [] as Array<TFile | TFolder>, name: "B", path: "B", parent: root });
  const aNote = Object.assign(new TFile(), { name: "A.md", basename: "A", extension: "md", path: "A/A.md", parent: a });
  const bNote = Object.assign(new TFile(), { name: "B.md", basename: "B", extension: "md", path: "B/B.md", parent: b });
  root.children = [a, b];
  a.children = [aNote];
  b.children = [bNote];
  const app = {
    vault: {
      getName: () => "Test Vault",
      getRoot: () => root,
    },
    metadataCache: {
      resolvedLinks: withLinks ? { "A/A.md": { "B/B.md": 1 }, "B/B.md": {} } : {},
    },
  };
  const service = {
    children: (path: string) => path === "" ? [{ childPath: "A" }, { childPath: "B" }] : [],
    getCanonicalFile: (path: string) => path === "A" ? aNote : path === "B" ? bNote : null,
    getFolder: (path: string) => path === "A" ? a : path === "B" ? b : null,
    openFolderNode: vi.fn(async () => undefined),
  };
  const visuals = {
    resolve: () => ({ kind: "fallback", value: "folder", accent: null, inheritedFrom: null }) as const,
  };
  return { app, service, visuals };
}

async function flushMutations(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe("Node Graph UI polish", () => {
  it("adds layered controls, search/locate, legend, hover metadata, and neighborhood emphasis", async () => {
    const { app, service, visuals } = fixture();
    const view = new PolishedFolderNodeGraphView({ app } as never, service, visuals);
    await view.onOpen();

    expect(view.contentEl.querySelector(".folder-nodes-node-graph-toolbar-primary")).not.toBeNull();
    expect(view.contentEl.querySelector(".folder-nodes-node-graph-toolbar-secondary")).not.toBeNull();
    expect(view.contentEl.querySelector(".folder-nodes-node-graph-legend-line.is-structure")).not.toBeNull();

    const search = view.contentEl.querySelector<HTMLInputElement>(".folder-nodes-node-graph-search-input");
    expect(search).not.toBeNull();
    if (search === null) return;
    search.value = "B";
    search.dispatchEvent(new Event("input", { bubbles: true }));
    expect(view.contentEl.querySelector("[data-node-path='B']")?.classList.contains("is-search-match")).toBe(true);
    search.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    await flushMutations();

    expect(view.contentEl.querySelector("[data-node-path='B']")?.classList.contains("is-focused")).toBe(true);
    expect(view.contentEl.querySelector("[data-node-path='A']")?.classList.contains("is-muted")).toBe(true);
    expect(view.contentEl.querySelector("[data-node-path='']")?.classList.contains("is-neighbor")).toBe(true);
    expect(view.contentEl.querySelector("line.is-connected")).not.toBeNull();
    expect(view.contentEl.querySelector<HTMLElement>("[data-node-path='B']")?.title).toContain("Structure");
  });

  it("explains an empty Links view and adds 3D depth/gesture cues", async () => {
    const { app, service, visuals } = fixture(false);
    const view = new PolishedFolderNodeGraphView({ app } as never, service, visuals);
    await view.onOpen();

    const links = [...view.contentEl.querySelectorAll<HTMLButtonElement>(".folder-nodes-node-graph-toolbar-secondary .folder-nodes-node-graph-switch-button")]
      .find((button) => button.textContent === "Links");
    links?.click();
    await flushMutations();
    expect(view.contentEl.querySelector(".folder-nodes-node-graph-empty")).not.toBeNull();

    const threeD = [...view.contentEl.querySelectorAll<HTMLButtonElement>(".folder-nodes-node-graph-toolbar-primary .folder-nodes-node-graph-switch-button")]
      .find((button) => button.textContent === "3D");
    threeD?.click();
    await flushMutations();
    expect(view.contentEl.querySelector(".folder-nodes-node-graph-3d-hint")).not.toBeNull();
    const depthCued = view.contentEl.querySelector(".folder-nodes-node-graph-node.is-depth-near, .folder-nodes-node-graph-node.is-depth-mid, .folder-nodes-node-graph-node.is-depth-far");
    expect(depthCued).not.toBeNull();
  });
});
