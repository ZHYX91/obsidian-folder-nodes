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
    if (search === null) {
      await view.onClose();
      return;
    }
    search.value = "B";
    search.dispatchEvent(new Event("input", { bubbles: true }));
    expect(view.contentEl.querySelector("[data-node-path='B']")?.classList.contains("is-search-match")).toBe(true);
    search.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    await flushMutations();

    expect(view.contentEl.querySelector("[data-node-path='B']")?.classList.contains("is-focused")).toBe(true);
    expect(view.contentEl.querySelector("[data-node-path='A']")?.classList.contains("is-muted")).toBe(true);
    expect(view.contentEl.querySelector("[data-node-path='']")?.classList.contains("is-neighbor")).toBe(true);
    expect(view.contentEl.querySelector("line.is-connected")).not.toBeNull();
    expect(view.contentEl.querySelector<HTMLElement>("[data-node-path='B']")?.title).toContain("Structure 1 · Links 0");
    await view.onClose();
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
    await view.onClose();
  });

  it("keeps search, focus, legend, and 3D switching on the large canvas path", async () => {
    const root = Object.assign(new TFolder(), { children: [] as Array<TFile | TFolder>, name: "", path: "" });
    const folders = new Map<string, TFolder>();
    for (let index = 0; index < 501; index += 1) {
      const path = `N${String(index).padStart(3, "0")}`;
      folders.set(path, Object.assign(new TFolder(), {
        children: [] as Array<TFile | TFolder>, name: path, parent: root, path,
      }));
    }
    const app = { vault: { getName: () => "Large Vault", getRoot: () => root }, metadataCache: { resolvedLinks: {} } };
    const service = {
      children: (path: string) => path === "" ? [...folders.keys()].map((childPath) => ({ childPath })) : [],
      getCanonicalFile: () => null,
      getFolder: (path: string) => folders.get(path) ?? null,
      openFolderNode: vi.fn(async () => undefined),
    };
    const visuals = { resolve: () => ({ kind: "fallback", value: "folder", accent: null, inheritedFrom: null }) as const };
    const context = {
      arc: vi.fn(), beginPath: vi.fn(), clearRect: vi.fn(), fill: vi.fn(), fillRect: vi.fn(), fillText: vi.fn(),
      lineTo: vi.fn(), moveTo: vi.fn(), restore: vi.fn(), save: vi.fn(), setLineDash: vi.fn(), setTransform: vi.fn(),
      stroke: vi.fn(), strokeRect: vi.fn(),
    };
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(context as never);
    const view = new PolishedFolderNodeGraphView({ app } as never, service, visuals);
    await view.onOpen();
    const search = view.contentEl.querySelector<HTMLInputElement>(".folder-nodes-node-graph-search-input");
    expect(search).not.toBeNull();
    if (search !== null) {
      search.value = "N500";
      search.dispatchEvent(new Event("input", { bubbles: true }));
      search.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    }
    await new Promise((resolve) => window.setTimeout(resolve, 20));
    expect(view.contentEl.querySelector<HTMLButtonElement>(".folder-nodes-node-graph-focus-overlay")?.dataset.nodePath).toBe("N500");
    expect(view.contentEl.querySelector(".folder-nodes-node-graph-legend-line.is-structure")).not.toBeNull();

    const threeD = [...view.contentEl.querySelectorAll<HTMLButtonElement>(".folder-nodes-node-graph-toolbar-primary .folder-nodes-node-graph-switch-button")]
      .find((button) => button.textContent === "3D");
    threeD?.click();
    expect(view.contentEl.classList.contains("is-3d")).toBe(true);
    expect(view.contentEl.querySelectorAll("canvas.folder-nodes-node-graph-render-canvas")).toHaveLength(1);
    await view.onClose();
    getContext.mockRestore();
  });
});
