import { describe, expect, it, vi } from "vitest";
import { MarkdownView, TFile, TFolder, type App } from "obsidian";

import { ExplorerAdapter } from "../../src/adapters/explorer-adapter";
import type { NodeService } from "../../src/adapters/node-service";
import type { VisualService } from "../../src/adapters/visual-service";
import { DEFAULT_SETTINGS } from "../../src/shared/settings";

describe("ExplorerAdapter lifecycle", () => {
  it("binds and decorates a File Explorer surface mounted after startup", () => {
    const root = document.createElement("div");
    root.className = "workspace-leaf-content";
    const header = root.createDiv({ cls: "nav-header" });
    header.createDiv({ cls: "nav-buttons-container" });
    root.createDiv({ cls: "nav-files-container" });
    document.body.append(root);
    let explorerLeaves: Array<{ view: { containerEl: HTMLElement } }> = [];
    const app = {
      vault: { getName: () => "Vault", getRoot: () => ({ path: "" }), getAbstractFileByPath: () => null },
      workspace: {
        getActiveFile: () => null,
        getLeavesOfType: (type: string) => type === "file-explorer" ? explorerLeaves : [],
      },
    } as unknown as App;
    const service = {
      children: () => [], getFolder: () => null, getFile: () => null, getCanonicalFile: () => null, isCanonicalFile: () => false,
      isIgnoredPath: () => false, isIgnoredRootPath: () => false, isLeafNoteExempt: () => false, notePathForFolder: () => "Vault.md",
      openFolderNode: async () => undefined, placeNodeRelative: async () => ({ path: "" }), rootNotePath: () => "Vault.md",
      revealingHiddenNodes: () => false,
    } as unknown as NodeService;
    const toggleHidden = vi.fn();
    const adapter = new ExplorerAdapter(
      app, service,
      { resolve: () => ({ kind: "fallback", value: "folder", accent: null, inheritedFrom: null }) } as unknown as VisualService,
      () => structuredClone(DEFAULT_SETTINGS),
      () => ({ createNode: "Create node", incompleteNode: "Incomplete node", missingNodeFolder: "Missing folder", missingNodeNote: "Missing note", node: "Node", nodeConflict: "Conflict", root: "Root", unmanaged: "Unmanaged", showHiddenNodesThisSession: "Show hidden", hideHiddenNodesThisSession: "Hide hidden" }),
      () => undefined, () => undefined, () => undefined, () => undefined,
      true,
      toggleHidden,
    );

    adapter.start();
    expect(root.querySelector(".folder-nodes-explorer-root")).toBeNull();

    explorerLeaves = [{ view: { containerEl: root } }];
    adapter.refresh();
    expect(root.querySelectorAll(".folder-nodes-explorer-root")).toHaveLength(1);
    expect(root.querySelectorAll(".folder-nodes-create-node")).toHaveLength(1);
    const visibility = root.querySelector<HTMLButtonElement>(".folder-nodes-explorer-root-visibility");
    expect(visibility?.hidden).toBe(false);
    expect(visibility?.getAttribute("aria-label")).toBe("Show hidden");
    expect(visibility?.getAttribute("aria-pressed")).toBe("false");
    visibility?.click();
    expect(toggleHidden).toHaveBeenCalledOnce();

    adapter.stop();
    expect(root.querySelector(".folder-nodes-explorer-root")).toBeNull();
    root.remove();
  });

  it("hides managed rows, shows a text status during session reveal, and gives unmanaged precedence", () => {
    const root = document.createElement("div");
    root.createDiv({ cls: "nav-files-container" });
    const row = root.createDiv({ cls: "nav-folder" });
    const title = row.createDiv({ cls: "nav-folder-title", attr: { "data-path": "Hidden" } });
    title.createSpan({ cls: "nav-folder-title-content", text: "Hidden" });
    document.body.append(root);
    const folder = Object.assign(new TFolder(), { name: "Hidden", path: "Hidden" });
    const file = Object.assign(new TFile(), { basename: "Hidden", extension: "md", name: "Hidden.md", parent: folder, path: "Hidden/Hidden.md" });
    let reveal = false;
    let ignored = false;
    let explicit = true;
    const app = {
      vault: { getName: () => "Vault", getRoot: () => ({ path: "" }), getAbstractFileByPath: (path: string) => path === folder.path ? folder : null },
      workspace: { getActiveFile: () => null, getLeavesOfType: (type: string) => type === "file-explorer" ? [{ view: { containerEl: root } }] : [] },
    } as unknown as App;
    const service = {
      children: () => [], getFolder: () => folder, getFile: () => null, getCanonicalFile: () => file, isCanonicalFile: () => false,
      isIgnoredPath: () => ignored, isIgnoredRootPath: () => ignored, isLeafNoteExempt: () => false, notePathForFolder: () => "Hidden/Hidden.md",
      openFolderNode: async () => undefined, placeNodeRelative: async () => folder, rootNotePath: () => "Vault.md",
      hiddenState: () => ({ explicit, sourcePath: "Hidden", unmanaged: ignored }), isNodeVisible: () => ignored || reveal, revealingHiddenNodes: () => reveal,
    } as unknown as NodeService;
    const adapter = new ExplorerAdapter(
      app, service,
      { resolve: () => ({ kind: "fallback", value: "folder", accent: null, inheritedFrom: null }) } as unknown as VisualService,
      () => structuredClone(DEFAULT_SETTINGS),
      () => ({ createNode: "Create node", incompleteNode: "Incomplete node", incompleteStatus: "Incomplete", missingNodeFolder: "Missing folder", missingNodeNote: "Missing note", node: "Node", nodeConflict: "Same-named node already exists", conflictStatus: "Conflict", root: "Root", unmanaged: "Unmanaged", unmanagedDetail: "Not managed", hiddenNode: "Hidden", hiddenNodeDetail: "This node and its subtree are hidden", hiddenByNode: (path) => `Hidden by ${path}` }),
      () => undefined, () => undefined, () => undefined, () => undefined,
    );

    adapter.start();
    expect(row.classList.contains("folder-nodes-hidden-node")).toBe(true);
    reveal = true;
    adapter.refresh();
    expect(row.classList.contains("folder-nodes-hidden-node")).toBe(false);
    const hiddenBadge = title.querySelector<HTMLElement>(".folder-nodes-hidden-status.is-hidden");
    expect(hiddenBadge?.textContent).toBe("Hidden");
    expect(hiddenBadge?.querySelector("svg")).toBeNull();
    expect(hiddenBadge?.getAttribute("title")).toBe("This node and its subtree are hidden");
    explicit = false;
    adapter.refresh();
    expect(title.querySelector(".folder-nodes-hidden-status")).toBeNull();
    expect(title.classList.contains("folder-nodes-hidden-inherited")).toBe(true);
    expect(title.getAttribute("title")).toBe("Hidden by Hidden");
    ignored = true;
    explicit = true;
    adapter.refresh();
    expect(title.querySelector(".folder-nodes-hidden-status")).toBeNull();
    expect(title.textContent).toContain("Unmanaged");
    expect(title.querySelector(".is-unmanaged")?.getAttribute("title")).toBe("Not managed");
    adapter.stop();
    root.remove();
  });

  it("keeps Explorer decoration but does not claim draggable ownership on mobile", () => {
    const root = document.createElement("div");
    root.createDiv({ cls: "nav-files-container" });
    const title = root.createDiv({ cls: "nav-folder-title", attr: { "data-path": "Node" } });
    title.createSpan({ cls: "nav-folder-title-content", text: "Node" });
    document.body.append(root);
    const folder = Object.assign(new TFolder(), { name: "Node", path: "Node" });
    const file = Object.assign(new TFile(), {
      basename: "Node",
      extension: "md",
      name: "Node.md",
      parent: folder,
      path: "Node/Node.md",
    });
    const app = {
      vault: {
        getName: () => "Vault",
        getRoot: () => ({ path: "" }),
        getAbstractFileByPath: (path: string) => path === folder.path ? folder : null,
      },
      workspace: {
        getActiveFile: () => null,
        getLeavesOfType: (type: string) => type === "file-explorer"
          ? [{ view: { containerEl: root } }]
          : [],
      },
    } as unknown as App;
    const service = {
      children: () => [],
      getFolder: (path: string) => path === folder.path ? folder : null,
      getFile: () => null,
      getCanonicalFile: (path: string) => path === folder.path ? file : null,
      isCanonicalFile: () => false,
      isIgnoredPath: () => false,
      isIgnoredRootPath: () => false,
      isLeafNoteExempt: () => false,
      notePathForFolder: () => "Vault.md",
      openFolderNode: async () => undefined,
      placeNodeRelative: async () => folder,
      rootNotePath: () => "Vault.md",
    } as unknown as NodeService;
    const adapter = new ExplorerAdapter(
      app,
      service,
      { resolve: () => ({
        kind: "lucide",
        value: "folder-tree",
        accent: null,
        inheritedFrom: null,
      }) } as unknown as VisualService,
      () => structuredClone(DEFAULT_SETTINGS),
      () => ({ createNode: "Create node", incompleteNode: "Incomplete node", missingNodeFolder: "Missing folder", missingNodeNote: "Missing note", node: "Node", nodeConflict: "Conflict", root: "Root", unmanaged: "Unmanaged" }),
      () => undefined,
      () => undefined,
      () => undefined,
      () => undefined,
      false,
    );

    adapter.start();
    expect(title.classList.contains("folder-nodes-node")).toBe(true);
    expect(title.hasAttribute("draggable")).toBe(false);
    expect(title.dataset.folderNodesOriginalDraggable).toBeUndefined();

    adapter.stop();
    root.remove();
  });

  it("decorates only registered Explorer surfaces and removes all owned DOM on stop", () => {
    const root = document.createElement("div");
    root.className = "workspace-leaf-content";
    const header = root.createDiv({ cls: "nav-header" });
    const actions = header.createDiv({ cls: "nav-buttons-container" });
    actions.createEl("button", { attr: { "aria-label": "New note" } });
    actions.createEl("button", { attr: { "aria-label": "New folder" } });
    root.createDiv({ cls: "nav-files-container" });
    document.body.append(root);
    const app = {
      vault: { getName: () => "Vault", getRoot: () => ({ path: "" }), getAbstractFileByPath: () => null },
      workspace: {
        getActiveFile: () => null,
        getLeavesOfType: (type: string) => type === "file-explorer" ? [{ view: { containerEl: root } }] : [],
      },
    } as unknown as App;
    const service = {
      children: () => [], getFolder: () => null, getFile: () => null, getCanonicalFile: () => null, isCanonicalFile: () => false, isIgnoredPath: () => false, isIgnoredRootPath: () => false,
      isLeafNoteExempt: () => false, notePathForFolder: () => "Vault.md", openFolderNode: async () => undefined,
      placeNodeRelative: async () => ({ path: "" }), rootNotePath: () => "Vault.md",
    } as unknown as NodeService;
    const adapter = new ExplorerAdapter(
      app, service,
      { resolve: () => ({ kind: "fallback", value: "folder", accent: null, inheritedFrom: null }) } as unknown as VisualService,
      () => structuredClone(DEFAULT_SETTINGS),
      () => ({ createNode: "Create node", incompleteNode: "Incomplete node", missingNodeFolder: "Missing folder", missingNodeNote: "Missing note", node: "Node", nodeConflict: "Conflict", root: "Root", unmanaged: "Unmanaged" }),
      () => undefined, () => undefined, () => undefined, () => undefined,
    );

    adapter.start();
    expect(root.querySelectorAll(".folder-nodes-explorer-root")).toHaveLength(1);
    expect(root.querySelectorAll(".folder-nodes-create-node")).toHaveLength(1);
    expect(actions.querySelectorAll(":scope > [aria-label='New note'], :scope > [aria-label='New folder']")).toHaveLength(2);
    const rootRow = root.querySelector(".folder-nodes-explorer-root");
    const rootVisual = root.querySelector(".folder-nodes-explorer-root-icon > svg");
    adapter.refresh();
    adapter.refresh();
    expect(root.querySelector(".folder-nodes-explorer-root")).toBe(rootRow);
    expect(root.querySelector(".folder-nodes-explorer-root-icon > svg")).toBe(rootVisual);

    adapter.stop();
    expect(root.querySelector(".folder-nodes-explorer-root")).toBeNull();
    expect(root.querySelector(".folder-nodes-create-node")).toBeNull();
    expect(root.querySelector(".folder-nodes-native-create-hidden")).toBeNull();
    root.remove();
  });

  it("observes late inline-title creation and keeps the icon outside editable title text", async () => {
    const explorerRoot = document.createElement("div");
    explorerRoot.createDiv({ cls: "nav-files-container" });
    document.body.append(explorerRoot);
    const markdownView = new MarkdownView({} as never);
    document.body.append(markdownView.containerEl);
    const folder = Object.assign(new TFolder(), { name: "Node", path: "Node" });
    const file = Object.assign(new TFile(), { basename: "Node", extension: "md", name: "Node.md", parent: folder, path: "Node/Node.md" });
    markdownView.file = file;
    const app = {
      vault: { getName: () => "Vault", getRoot: () => ({ path: "" }), getAbstractFileByPath: () => null },
      workspace: {
        getActiveFile: () => file,
        getLeavesOfType: (type: string) => type === "file-explorer" ? [{ view: { containerEl: explorerRoot } }] : type === "markdown" ? [{ view: markdownView }] : [],
      },
    } as unknown as App;
    const service = {
      children: () => [], getFolder: () => null, getFile: () => null, getCanonicalFile: () => file, isCanonicalFile: () => true, isIgnoredPath: () => false, isIgnoredRootPath: () => false,
      isLeafNoteExempt: () => false, notePathForFolder: () => "Vault.md", openFolderNode: async () => undefined,
      placeNodeRelative: async () => ({ path: "" }), rootNotePath: () => "Vault.md",
    } as unknown as NodeService;
    const adapter = new ExplorerAdapter(
      app, service,
      { resolve: () => ({ kind: "lucide", value: "folder-tree", accent: null, inheritedFrom: null }) } as unknown as VisualService,
      () => ({ ...structuredClone(DEFAULT_SETTINGS), showIconInNoteTitle: true }),
      () => ({ createNode: "Create node", incompleteNode: "Incomplete node", missingNodeFolder: "Missing folder", missingNodeNote: "Missing note", node: "Node", nodeConflict: "Conflict", root: "Root", unmanaged: "Unmanaged" }),
      () => undefined, () => undefined, () => undefined, () => undefined,
    );

    adapter.start();
    const host = markdownView.containerEl.createDiv();
    const title = host.createDiv({ cls: "inline-title", text: "Node" });
    await new Promise((resolve) => window.setTimeout(resolve, 80));

    const icon = host.querySelector<HTMLElement>(":scope > .folder-nodes-note-title-icon");
    expect(icon).not.toBeNull();
    expect(icon?.nextElementSibling).toBe(title);
    expect(icon?.contentEditable).toBe("false");
    expect(title.textContent).toBe("Node");
    expect(title.querySelector(".folder-nodes-note-title-icon")).toBeNull();

    adapter.stop();
    expect(host.querySelector(".folder-nodes-note-title-icon")).toBeNull();
    expect(title.classList.contains("folder-nodes-has-title-icon")).toBe(false);
    explorerRoot.remove();
    markdownView.containerEl.remove();
  });
});
