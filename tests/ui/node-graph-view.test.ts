import { TFile, TFolder } from "obsidian";
import { describe, expect, it, vi } from "vitest";

import { FolderNodeGraphView } from "../../src/ui/node-graph-view";

function graphFixture() {
  const root = Object.assign(new TFolder(), { children: [] as Array<TFile | TFolder>, name: "", path: "" });
  const a = Object.assign(new TFolder(), { children: [] as Array<TFile | TFolder>, name: "A", path: "A", parent: root });
  const b = Object.assign(new TFolder(), { children: [] as Array<TFile | TFolder>, name: "B", path: "B", parent: root });
  const aNote = Object.assign(new TFile(), { name: "A.md", basename: "A", extension: "md", path: "A/A.md", parent: a });
  const bNote = Object.assign(new TFile(), { name: "B.md", basename: "B", extension: "md", path: "B/B.md", parent: b });
  root.children = [a, b];
  a.children = [aNote];
  b.children = [bNote];
  const openFolderNode = vi.fn(async () => undefined);
  const app = {
    vault: {
      getName: () => "Test Vault",
      getRoot: () => root,
    },
    metadataCache: {
      resolvedLinks: {
        "A/A.md": { "B/B.md": 2, "Loose.md": 1 },
        "B/B.md": {},
      },
    },
  };
  const service = {
    children: (path: string) => path === "" ? [{ childPath: "A" }, { childPath: "B" }] : [],
    getCanonicalFile: (path: string) => path === "A" ? aNote : path === "B" ? bNote : null,
    getFolder: (path: string) => path === "A" ? a : path === "B" ? b : null,
    openFolderNode,
  };
  const visuals = {
    resolve: () => ({ kind: "fallback", value: "folder", accent: null, inheritedFrom: null }) as const,
  };
  return { app, openFolderNode, service, visuals };
}

