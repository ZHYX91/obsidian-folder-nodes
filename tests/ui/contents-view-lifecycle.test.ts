import { MarkdownView, TFile, TFolder, type Editor } from "obsidian";
import { describe, expect, it, vi } from "vitest";

import { FolderNodeContentsView } from "../../src/ui/contents-view";

function createView(): FolderNodeContentsView {
  const root = Object.assign(new TFolder(), { children: [], name: "", path: "" });
  const app = {
    vault: {
      getAbstractFileByPath: () => null,
      getName: () => "Lifecycle Vault",
      getRoot: () => root,
    },
    workspace: { activeEditor: null },
  };
  const service = {
    children: () => [],
    getCanonicalFile: () => null,
    nodeNoteCandidates: () => [],
    nodeNoteRole: () => "none" as const,
    folderIdentity: () => "incomplete" as const,
    fileIdentity: () => "ordinary" as const,
    getFile: () => null,
    getFolder: () => null,
    isCanonicalFile: () => false,
    isIgnoredPath: () => false,
    isIgnoredRootPath: () => false,
    hiddenState: () => ({ explicit: false, sourcePath: null, unmanaged: false }),
    isNodeVisible: () => true, revealingHiddenNodes: () => false,
    isLeafNoteExempt: () => false,
    moveFile: vi.fn(async () => undefined),
    notePathForFolder: () => "Root.md",
    openFolderNode: vi.fn(async () => undefined),
    previewPlacement: () => ({ kind: "blocked" as const, reason: "test" }),
    placeNode: vi.fn(async (folder: TFolder) => folder),
  };
  const actions = {
    createChild: vi.fn(),
    createMissingNote: vi.fn(),
    editVisual: vi.fn(),
    entryMenu: vi.fn(),
    homepageEnabled: () => false,
    nodeMenu: vi.fn(),
    openHomepage: vi.fn(),
    problemMenu: vi.fn(),
    refresh: vi.fn(),
    reportError: vi.fn(),
  };
  return new FolderNodeContentsView(
    { app } as never,
    service,
    { resolve: () => ({ kind: "fallback", value: "folder", accent: null, inheritedFrom: null }) as const },
    { isReferenced: () => true } as never,
    actions,
    false,
  );
}

