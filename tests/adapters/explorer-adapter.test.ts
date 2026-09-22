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
      children: () => [], getFolder: () => null, getFile: () => null, getCanonicalFile: () => null, nodeNoteCandidates: () => [], nodeNoteRole: () => "none", folderIdentity: () => "ordinary", fileIdentity: () => "ordinary", isCanonicalFile: () => false,
      isIgnoredPath: () => false, isIgnoredRootPath: () => false, isLeafNoteExempt: () => false, notePathForFolder: () => "Vault.md",
      openFolderNode: async () => undefined, previewPlacement: () => ({ kind: "blocked", reason: "test" }), placeNode: async () => ({ path: "" }), rootNotePath: () => "Vault.md",
      hiddenState: () => ({ explicit: false, sourcePath: null, unmanaged: false }), isNodeVisible: () => true, revealingHiddenNodes: () => false,
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
    let canonicalFile: TFile | null = file;
    const app = {
      vault: { getName: () => "Vault", getRoot: () => ({ path: "" }), getAbstractFileByPath: (path: string) => path === folder.path ? folder : null },
      workspace: { getActiveFile: () => null, getLeavesOfType: (type: string) => type === "file-explorer" ? [{ view: { containerEl: root } }] : [] },
    } as unknown as App;
    const service = {
      children: () => [], getFolder: () => folder, getFile: () => null, getCanonicalFile: () => canonicalFile, nodeNoteCandidates: () => canonicalFile === null ? [] : [canonicalFile], nodeNoteRole: () => "none", folderIdentity: () => ignored ? "unmanaged" : canonicalFile === null ? "incomplete" : "node", fileIdentity: () => "ordinary", isCanonicalFile: () => false,
      isIgnoredPath: () => ignored, isIgnoredRootPath: () => ignored, isLeafNoteExempt: () => false, notePathForFolder: () => "Hidden/Hidden.md",
      openFolderNode: async () => undefined, previewPlacement: () => ({ kind: "blocked", reason: "test" }), placeNode: async () => folder, rootNotePath: () => "Vault.md",
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
    ignored = false;
    canonicalFile = null;
    adapter.refresh();
    const incompleteBadge = title.querySelector<HTMLElement>(".folder-nodes-explorer-problem-badge.is-incomplete");
    const repair = title.querySelector<HTMLButtonElement>(".folder-nodes-explorer-repair");
    expect(incompleteBadge?.textContent).toBe("Incomplete");
    expect(repair?.nextElementSibling).toBe(incompleteBadge);
    expect(title.lastElementChild).toBe(incompleteBadge);
    adapter.stop();
    root.remove();
  });

  it("replaces a managed visual leaf disclosure with a passive dot and restores the arrow dynamically", () => {
    const root = document.createElement("div");
    root.createDiv({ cls: "nav-files-container" });
    const row = root.createDiv({ cls: "nav-folder" });
    const title = row.createDiv({ cls: "nav-folder-title", attr: { "data-path": "Leaf" } });
    const disclosure = title.createSpan({ cls: "tree-item-icon collapse-icon" });
    disclosure.append(disclosure.ownerDocument.createElementNS("http://www.w3.org/2000/svg", "svg"));
    title.createSpan({ cls: "nav-folder-title-content", text: "Leaf" });
    document.body.append(root);
    const folder = Object.assign(new TFolder(), { children: [], name: "Leaf", path: "Leaf" });
    const canonical = Object.assign(new TFile(), {
      basename: "Leaf", extension: "md", name: "Leaf.md", parent: folder, path: "Leaf/Leaf.md",
    });
    folder.children.push(canonical);
    const openFolderNode = vi.fn(async () => undefined);
    const app = {
      vault: { getName: () => "Vault", getRoot: () => ({ path: "" }), getAbstractFileByPath: (path: string) => path === folder.path ? folder : null },
      workspace: { getActiveFile: () => null, getLeavesOfType: (type: string) => type === "file-explorer" ? [{ view: { containerEl: root } }] : [] },
    } as unknown as App;
    const service = {
      children: () => [], getFolder: () => folder, getFile: () => null, getCanonicalFile: () => canonical, nodeNoteCandidates: () => [canonical], nodeNoteRole: (file: TFile) => file === canonical ? "unique" : "none", folderIdentity: () => "node", fileIdentity: () => "ordinary",
      isCanonicalFile: (file: TFile) => file === canonical, isIgnoredPath: () => false, isIgnoredRootPath: () => false,
      isLeafNoteExempt: () => false, hiddenState: () => ({ explicit: false, sourcePath: null, unmanaged: false }), isNodeVisible: () => true, revealingHiddenNodes: () => false, notePathForFolder: () => canonical.path,
      openFolderNode, previewPlacement: () => ({ kind: "blocked", reason: "test" }), placeNode: async () => folder, rootNotePath: () => "Vault.md",
    } as unknown as NodeService;
    const adapter = new ExplorerAdapter(
      app, service,
      { resolve: () => ({ kind: "fallback", value: "folder", accent: null, inheritedFrom: null }) } as unknown as VisualService,
      () => structuredClone(DEFAULT_SETTINGS),
      () => ({ createNode: "Create node", incompleteNode: "Incomplete node", missingNodeFolder: "Missing folder", missingNodeNote: "Missing note", node: "Node", nodeConflict: "Conflict", root: "Root", unmanaged: "Unmanaged" }),
      () => undefined, () => undefined, () => undefined, () => undefined,
    );

    adapter.start();
    expect(disclosure.classList.contains("folder-nodes-leaf-indicator")).toBe(true);
    expect(disclosure.getAttribute("aria-hidden")).toBe("true");
    const passiveClick = new MouseEvent("click", { bubbles: true, cancelable: true });
    expect(disclosure.dispatchEvent(passiveClick)).toBe(false);
    expect(passiveClick.defaultPrevented).toBe(true);
    expect(openFolderNode).not.toHaveBeenCalled();

    folder.children.push(Object.assign(new TFile(), {
      basename: "attachment", extension: "pdf", name: "attachment.pdf", parent: folder, path: "Leaf/attachment.pdf",
    }));
    adapter.refresh();
    expect(disclosure.classList.contains("folder-nodes-leaf-indicator")).toBe(false);
    expect(disclosure.hasAttribute("aria-hidden")).toBe(false);
    const disclosureClick = new MouseEvent("click", { bubbles: true, cancelable: true });
    expect(disclosure.dispatchEvent(disclosureClick)).toBe(true);
    expect(disclosureClick.defaultPrevented).toBe(false);
    expect(openFolderNode).not.toHaveBeenCalled();

    adapter.stop();
    root.remove();
  });

  it("limits Explorer mutation decoration to the changed folder branch", async () => {
    const root = document.createElement("div");
    const files = root.createDiv({ cls: "nav-files-container" });
    const makeFolderRow = (path: string) => {
      const row = files.createDiv({ cls: "nav-folder" });
      const title = row.createDiv({ cls: "nav-folder-title", attr: { "data-path": path } });
      title.createSpan({ cls: "tree-item-icon collapse-icon" });
      title.createSpan({ cls: "nav-folder-title-content", text: path });
      return { row, children: row.createDiv({ cls: "nav-folder-children" }) };
    };
    const aRow = makeFolderRow("A");
    makeFolderRow("B");
    document.body.append(root);

    const a = Object.assign(new TFolder(), { children: [] as Array<TFile | TFolder>, name: "A", path: "A" });
    const b = Object.assign(new TFolder(), { children: [] as Array<TFile | TFolder>, name: "B", path: "B" });
    const canonical = (folder: TFolder): TFile => Object.assign(new TFile(), {
      basename: folder.name, extension: "md", name: `${folder.name}.md`, parent: folder, path: `${folder.path}/${folder.name}.md`,
    });
    const aNote = canonical(a);
    const bNote = canonical(b);
    a.children.push(aNote);
    b.children.push(bNote);
    const folders = new Map<string, TFolder>([[a.path, a], [b.path, b]]);
    const notes = new Map<string, TFile>([[a.path, aNote], [b.path, bNote]]);
    const canonicalFiles = new Set<TFile>([aNote, bNote]);
    const folderIdentity = vi.fn((path: string) => folders.has(path) ? "node" : "ordinary");
    const app = {
      vault: { getName: () => "Vault", getRoot: () => ({ path: "" }), getAbstractFileByPath: () => null },
      workspace: { getActiveFile: () => null, getLeavesOfType: (type: string) => type === "file-explorer" ? [{ view: { containerEl: root } }] : [] },
    } as unknown as App;
    const service = {
      children: () => [], getFolder: (path: string) => folders.get(path) ?? null, getFile: () => null,
      getCanonicalFile: (path: string) => notes.get(path) ?? null,
      nodeNoteCandidates: (path: string) => notes.has(path) ? [notes.get(path)!] : [],
      nodeNoteRole: (file: TFile) => canonicalFiles.has(file) ? "unique" : "none",
      folderIdentity, fileIdentity: () => "ordinary", isCanonicalFile: (file: TFile) => canonicalFiles.has(file),
      isIgnoredPath: () => false, isIgnoredRootPath: () => false, isLeafNoteExempt: () => false,
      hiddenState: () => ({ explicit: false, sourcePath: null, unmanaged: false }), isNodeVisible: () => true, revealingHiddenNodes: () => false,
      notePathForFolder: (path: string) => notes.get(path)?.path ?? `${path}/${path}.md`, openFolderNode: async () => undefined,
      previewPlacement: () => ({ kind: "blocked", reason: "test" }), placeNode: async () => a, rootNotePath: () => "Vault.md",
    } as unknown as NodeService;
    const adapter = new ExplorerAdapter(
      app, service,
      { resolve: () => ({ kind: "fallback", value: "folder", accent: null, inheritedFrom: null }) } as unknown as VisualService,
      () => structuredClone(DEFAULT_SETTINGS),
      () => ({ createNode: "Create node", incompleteNode: "Incomplete node", missingNodeFolder: "Missing folder", missingNodeNote: "Missing note", node: "Node", nodeConflict: "Conflict", root: "Root", unmanaged: "Unmanaged" }),
      () => undefined, () => undefined, () => undefined, () => undefined,
    );

    adapter.start();
    await new Promise((resolve) => window.setTimeout(resolve, 160));
    folderIdentity.mockClear();

    const child = Object.assign(new TFolder(), { children: [] as Array<TFile | TFolder>, name: "Child", parent: a, path: "A/Child" });
    const childNote = canonical(child);
    child.children.push(childNote);
    a.children.push(child);
    folders.set(child.path, child);
    notes.set(child.path, childNote);
    canonicalFiles.add(childNote);
    const childRow = aRow.children.createDiv({ cls: "nav-folder" });
    const childTitle = childRow.createDiv({ cls: "nav-folder-title", attr: { "data-path": child.path } });
    childTitle.createSpan({ cls: "tree-item-icon collapse-icon" });
    childTitle.createSpan({ cls: "nav-folder-title-content", text: child.name });
    childRow.createDiv({ cls: "nav-folder-children" });

    await new Promise((resolve) => window.setTimeout(resolve, 160));
    const decoratedPaths = folderIdentity.mock.calls.map(([path]) => path);
    expect(decoratedPaths).toContain(child.path);
    expect(decoratedPaths).not.toContain(b.path);

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
      nodeNoteCandidates: (path: string) => path === folder.path ? [file] : [],
      nodeNoteRole: (candidate: TFile) => candidate === file ? "unique" : "none",
      folderIdentity: () => "node", fileIdentity: () => "ordinary",
      isCanonicalFile: () => false,
      isIgnoredPath: () => false,
      isIgnoredRootPath: () => false,
      isLeafNoteExempt: () => false,
      notePathForFolder: () => "Vault.md",
      openFolderNode: async () => undefined,
      previewPlacement: () => ({ kind: "blocked", reason: "test" }),
      placeNode: async () => folder,
      rootNotePath: () => "Vault.md",
      hiddenState: () => ({ explicit: false, sourcePath: null, unmanaged: false }), isNodeVisible: () => true, revealingHiddenNodes: () => false,
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
      children: () => [], getFolder: () => null, getFile: () => null, getCanonicalFile: () => null, nodeNoteCandidates: () => [], nodeNoteRole: () => "none", folderIdentity: () => "ordinary", fileIdentity: () => "ordinary", isCanonicalFile: () => false, isIgnoredPath: () => false, isIgnoredRootPath: () => false,
      isLeafNoteExempt: () => false, notePathForFolder: () => "Vault.md", openFolderNode: async () => undefined,
      previewPlacement: () => ({ kind: "blocked", reason: "test" }), placeNode: async () => ({ path: "" }), rootNotePath: () => "Vault.md",
      hiddenState: () => ({ explicit: false, sourcePath: null, unmanaged: false }), isNodeVisible: () => true, revealingHiddenNodes: () => false,
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


  it("keeps conflicting canonical candidates visible and labels the folder conflict", () => {
    const root = document.createElement("div");
    root.createDiv({ cls: "nav-files-container" });
    const folderRow = root.createDiv({ cls: "nav-folder" });
    const folderTitle = folderRow.createDiv({ cls: "nav-folder-title", attr: { "data-path": "A" } });
    folderTitle.createSpan({ cls: "nav-folder-title-content", text: "A" });
    const upperTitle = root.createDiv({ cls: "nav-file-title", attr: { "data-path": "A/A.md" } });
    const lowerTitle = root.createDiv({ cls: "nav-file-title", attr: { "data-path": "A/a.md" } });
    document.body.append(root);

    const folder = Object.assign(new TFolder(), { children: [] as Array<TFile | TFolder>, name: "A", path: "A" });
    const upper = Object.assign(new TFile(), { basename: "A", extension: "md", name: "A.md", parent: folder, path: "A/A.md" });
    const lower = Object.assign(new TFile(), { basename: "a", extension: "md", name: "a.md", parent: folder, path: "A/a.md" });
    folder.children.push(upper, lower);
    const files = new Map<string, TFile | TFolder>([[folder.path, folder], [upper.path, upper], [lower.path, lower]]);
    const app = {
      vault: { getName: () => "Vault", getRoot: () => ({ path: "" }), getAbstractFileByPath: (path: string) => files.get(path) ?? null },
      workspace: { getActiveFile: () => null, getLeavesOfType: (type: string) => type === "file-explorer" ? [{ view: { containerEl: root } }] : [] },
    } as unknown as App;
    const service = {
      children: () => [], getFolder: (path: string) => path === folder.path ? folder : null, getFile: (path: string) => files.get(path) instanceof TFile ? files.get(path) : null,
      getCanonicalFile: () => null, nodeNoteCandidates: (path: string) => path === folder.path ? [upper, lower] : [],
      nodeNoteRole: (file: TFile) => file === upper || file === lower ? "conflict" : "none", folderIdentity: () => "conflict", fileIdentity: (file: TFile) => file === upper || file === lower ? "conflict" : "ordinary", isCanonicalFile: () => false,
      isIgnoredPath: () => false, isIgnoredRootPath: () => false, isLeafNoteExempt: () => false, notePathForFolder: (path: string) => `${path}/${path}.md`,
      openFolderNode: async () => undefined, previewPlacement: () => ({ kind: "blocked", reason: "conflict" }), placeNode: async () => folder, rootNotePath: () => "Vault.md",
      hiddenState: () => ({ explicit: false, sourcePath: null, unmanaged: false }), isNodeVisible: () => true, revealingHiddenNodes: () => false,
    } as unknown as NodeService;
    const adapter = new ExplorerAdapter(
      app, service,
      { resolve: () => ({ kind: "fallback", value: "folder", accent: null, inheritedFrom: null }) } as unknown as VisualService,
      () => structuredClone(DEFAULT_SETTINGS),
      () => ({ createNode: "Create node", incompleteNode: "Incomplete", incompleteStatus: "Incomplete", missingNodeFolder: "Missing folder", missingNodeNote: "Missing note", node: "Node", nodeConflict: "Two canonical candidates", conflictStatus: "Conflict", root: "Root", unmanaged: "Unmanaged" }),
      () => undefined, () => undefined, () => undefined, () => undefined,
    );

    adapter.start();
    expect(folderTitle.querySelector(".folder-nodes-status-badge.is-conflict")?.textContent).toBe("Conflict");
    expect(folderTitle.querySelector(".folder-nodes-explorer-repair")).toBeNull();
    expect(upperTitle.classList.contains("folder-nodes-canonical-note")).toBe(false);
    expect(lowerTitle.classList.contains("folder-nodes-canonical-note")).toBe(false);
    expect(upperTitle.querySelector(".folder-nodes-status-badge.is-conflict")?.textContent).toBe("Conflict");
    expect(lowerTitle.querySelector(".folder-nodes-status-badge.is-conflict")?.textContent).toBe("Conflict");

    adapter.stop();
    root.remove();
  });

  it("settles after rendering an explicit hidden status instead of self-triggering forever", async () => {
    const root = document.createElement("div");
    root.createDiv({ cls: "nav-files-container" });
    const row = root.createDiv({ cls: "nav-folder" });
    const title = row.createDiv({ cls: "nav-folder-title", attr: { "data-path": "Hidden" } });
    title.createSpan({ cls: "nav-folder-title-content", text: "Hidden" });
    document.body.append(root);
    const folder = Object.assign(new TFolder(), { children: [] as Array<TFile | TFolder>, name: "Hidden", path: "Hidden" });
    const note = Object.assign(new TFile(), { basename: "Hidden", extension: "md", name: "Hidden.md", parent: folder, path: "Hidden/Hidden.md" });
    folder.children.push(note);
    const hiddenState = vi.fn(() => ({ explicit: true, sourcePath: "Hidden", unmanaged: false }));
    const app = {
      vault: { getName: () => "Vault", getRoot: () => ({ path: "" }), getAbstractFileByPath: (path: string) => path === folder.path ? folder : null },
      workspace: { getActiveFile: () => null, getLeavesOfType: (type: string) => type === "file-explorer" ? [{ view: { containerEl: root } }] : [] },
    } as unknown as App;
    const service = {
      children: () => [], getFolder: (path: string) => path === folder.path ? folder : null, getFile: () => null, getCanonicalFile: () => note,
      nodeNoteCandidates: () => [note], nodeNoteRole: (file: TFile) => file === note ? "unique" : "none", folderIdentity: () => "node", fileIdentity: () => "ordinary", isCanonicalFile: (file: TFile) => file === note,
      isIgnoredPath: () => false, isIgnoredRootPath: () => false, isLeafNoteExempt: () => false, notePathForFolder: () => note.path,
      hiddenState, isNodeVisible: () => true, revealingHiddenNodes: () => true, openFolderNode: async () => undefined,
      previewPlacement: () => ({ kind: "blocked", reason: "test" }), placeNode: async () => folder, rootNotePath: () => "Vault.md",
    } as unknown as NodeService;
    const adapter = new ExplorerAdapter(
      app, service,
      { resolve: () => ({ kind: "fallback", value: "folder", accent: null, inheritedFrom: null }) } as unknown as VisualService,
      () => structuredClone(DEFAULT_SETTINGS),
      () => ({ createNode: "Create node", incompleteNode: "Incomplete", missingNodeFolder: "Missing folder", missingNodeNote: "Missing note", node: "Node", nodeConflict: "Conflict", root: "Root", unmanaged: "Unmanaged", hiddenNode: "Hidden", hiddenNodeDetail: "Hidden subtree" }),
      () => undefined, () => undefined, () => undefined, () => undefined,
    );

    adapter.start();
    await new Promise((resolve) => window.setTimeout(resolve, 160));
    const settledCalls = hiddenState.mock.calls.length;
    const badge = title.querySelector(".folder-nodes-hidden-status");
    expect(badge).not.toBeNull();
    await new Promise((resolve) => window.setTimeout(resolve, 160));
    expect(hiddenState.mock.calls.length).toBe(settledCalls);
    expect(title.querySelector(".folder-nodes-hidden-status")).toBe(badge);

    adapter.stop();
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
      children: () => [], getFolder: () => null, getFile: () => null, getCanonicalFile: () => file, nodeNoteCandidates: () => [file], nodeNoteRole: (candidate: TFile) => candidate === file ? "unique" : "none", folderIdentity: () => "ordinary", fileIdentity: (candidate: TFile) => candidate === file ? "node-note" : "ordinary", isCanonicalFile: () => true, isIgnoredPath: () => false, isIgnoredRootPath: () => false,
      isLeafNoteExempt: () => false, notePathForFolder: () => "Vault.md", openFolderNode: async () => undefined,
      previewPlacement: () => ({ kind: "blocked", reason: "test" }), placeNode: async () => ({ path: "" }), rootNotePath: () => "Vault.md",
      hiddenState: () => ({ explicit: false, sourcePath: null, unmanaged: false }), isNodeVisible: () => true, revealingHiddenNodes: () => false,
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