describe("Node Graph view interactions", () => {
  it("opens Node Notes with Enter, fits 2D, and switches relation modes", async () => {
    const { app, openFolderNode, service, visuals } = graphFixture();
    const view = new FolderNodeGraphView({ app } as never, service, visuals);
    await view.onOpen();

    const node = view.contentEl.querySelector<HTMLButtonElement>("[data-node-path='A']");
    node?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", ctrlKey: true, bubbles: true }));
    expect(openFolderNode).toHaveBeenCalledWith("A", true);

    const surface = view.contentEl.querySelector<HTMLElement>(".folder-nodes-node-graph-scroll");
    expect(surface).not.toBeNull();
    Object.defineProperties(surface, {
      clientHeight: { configurable: true, value: 100 },
      clientWidth: { configurable: true, value: 100 },
      scrollTo: { configurable: true, value: vi.fn() },
    });
    view.contentEl.querySelector<HTMLButtonElement>("[data-node-graph-action='fit']")?.click();
    expect(surface?.scrollTo).toHaveBeenCalledWith({ left: 0, top: 0, behavior: "smooth" });

    const linksButton = [...view.contentEl.querySelectorAll<HTMLButtonElement>(".folder-nodes-node-graph-switch-button")]
      .find((button) => button.textContent === "Links");
    linksButton?.click();
    expect(view.contentEl.querySelectorAll("line.is-link")).toHaveLength(1);
    expect(view.contentEl.querySelectorAll("line.is-structure")).toHaveLength(0);

    const hybridButton = [...view.contentEl.querySelectorAll<HTMLButtonElement>(".folder-nodes-node-graph-switch-button")]
      .find((button) => button.textContent === "Hybrid");
    hybridButton?.click();
    expect(view.contentEl.querySelectorAll("line.is-link")).toHaveLength(1);
    expect(view.contentEl.querySelectorAll("line.is-structure")).toHaveLength(2);
  });

  it("switches the same graph model into 3D and keeps focus/open interactions", async () => {
    const { app, openFolderNode, service, visuals } = graphFixture();
    const view = new FolderNodeGraphView({ app } as never, service, visuals);
    await view.onOpen();
    const threeD = [...view.contentEl.querySelectorAll<HTMLButtonElement>(".folder-nodes-node-graph-switch-button")]
      .find((button) => button.textContent === "3D");
    threeD?.click();

    expect(view.contentEl.classList.contains("is-3d")).toBe(true);
    const node = view.contentEl.querySelector<HTMLButtonElement>("[data-node-path='A']");
    expect(node?.classList.contains("is-3d")).toBe(true);
    expect(node?.style.transform).toContain("translate(-50%, -50%) scale(");

    const surface = view.contentEl.querySelector<HTMLElement>(".folder-nodes-node-graph-scroll");
    const canvas = view.contentEl.querySelector<HTMLElement>(".folder-nodes-node-graph-canvas-3d");
    const edges = view.contentEl.querySelector<SVGSVGElement>(".folder-nodes-node-graph-edges");
    expect(surface).not.toBeNull();
    Object.defineProperties(surface, {
      clientHeight: { configurable: true, value: 360 },
      clientWidth: { configurable: true, value: 640 },
    });
    view.onResize();
    expect(canvas?.style.width).toBe("640px");
    expect(canvas?.style.height).toBe("360px");
    expect(edges?.getAttribute("viewBox")).toBe("0 0 640 360");

    const transformsBeforeTouch = [...view.contentEl.querySelectorAll<HTMLElement>(".folder-nodes-node-graph-node")]
      .map((element) => element.style.transform);
    surface?.dispatchEvent(new PointerEvent("pointerdown", {
      bubbles: true, clientX: 100, clientY: 100, pointerId: 1, pointerType: "touch",
    }));
    surface?.dispatchEvent(new PointerEvent("pointerdown", {
      bubbles: true, clientX: 200, clientY: 100, pointerId: 2, pointerType: "touch",
    }));
    surface?.dispatchEvent(new PointerEvent("pointermove", {
      bubbles: true, clientX: 150, clientY: 110, pointerId: 2, pointerType: "touch",
    }));
    const transformsAfterTouch = [...view.contentEl.querySelectorAll<HTMLElement>(".folder-nodes-node-graph-node")]
      .map((element) => element.style.transform);
    expect(transformsAfterTouch).not.toEqual(transformsBeforeTouch);
    surface?.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerId: 2, pointerType: "touch" }));
    surface?.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerId: 1, pointerType: "touch" }));

    surface?.dispatchEvent(new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY: 100_000 }));
    expect(node?.classList.contains("is-depth-far")).toBe(true);
    node?.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    expect(openFolderNode).toHaveBeenCalledWith("A", false);

    view.setFocus("B");
    expect(view.contentEl.querySelector("[data-node-path='B']")?.classList.contains("is-focused")).toBe(true);
  });

  it("uses a constant-DOM canvas path above the large-graph threshold", async () => {
    const root = Object.assign(new TFolder(), { children: [] as Array<TFile | TFolder>, name: "", path: "" });
    const folders = new Map<string, TFolder>();
    for (let index = 0; index < 501; index += 1) {
      const path = `N${String(index).padStart(3, "0")}`;
      folders.set(path, Object.assign(new TFolder(), {
        children: [] as Array<TFile | TFolder>,
        name: path,
        parent: root,
        path,
      }));
    }
    const openFolderNode = vi.fn(async () => undefined);
    const app = {
      vault: { getName: () => "Large Vault", getRoot: () => root },
      metadataCache: { resolvedLinks: {} },
    };
    const service = {
      children: (path: string) => path === "" ? [...folders.keys()].map((childPath) => ({ childPath })) : [],
      getCanonicalFile: () => null,
      getFolder: (path: string) => folders.get(path) ?? null,
      openFolderNode,
    };
    const visuals = {
      resolve: () => ({ kind: "fallback", value: "folder", accent: null, inheritedFrom: null }) as const,
    };
    const context = {
      arc: vi.fn(), beginPath: vi.fn(), clearRect: vi.fn(), fill: vi.fn(), fillRect: vi.fn(), fillText: vi.fn(),
      lineTo: vi.fn(), moveTo: vi.fn(), restore: vi.fn(), save: vi.fn(), setLineDash: vi.fn(), setTransform: vi.fn(),
      stroke: vi.fn(), strokeRect: vi.fn(),
    };
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(context as never);
    const view = new FolderNodeGraphView({ app } as never, service, visuals);
    await view.onOpen();
    await new Promise((resolve) => window.setTimeout(resolve, 20));

    expect(view.contentEl.querySelectorAll("canvas.folder-nodes-node-graph-render-canvas")).toHaveLength(1);
    expect(view.contentEl.querySelectorAll(".folder-nodes-node-graph-node")).toHaveLength(0);
    expect(view.contentEl.querySelectorAll(".folder-nodes-node-graph-edges line")).toHaveLength(0);
    expect(view.contentEl.querySelectorAll(".folder-nodes-node-graph-focus-overlay")).toHaveLength(1);

    view.setFocus("N500");
    await new Promise((resolve) => window.setTimeout(resolve, 20));
    const focus = view.contentEl.querySelector<HTMLButtonElement>(".folder-nodes-node-graph-focus-overlay");
    expect(focus?.dataset.nodePath).toBe("N500");
    focus?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(openFolderNode).toHaveBeenCalledWith("N500", false);

    const threeD = [...view.contentEl.querySelectorAll<HTMLButtonElement>(".folder-nodes-node-graph-switch-button")]
      .find((button) => button.textContent === "3D");
    threeD?.click();
    expect(view.contentEl.querySelectorAll("canvas.folder-nodes-node-graph-render-canvas")).toHaveLength(1);
    expect(view.contentEl.querySelectorAll(".folder-nodes-node-graph-node")).toHaveLength(0);
    view.refresh();
    view.refresh();
    await view.onClose();
    await new Promise((resolve) => window.setTimeout(resolve, 80));
    expect(view.contentEl.querySelectorAll("canvas.folder-nodes-node-graph-render-canvas")).toHaveLength(0);
    getContext.mockRestore();
  });

  it("uses Canvas for a link-dense graph below the node threshold", async () => {
    const root = Object.assign(new TFolder(), { children: [] as Array<TFile | TFolder>, name: "", path: "" });
    const folders = new Map<string, TFolder>();
    const notes = new Map<string, TFile>();
    for (let index = 0; index < 40; index += 1) {
      const path = `D${String(index).padStart(2, "0")}`;
      const folder = Object.assign(new TFolder(), {
        children: [] as Array<TFile | TFolder>,
        name: path,
        parent: root,
        path,
      });
      const note = Object.assign(new TFile(), {
        basename: path,
        extension: "md",
        name: `${path}.md`,
        parent: folder,
        path: `${path}/${path}.md`,
      });
      folder.children = [note];
      folders.set(path, folder);
      notes.set(path, note);
    }
    const resolvedLinks = Object.fromEntries([...notes.values()].map((source) => [
      source.path,
      Object.fromEntries([...notes.values()]
        .filter((target) => target.path !== source.path)
        .map((target) => [target.path, 1])),
    ]));
    const app = {
      vault: { getName: () => "Dense Vault", getRoot: () => root },
      metadataCache: { resolvedLinks },
    };
    const service = {
      children: (path: string) => path === "" ? [...folders.keys()].map((childPath) => ({ childPath })) : [],
      getCanonicalFile: (path: string) => notes.get(path) ?? null,
      getFolder: (path: string) => folders.get(path) ?? null,
      openFolderNode: vi.fn(async () => undefined),
    };
    const visuals = {
      resolve: () => ({ kind: "fallback", value: "folder", accent: null, inheritedFrom: null }) as const,
    };
    const context = {
      arc: vi.fn(), beginPath: vi.fn(), clearRect: vi.fn(), fill: vi.fn(), fillRect: vi.fn(), fillText: vi.fn(),
      lineTo: vi.fn(), moveTo: vi.fn(), restore: vi.fn(), save: vi.fn(), setLineDash: vi.fn(), setTransform: vi.fn(),
      stroke: vi.fn(), strokeRect: vi.fn(),
    };
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(context as never);
    const view = new FolderNodeGraphView({ app } as never, service, visuals);
    await view.onOpen();
    await new Promise((resolve) => window.setTimeout(resolve, 20));

    expect(view.contentEl.querySelectorAll("canvas.folder-nodes-node-graph-render-canvas")).toHaveLength(1);
    expect(view.contentEl.querySelectorAll(".folder-nodes-node-graph-node")).toHaveLength(0);
    expect(view.contentEl.querySelectorAll(".folder-nodes-node-graph-edges line")).toHaveLength(0);

    await view.onClose();
    getContext.mockRestore();
  });
});