describe("Node Contents render extension lifecycle", () => {
  it("filters hidden nodes and restores status during session reveal", async () => {
    const root = Object.assign(new TFolder(), { children: [], name: "", path: "" });
    const visible = Object.assign(new TFolder(), { children: [], name: "Visible", parent: root, path: "Visible" });
    const hidden = Object.assign(new TFolder(), { children: [], name: "Hidden", parent: root, path: "Hidden" });
    root.children.push(visible, hidden);
    const note = (folder: TFolder): TFile => Object.assign(new TFile(), {
      basename: folder.name, extension: "md", name: `${folder.name}.md`, parent: folder, path: `${folder.path}/${folder.name}.md`,
    });
    const notes = new Map([[visible.path, note(visible)], [hidden.path, note(hidden)]]);
    let reveal = false;
    const app = { vault: { getAbstractFileByPath: () => null, getName: () => "Vault", getRoot: () => root }, workspace: { activeEditor: null } };
    const service = {
      children: () => [
        { basename: "Visible", childPath: "Visible", order: null },
        { basename: "Hidden", childPath: "Hidden", order: null },
      ], getCanonicalFile: (path: string) => notes.get(path) ?? null,
      nodeNoteCandidates: (path: string) => notes.has(path) ? [notes.get(path)!] : [], nodeNoteRole: () => "none" as const,
      folderIdentity: (path: string) => notes.has(path) ? "node" as const : "incomplete" as const, fileIdentity: () => "ordinary" as const,
      getFile: () => null, getFolder: (path: string) => path === "Visible" ? visible : path === "Hidden" ? hidden : null,
      isCanonicalFile: () => false, isIgnoredPath: () => false, isIgnoredRootPath: () => false, isLeafNoteExempt: () => false,
      hiddenState: (path: string) => ({ explicit: path === "Hidden", sourcePath: path === "Hidden" ? "Hidden" : null, unmanaged: false }),
      isNodeVisible: (path: string) => path !== "Hidden" || reveal, revealingHiddenNodes: () => reveal,
      moveFile: vi.fn(async () => undefined), notePathForFolder: () => "Vault.md", openFolderNode: vi.fn(async () => undefined),
      previewPlacement: () => ({ kind: "blocked" as const, reason: "test" }), placeNode: vi.fn(async (folder: TFolder) => folder),
    };
    const actions = {
      createChild: vi.fn(), createMissingNote: vi.fn(), editVisual: vi.fn(), entryMenu: vi.fn(), homepageEnabled: () => false,
      nodeMenu: vi.fn(), openHomepage: vi.fn(), problemMenu: vi.fn(), refresh: vi.fn(), reportError: vi.fn(),
    };
    const view = new FolderNodeContentsView(
      { app } as never, service,
      { resolve: () => ({ kind: "fallback", value: "folder", accent: null, inheritedFrom: null }) as const },
      { isReferenced: () => false } as never, actions, false,
    );

    await view.onOpen();
    expect([...view.contentEl.querySelectorAll(".folder-nodes-card-title")].map((entry) => entry.textContent)).toEqual(["Visible"]);
    reveal = true;
    view.refresh();
    expect([...view.contentEl.querySelectorAll(".folder-nodes-card-title")].map((entry) => entry.textContent)).toEqual(["Visible", "Hidden"]);
    const hiddenBadge = view.contentEl.querySelector<HTMLElement>(".folder-nodes-hidden-status.is-hidden");
    expect(hiddenBadge?.textContent).toBe("Hidden");
    expect(hiddenBadge?.querySelector("svg")).toBeNull();
    const section = view.contentEl.querySelector<HTMLDetailsElement>(".folder-nodes-section");
    expect(view.contentEl.querySelectorAll(".folder-nodes-section")).toHaveLength(1);
    expect(section?.querySelector(".folder-nodes-section-count")?.textContent).toBe("2");
    if (section !== null) {
      section.open = false;
      section.dispatchEvent(new Event("toggle"));
    }
    document.body.append(view.containerEl);
    const visibleCard = view.contentEl.querySelector<HTMLButtonElement>("[data-folder-nodes-focus-key='node:Visible']");
    visibleCard?.focus();
    view.contentEl.scrollTop = 73;
    view.refresh();
    expect(view.contentEl.querySelector<HTMLDetailsElement>(".folder-nodes-section")?.open).toBe(false);
    expect(view.contentEl.ownerDocument.activeElement?.getAttribute("data-folder-nodes-focus-key")).toBe("node:Visible");
    expect(view.contentEl.scrollTop).toBe(73);
    await view.onClose();
    view.containerEl.remove();
  });

  it("keeps a remembered editor only while its exact view and file stay live", () => {
    const view = createView();
    const subject = view as unknown as {
      app: {
        vault: { getAbstractFileByPath(path: string): unknown };
        workspace: { iterateAllLeaves(callback: (leaf: { view: MarkdownView }) => void): void };
      };
      lastEditor: { editor: Editor; file: TFile } | null;
      liveEditorTarget(): { editor: Editor; file: TFile } | null;
    };
    const file = Object.assign(new TFile(), { path: "Target.md" });
    const editor = {} as Editor;
    const markdown = Object.assign(new MarkdownView({} as never), { editor, file });
    let live = true;
    subject.lastEditor = { editor, file };
    subject.app.vault.getAbstractFileByPath = () => file;
    subject.app.workspace.iterateAllLeaves = (callback) => { if (live) callback({ view: markdown }); };

    expect(subject.liveEditorTarget()).toEqual({ editor, file });
    live = false;
    expect(subject.liveEditorTarget()).toBeNull();
  });

  it("uses one unified empty state instead of three zero-count disclosure rows", async () => {
    const view = createView();
    await view.onOpen();
    expect(view.contentEl.querySelectorAll(".folder-nodes-section")).toHaveLength(0);
    expect(view.contentEl.querySelector(".folder-nodes-contents-empty")?.textContent).toContain("no child nodes");
    await view.onClose();
  });

  it("keeps breadcrumbs ancestor-only and uses one current-node open target", async () => {
    const root = Object.assign(new TFolder(), { children: [], name: "", path: "" });
    const a = Object.assign(new TFolder(), { children: [], name: "A", parent: root, path: "A" });
    const b = Object.assign(new TFolder(), { children: [], name: "B", parent: a, path: "A/B" });
    const note = Object.assign(new TFile(), { basename: "B", extension: "md", name: "B.md", parent: b, path: "A/B/B.md" });
    root.children.push(a);
    a.children.push(b);
    b.children.push(note);
    const openFolderNode = vi.fn(async () => undefined);
    const app = { vault: { getAbstractFileByPath: () => null, getName: () => "Vault", getRoot: () => root }, workspace: { activeEditor: null } };
    const service = {
      children: () => [], getCanonicalFile: (path: string) => path === b.path ? note : null,
      nodeNoteCandidates: (path: string) => path === b.path ? [note] : [], nodeNoteRole: (file: TFile) => file === note ? "unique" as const : "none" as const,
      folderIdentity: (path: string) => path === b.path ? "node" as const : "incomplete" as const, fileIdentity: (file: TFile) => file === note ? "node-note" as const : "ordinary" as const,
      getFile: () => null, getFolder: (path: string) => path === a.path ? a : path === b.path ? b : null,
      isCanonicalFile: (file: TFile) => file === note, isIgnoredPath: () => false, isIgnoredRootPath: () => false,
      hiddenState: () => ({ explicit: false, sourcePath: null, unmanaged: false }), isNodeVisible: () => true, revealingHiddenNodes: () => false,
      isLeafNoteExempt: () => false, moveFile: vi.fn(async () => undefined), notePathForFolder: () => note.path,
      openFolderNode, previewPlacement: () => ({ kind: "blocked" as const, reason: "test" }), placeNode: vi.fn(async (folder: TFolder) => folder),
    };
    const actions = {
      createChild: vi.fn(), createMissingNote: vi.fn(), editVisual: vi.fn(), entryMenu: vi.fn(), homepageEnabled: () => false,
      nodeMenu: vi.fn(), openHomepage: vi.fn(), problemMenu: vi.fn(), refresh: vi.fn(), reportError: vi.fn(),
    };
    const view = new FolderNodeContentsView(
      { app } as never, service,
      { resolve: () => ({ kind: "fallback", value: "folder", accent: null, inheritedFrom: null }) as const },
      { isReferenced: () => true } as never, actions, false,
    );
    view.setFolder("A/B");

    expect([...view.contentEl.querySelectorAll<HTMLButtonElement>(".folder-nodes-breadcrumb > button")].map(({ textContent }) => textContent)).toEqual(["Vault", "A"]);
    expect(view.contentEl.querySelector(".folder-nodes-breadcrumb")?.textContent).not.toContain("B");
    expect(view.contentEl.querySelector(".folder-nodes-current-title")?.textContent).toBe("B");
    expect(view.contentEl.querySelectorAll("[aria-label='Open current Node Note']")).toHaveLength(1);
    expect(view.contentEl.querySelector(".folder-nodes-header-actions [data-icon='file-text']")).toBeNull();
    expect(view.contentEl.querySelector(".folder-nodes-header-actions [data-icon='folder-plus']")).not.toBeNull();
    expect(view.contentEl.querySelector(".folder-nodes-header-actions [data-icon='ellipsis']")).not.toBeNull();
    view.contentEl.querySelector<HTMLButtonElement>(".folder-nodes-current")?.click();
    expect(openFolderNode).toHaveBeenCalledWith("A/B", false);
    await view.onClose();
  });

  it("replaces the keyed extension and releases every callback on view close", async () => {
    for (let cycle = 0; cycle < 25; cycle += 1) {
      const view = createView();
      const first = vi.fn(() => undefined);
      const active = vi.fn(() => {
        if (view.contentEl.querySelector(":scope > .test-extension") !== null) return;
        view.contentEl.prepend(view.contentEl.ownerDocument.createElement("div"));
        view.contentEl.firstElementChild?.classList.add("test-extension");
      });
      await view.onOpen();
      view.setRenderExtension("node-graph", first);
      view.setRenderExtension("node-graph", active);
      view.refresh();
      expect(first).toHaveBeenCalledTimes(1);
      expect(active).toHaveBeenCalledTimes(2);
      expect(view.contentEl.querySelectorAll(":scope > .test-extension")).toHaveLength(1);

      await view.onClose();
      expect((view as unknown as { renderExtensions: Map<string, () => void> }).renderExtensions.size).toBe(0);
      view.refresh();
      expect(active).toHaveBeenCalledTimes(2);
    }
  });
});
