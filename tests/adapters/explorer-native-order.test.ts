import { describe, expect, it } from "vitest";
import { TFolder } from "obsidian";
import { nativeExplorerOrder, restoreExplorerOrder } from "../../src/adapters/explorer-native-order";

describe("Explorer native ordering handoff", () => {
  it("reads the current host sort after creation, deletion and rename", () => {
    const container = document.createElement("div");
    const a = document.createElement("div");
    const b = document.createElement("div");
    const added = document.createElement("div");
    const pluginRow = document.createElement("div");
    const deleted = document.createElement("div");
    container.append(pluginRow, a, b, added);
    const folder = new TFolder();
    let sorted = [b, a, deleted];
    const host = { getSortedFolderItems: (parent: TFolder) => {
      expect(parent).toBe(folder);
      return sorted.map((el) => ({ el }));
    } };
    sorted = [added, b, a];
    a.setAttribute("data-path", "Renamed");
    restoreExplorerOrder(container, nativeExplorerOrder(host, folder)!);
    expect(Array.from(container.children)).toEqual([pluginRow, added, b, a]);
  });

  it("falls back safely for missing, throwing or malformed private capabilities", () => {
    const folder = new TFolder();
    for (const host of [undefined, {}, { getSortedFolderItems: () => null },
      { getSortedFolderItems: () => [null] }, { getSortedFolderItems: () => { throw new Error("unavailable"); } }]) {
      expect(nativeExplorerOrder(host, folder)).toBeNull();
    }
    const container = document.createElement("div");
    const a = document.createElement("div");
    const b = document.createElement("div");
    const added = document.createElement("div");
    container.append(b, added, a);
    restoreExplorerOrder(container, [a, b]);
    expect(Array.from(container.children)).toEqual([a, added, b]);
  });

  it("does not mutate an already restored host order", async () => {
    const container = document.createElement("div");
    const a = document.createElement("div");
    const b = document.createElement("div");
    container.append(a, b);
    const observer = new MutationObserver(() => undefined);
    observer.observe(container, { childList: true });
    restoreExplorerOrder(container, [a, b]);
    expect(observer.takeRecords()).toEqual([]);
    observer.disconnect();
  });
});
