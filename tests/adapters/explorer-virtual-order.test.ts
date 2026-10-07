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

function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => window.requestAnimationFrame(() => resolve()));
}

describe("Explorer virtual item ordering", () => {
  function revealFixture(native: (entry: TFolder) => Promise<void> | void, allowed = () => true) {
    const fixture = setup();
    fixture.scroll.getBoundingClientRect = () => ({ top: 80, bottom: 180, width: 200, height: 100 } as DOMRect);
    fixture.b.selfEl.getBoundingClientRect = () => {
      const top = 100 - fixture.scroll.scrollTop;
      return { top, bottom: top + 20, width: 120, height: 20 } as DOMRect;
    };
    const host = Object.assign(fixture.host, { revealInFolder: native });
    const bridge = installExplorerVirtualOrder(host, fixture.root, () => null,
      (entry) => allowed() ? entry.path : null)!;
    const target = Object.assign(new TFolder(), { path: fixture.b.file.path });
    return { ...fixture, host, bridge, target };
  }

  it("retains the postcondition until its native async reveal finishes", async () => {
    const completion = deferred();
    const fixture = revealFixture(() => completion.promise);
    const result = fixture.host.revealInFolder(fixture.target);
    fixture.bridge.refresh();
    fixture.bridge.settleReveal();
    fixture.scroll.scrollTop = 60;
    completion.resolve();
    await result;
    expect(fixture.scroll.scrollTop).toBe(20);
    fixture.bridge.dispose();
    fixture.root.remove();
  });

  it.each(["resolve", "reject"] as const)("does not let an older reveal %s consume a newer request", async (outcome) => {
    const old = deferred();
    const current = deferred();
    let calls = 0;
    const fixture = revealFixture(() => ++calls === 1 ? old.promise : current.promise);
    const oldResult = Promise.resolve(fixture.host.revealInFolder(fixture.target)).catch(() => undefined);
    const currentResult = fixture.host.revealInFolder(fixture.target);
    if (outcome === "resolve") old.resolve();
    else old.reject(new Error("old reveal failed"));
    await oldResult;
    fixture.scroll.scrollTop = 60;
    current.resolve();
    await currentResult;
    expect(fixture.scroll.scrollTop).toBe(20);
    fixture.bridge.dispose();
    fixture.root.remove();
  });

  it.each(["wheel", "pointerdown", "touchstart", "keydown"])("cancels delayed materialization on user %s takeover", async (eventType) => {
    const fixture = revealFixture(() => undefined);
    fixture.b.el.remove();
    await fixture.host.revealInFolder(fixture.target);
    fixture.scroll.dispatchEvent(new Event(eventType, { bubbles: true }));
    fixture.scroll.scrollTop = 60;
    fixture.scroll.append(fixture.b.el);
    fixture.bridge.settleReveal();
    expect(fixture.scroll.scrollTop).toBe(60);
    fixture.bridge.dispose();
    fixture.root.remove();
  });

  it("rechecks hidden projection before delayed correction and forgets it permanently", async () => {
    let allowed = true;
    const fixture = revealFixture(() => undefined, () => allowed);
    fixture.b.el.remove();
    await fixture.host.revealInFolder(fixture.target);
    allowed = false;
    await nextFrame();
    fixture.bridge.settleReveal();
    allowed = true;
    fixture.scroll.scrollTop = 60;
    fixture.scroll.append(fixture.b.el);
    fixture.bridge.settleReveal();
    expect(fixture.scroll.scrollTop).toBe(60);
    fixture.bridge.dispose();
    fixture.root.remove();
  });

  it("expires an unmaterialized void request after the host and settlement frames", async () => {
    const fixture = revealFixture(() => undefined);
    fixture.b.el.remove();
    await fixture.host.revealInFolder(fixture.target);
    await nextFrame();
    await nextFrame();
    fixture.scroll.scrollTop = 60;
    fixture.scroll.append(fixture.b.el);
    fixture.bridge.settleReveal();
    expect(fixture.scroll.scrollTop).toBe(60);
    fixture.bridge.dispose();
    fixture.root.remove();
  });

  it("does not revive a native async request after user takeover or disposal", async () => {
    for (const cancel of ["input", "dispose"]) {
      const completion = deferred();
      const fixture = revealFixture(() => completion.promise);
      const result = fixture.host.revealInFolder(fixture.target);
      if (cancel === "input") fixture.scroll.dispatchEvent(new Event("wheel", { bubbles: true }));
      else fixture.bridge.dispose();
      fixture.scroll.scrollTop = 60;
      completion.resolve();
      await result;
      expect(fixture.scroll.scrollTop).toBe(60);
      fixture.bridge.dispose();
      fixture.root.remove();
    }
  });

  it("does not let refresh adopt an external scroll while a row is missing", async () => {
    const fixture = revealFixture(() => undefined);
    fixture.b.el.remove();
    await fixture.host.revealInFolder(fixture.target);
    fixture.scroll.scrollTop = 60;
    fixture.scroll.append(fixture.b.el);
    fixture.bridge.refresh();
    expect(fixture.scroll.scrollTop).toBe(60);
    fixture.bridge.dispose();
    fixture.root.remove();
  });

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


  it.each([
    ["Name", null],
    ["Manual", ["Parent/B", "Parent/A"]],
  ] as const)("keeps an explicit %s reveal target visible when plugin geometry makes host scrolling overshoot", async (_mode, paths) => {
    const fixture = setup();
    const viewport = { top: 80, bottom: 180, width: 200, height: 100 } as DOMRect;
    fixture.scroll.getBoundingClientRect = () => viewport;
    fixture.ordinary.selfEl.classList.add("folder-nodes-canonical-note");
    fixture.ordinary.selfEl.getBoundingClientRect = () =>
      ({ top: 0, bottom: 0, width: 0, height: 0 } as DOMRect);
    fixture.b.selfEl.getBoundingClientRect = () => {
      const top = 100 - fixture.scroll.scrollTop;
      return { top, bottom: top + 20, width: 120, height: 20 } as DOMRect;
    };
    const pluginRoot = fixture.scroll.ownerDocument.createElement("div");
    pluginRoot.className = "folder-nodes-explorer-root";
    fixture.scroll.prepend(pluginRoot);

    const target = Object.assign(new TFolder(), { path: fixture.b.file.path });
    const nativeReveal = vi.fn((_entry: TFolder) => {
      // The host virtual model does not include Folder Nodes' 48px Root row and
      // may still count rows that plugin CSS removes from actual layout.
      fixture.scroll.scrollTop = 60;
    });
    const host = fixture.host as typeof fixture.host & {
      revealInFolder: (entry: TFolder) => void | Promise<void>;
    };
    host.revealInFolder = nativeReveal;
    const bridge = installExplorerVirtualOrder(host, fixture.root, () => paths)!;
    bridge.refresh();

    await host.revealInFolder(target);
    await nextFrame();

    expect(nativeReveal).toHaveBeenCalledWith(target);
    expect(fixture.b.selfEl.getBoundingClientRect().top).toBe(viewport.top);
    expect(fixture.scroll.scrollTop).toBe(20);

    bridge.dispose();
    expect(host.revealInFolder).toBe(nativeReveal);
    fixture.root.remove();
  });

  it("minimally corrects a deep explicit reveal clipped below the Explorer viewport", async () => {
    const fixture = setup();
    const deepPath = "Parent/Level Two/Level Three/Leaf";
    fixture.b.file.path = deepPath;
    fixture.b.selfEl.dataset.path = deepPath;
    const viewport = { top: 80, bottom: 180, width: 200, height: 100 } as DOMRect;
    fixture.scroll.getBoundingClientRect = () => viewport;
    fixture.b.selfEl.getBoundingClientRect = () => {
      const top = 220 - fixture.scroll.scrollTop;
      return { top, bottom: top + 25, width: 120, height: 25 } as DOMRect;
    };
    const target = Object.assign(new TFolder(), { path: deepPath });
    const nativeReveal = vi.fn(() => { fixture.scroll.scrollTop = 50; });
    const host = fixture.host as typeof fixture.host & {
      revealInFolder: (entry: TFolder) => void | Promise<void>;
    };
    host.revealInFolder = nativeReveal;
    const bridge = installExplorerVirtualOrder(host, fixture.root,
      () => [deepPath, fixture.a.file.path])!;

    await host.revealInFolder(target);
    await nextFrame();

    expect(fixture.b.selfEl.getBoundingClientRect().bottom).toBe(viewport.bottom);
    expect(fixture.scroll.scrollTop).toBe(65);
    bridge.dispose();
    fixture.root.remove();
  });


  it("keeps the plugin Root row visible when an explicit root reveal is over-scrolled", async () => {
    const fixture = setup();
    const viewport = { top: 80, bottom: 180, width: 200, height: 100 } as DOMRect;
    fixture.scroll.getBoundingClientRect = () => viewport;
    const pluginRoot = fixture.scroll.ownerDocument.createElement("div");
    pluginRoot.className = "folder-nodes-explorer-root";
    pluginRoot.getBoundingClientRect = () => {
      const top = 100 - fixture.scroll.scrollTop;
      return { top, bottom: top + 36, width: 160, height: 36 } as DOMRect;
    };
    fixture.scroll.prepend(pluginRoot);
    const rootFolder = Object.assign(new TFolder(), { path: "" });
    const nativeReveal = vi.fn(() => { fixture.scroll.scrollTop = 60; });
    const host = fixture.host as typeof fixture.host & {
      revealInFolder: (entry: TFolder) => void | Promise<void>;
    };
    host.revealInFolder = nativeReveal;
    const bridge = installExplorerVirtualOrder(host, fixture.root, () => null)!;

    await host.revealInFolder(rootFolder);
    await nextFrame();

    expect(pluginRoot.getBoundingClientRect().top).toBe(viewport.top);
    expect(fixture.scroll.scrollTop).toBe(20);
    bridge.dispose();
    fixture.root.remove();
  });

  it("settles a reveal after its virtual row materializes instead of using a timing delay", async () => {
    const fixture = setup();
    const viewport = { top: 80, bottom: 180, width: 200, height: 100 } as DOMRect;
    fixture.scroll.getBoundingClientRect = () => viewport;
    fixture.b.el.remove();
    fixture.b.selfEl.getBoundingClientRect = () => {
      const top = 100 - fixture.scroll.scrollTop;
      return { top, bottom: top + 20, width: 120, height: 20 } as DOMRect;
    };
    const target = Object.assign(new TFolder(), { path: fixture.b.file.path });
    const nativeReveal = vi.fn(() => { fixture.scroll.scrollTop = 60; });
    const host = fixture.host as typeof fixture.host & {
      revealInFolder: (entry: TFolder) => void | Promise<void>;
    };
    host.revealInFolder = nativeReveal;
    const bridge = installExplorerVirtualOrder(host, fixture.root, () => null)!;

    await host.revealInFolder(target);
    expect(fixture.scroll.scrollTop).toBe(60);
    await nextFrame();

    fixture.scroll.append(fixture.b.el);
    bridge.settleReveal();

    expect(fixture.b.selfEl.getBoundingClientRect().top).toBe(viewport.top);
    expect(fixture.scroll.scrollTop).toBe(20);
    bridge.dispose();
    fixture.root.remove();
  });

  it("suppresses host active-file auto-reveal only during plugin-owned refresh after reveal ownership expires", async () => {
    const fixture = setup();
    const viewport = { top: 80, bottom: 180, width: 200, height: 100 } as DOMRect;
    fixture.scroll.getBoundingClientRect = () => viewport;
    fixture.b.selfEl.getBoundingClientRect = () => {
      const top = 500 - fixture.scroll.scrollTop;
      return { top, bottom: top + 20, width: 120, height: 20 } as DOMRect;
    };
    const target = Object.assign(new TFolder(), { path: fixture.b.file.path });
    const activeDom = fixture.a;
    const nativeReveal = vi.fn(() => {
      window.requestAnimationFrame(() => { fixture.scroll.scrollTop = 460; });
    });
    const scrollIntoView = vi.fn((item: typeof activeDom, alignment: number) => {
      expect(item).toBe(activeDom);
      expect(alignment).toBe(4);
      fixture.scroll.scrollTop = 0;
    });
    const host = fixture.host as typeof fixture.host & {
      activeDom: typeof activeDom;
      autoRevealFile: boolean;
      fileBeingRenamed: boolean;
      revealActiveFile: () => void;
      revealInFolder: (entry: TFolder) => void | Promise<void>;
      tree: { infinityScroll: { scrollIntoView: typeof scrollIntoView } };
    };
    host.activeDom = activeDom;
    host.autoRevealFile = true;
    host.fileBeingRenamed = false;
    host.tree.infinityScroll = { scrollIntoView };
    host.revealInFolder = nativeReveal;
    const nativeActiveReveal = vi.fn(() => {
      host.tree.infinityScroll.scrollIntoView(host.activeDom, 4);
    });
    host.revealActiveFile = nativeActiveReveal;
    const nativeSort = host.sort.bind(host);
    host.sort = () => {
      nativeSort();
      if (host.autoRevealFile && !host.fileBeingRenamed) host.revealActiveFile();
    };
    const bridge = installExplorerVirtualOrder(host, fixture.root, () => null)!;

    expect(host.revealInFolder(target)).toBeUndefined();
    await nextFrame();
    await nextFrame();

    expect(nativeReveal).toHaveBeenCalledOnce();
    expect(fixture.scroll.scrollTop).toBe(420);
    expect(fixture.b.selfEl.getBoundingClientRect().top).toBe(viewport.top);

    // The explicit reveal request is already expired here. A later Folder Nodes
    // decoration refresh still must not run File Explorer's revealActiveFile().
    bridge.refresh();

    expect(nativeActiveReveal).not.toHaveBeenCalled();
    expect(scrollIntoView).not.toHaveBeenCalled();
    expect(fixture.scroll.scrollTop).toBe(420);
    expect(fixture.b.selfEl.getBoundingClientRect().top).toBe(viewport.top);

    // Native host auto-reveal remains untouched outside Folder Nodes refresh.
    host.sort();
    expect(nativeActiveReveal).toHaveBeenCalledOnce();
    expect(scrollIntoView).toHaveBeenCalledWith(activeDom, 4);
    expect(fixture.b.selfEl.getBoundingClientRect().top).toBeGreaterThan(viewport.bottom);

    bridge.dispose();
    expect(host.revealActiveFile).toBe(nativeActiveReveal);
    fixture.root.remove();
  });

  it("does not force a plugin-hidden native reveal target into view", async () => {
    const fixture = setup();
    fixture.scroll.scrollTop = 10;
    const hidden = Object.assign(new TFolder(), { path: fixture.b.file.path });
    const nativeReveal = vi.fn(() => { fixture.scroll.scrollTop = 60; });
    const host = fixture.host as typeof fixture.host & {
      revealInFolder: (entry: TFolder) => void | Promise<void>;
    };
    host.revealInFolder = nativeReveal;
    const bridge = installExplorerVirtualOrder(host, fixture.root, () => null, () => null)!;

    await host.revealInFolder(hidden);

    expect(fixture.scroll.scrollTop).toBe(60);
    bridge.settleReveal();
    expect(fixture.scroll.scrollTop).toBe(60);
    bridge.dispose();
    fixture.root.remove();
  });

  it("does not overwrite later host wrappers and becomes inert after disposal", () => {
    const fixture = setup();
    const nativeReveal = vi.fn((_entry: TFolder) => undefined);
    const nativeActiveReveal = vi.fn(() => undefined);
    const host = fixture.host as typeof fixture.host & {
      revealActiveFile: () => void;
      revealInFolder: (entry: TFolder) => void | Promise<void>;
    };
    host.revealInFolder = nativeReveal;
    host.revealActiveFile = nativeActiveReveal;
    const bridge = installExplorerVirtualOrder(host, fixture.root, () => [fixture.b.file.path, fixture.a.file.path])!;
    const installed = fixture.host.getSortedFolderItems;
    const installedReveal = host.revealInFolder;
    const installedActiveReveal = host.revealActiveFile;
    const later = () => installed(fixture.folder);
    const laterReveal = vi.fn((entry: TFolder) => installedReveal(entry));
    const laterActiveReveal = vi.fn(() => installedActiveReveal());
    fixture.host.getSortedFolderItems = later;
    host.revealInFolder = laterReveal;
    host.revealActiveFile = laterActiveReveal;
    bridge.dispose();
    expect(fixture.host.getSortedFolderItems).toBe(later);
    expect(host.revealInFolder).toBe(laterReveal);
    expect(host.revealActiveFile).toBe(laterActiveReveal);
    expect(later()).toEqual(fixture.native());
    laterActiveReveal();
    expect(nativeActiveReveal).toHaveBeenCalledOnce();
    fixture.root.remove();
  });

  it("guards unavailable host capabilities and falls back to the host result on projection errors", () => {
    const fixture = setup();
    const nativeReveal = vi.fn((_entry: TFolder) => undefined);
    const unsupported = { revealInFolder: nativeReveal };
    expect(installExplorerVirtualOrder(unsupported, fixture.root, () => [])).toBeNull();
    expect(unsupported.revealInFolder).toBe(nativeReveal);
    const bridge = installExplorerVirtualOrder(fixture.host, fixture.root, () => { throw new Error("projection unavailable"); })!;
    expect(fixture.host.getSortedFolderItems(fixture.folder)).toEqual(fixture.native());
    bridge.dispose();
    fixture.root.remove();
  });
});
