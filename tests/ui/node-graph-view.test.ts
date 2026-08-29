import { TFolder } from "obsidian";
import { describe, expect, it, vi } from "vitest";

import { FolderNodeGraphView } from "../../src/ui/node-graph-view";

describe("Node Graph view interactions", () => {
  it("opens the focused Node Note with Enter and scales the graph to the viewport", async () => {
    const root = Object.assign(new TFolder(), { children: [], name: "", path: "" });
    const openFolderNode = vi.fn(async () => undefined);
    const app = {
      vault: {
        getName: () => "Test Vault",
        getRoot: () => root,
      },
    };
    const view = new FolderNodeGraphView({ app } as never, {
      children: () => [],
      getCanonicalFile: () => null,
      getFolder: () => null,
      openFolderNode,
    }, {
      resolve: () => ({ kind: "fallback", value: "folder", accent: null, inheritedFrom: null }),
    });

    await view.onOpen();
    const node = view.contentEl.querySelector<HTMLButtonElement>(".folder-nodes-node-graph-node");
    expect(node).not.toBeNull();
    node?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", ctrlKey: true, bubbles: true }));
    expect(openFolderNode).toHaveBeenCalledWith("", true);

    const scroll = view.contentEl.querySelector<HTMLElement>(".folder-nodes-node-graph-scroll");
    expect(scroll).not.toBeNull();
    Object.defineProperties(scroll, {
      clientHeight: { configurable: true, value: 100 },
      clientWidth: { configurable: true, value: 100 },
      scrollTo: { configurable: true, value: vi.fn() },
    });
    view.contentEl.querySelector<HTMLButtonElement>(".folder-nodes-node-graph-toolbar button")?.click();

    const stage = view.contentEl.querySelector<HTMLElement>(".folder-nodes-node-graph-stage");
    const canvas = view.contentEl.querySelector<HTMLElement>(".folder-nodes-node-graph-canvas");
    expect(stage?.style.width).toBe("100px");
    expect(stage?.style.height).toBe("100px");
    expect(Number.parseFloat(canvas?.style.left ?? "NaN")).toBeCloseTo(24);
    expect(canvas?.style.transform).toBe(`scale(${52 / 244})`);
    expect(scroll?.scrollTo).toHaveBeenCalledWith({ left: 0, top: 0, behavior: "smooth" });
  });
});
