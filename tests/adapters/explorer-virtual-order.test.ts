import { describe, expect, it, vi } from "vitest";
import { TFolder } from "obsidian";
import { installExplorerVirtualOrder } from "../../src/adapters/explorer-virtual-order";

function setup() {
  const root = document.createElement("div");
  const scroll = root.createDiv({ cls: "nav-files-container" });
  document.body.append(root);
  const folder = Object.assign(new TFolder(), { path: "Parent" });
  const item = (path: string) => {
    const el = scroll.createDiv({ cls: "nav-folder" });
    const selfEl = el.createDiv({ cls: "nav-folder-title", attr: { "data-path": path } });
    return { file: { path }, el, selfEl };
  };
  const a = item("Parent/A");
  const ordinary = item("Parent/_ordinary");
  const b = item("Parent/B");
  let native = [a, ordinary, b];
  let virtual = native;
  const getSortedFolderItems = vi.fn((_folder: TFolder) => native);
  const host: {
    tree: { infinityScroll: object };
    getSortedFolderItems: (folder: TFolder) => typeof native;
    sort: () => void;
  } = {
    tree: { infinityScroll: {} },
    getSortedFolderItems,
    sort: () => {
      virtual = host.getSortedFolderItems(folder);
      for (const child of virtual) scroll.append(child.el);
    },
  };
  return { root, scroll, folder, a, b, ordinary, host, original: getSortedFolderItems,
    virtual: () => virtual, native: () => native, setNative: (items: typeof native) => { native = items; } };
}

describe("Explorer virtual item ordering", () => {
  it("makes virtual reveal positions agree with manual DOM order and leaves ordinary slots intact", () => {
    const fixture = setup();
    const { root, scroll, host, b, ordinary, a, folder } = fixture;
    const bridge = installExplorerVirtualOrder(host, root, () => [b.file.path, a.file.path])!;
    bridge.refresh();
    expect(fixture.virtual()).toEqual([b, ordinary, a]);
    expect(Array.from(scroll.children)).toEqual(fixture.virtual().map(({ el }) => el));
    expect(fixture.virtual().indexOf(b)).toBe(Array.from(scroll.children).indexOf(b.el));
    expect(fixture.native()).toEqual([a, ordinary, b]);
    expect(host.getSortedFolderItems(folder)).toEqual([b, ordinary, a]);
    bridge.dispose();
    root.remove();
  });

  it("hands Name mode and unload back to the current native order", () => {
    const fixture = setup();
    let manual = true;
    const bridge = installExplorerVirtualOrder(fixture.host, fixture.root,
      () => manual ? [fixture.b.file.path, fixture.a.file.path] : null)!;
    bridge.refresh();
    fixture.setNative([fixture.b, fixture.a, fixture.ordinary]);
    manual = false;
    bridge.refresh();
    expect(fixture.virtual()).toEqual(fixture.native());
    bridge.dispose();
    expect(fixture.host.getSortedFolderItems).toBe(fixture.original);
    fixture.root.remove();
  });

  it("preserves visible geometry instead of following an offscreen active branch", () => {
    const fixture = setup();
    fixture.scroll.scrollTop = 40;
    fixture.scroll.getBoundingClientRect = () => ({ top: 0, bottom: 20 } as DOMRect);
    for (const child of [fixture.a, fixture.ordinary, fixture.b]) child.selfEl.getBoundingClientRect = () => {
      const top = Array.from(fixture.scroll.children).indexOf(child.el) * 20 - fixture.scroll.scrollTop;
      return { top, bottom: top + 20, width: 100, height: 20 } as DOMRect;
    };
    const before = fixture.b.selfEl.getBoundingClientRect().top;
    const bridge = installExplorerVirtualOrder(fixture.host, fixture.root,
      () => [fixture.b.file.path, fixture.a.file.path])!;
    bridge.refresh();
    expect(fixture.b.selfEl.getBoundingClientRect().top).toBe(before);
    expect(fixture.scroll.scrollTop).toBe(0);
    bridge.dispose();
    fixture.root.remove();
  });

  it("does not overwrite a later host wrapper and becomes inert after disposal", () => {
    const fixture = setup();
    const bridge = installExplorerVirtualOrder(fixture.host, fixture.root, () => [fixture.b.file.path, fixture.a.file.path])!;
    const installed = fixture.host.getSortedFolderItems;
    const later = () => installed(fixture.folder);
    fixture.host.getSortedFolderItems = later;
    bridge.dispose();
    expect(fixture.host.getSortedFolderItems).toBe(later);
    expect(later()).toEqual(fixture.native());
    fixture.root.remove();
  });

  it("guards unavailable host capabilities and falls back to the host result on projection errors", () => {
    const fixture = setup();
    expect(installExplorerVirtualOrder({}, fixture.root, () => [])).toBeNull();
    const bridge = installExplorerVirtualOrder(fixture.host, fixture.root, () => { throw new Error("projection unavailable"); })!;
    expect(fixture.host.getSortedFolderItems(fixture.folder)).toEqual(fixture.native());
    bridge.dispose();
    fixture.root.remove();
  });
});
