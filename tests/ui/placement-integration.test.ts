import { describe, expect, it, vi } from "vitest";
import { NodeService } from "../../src/adapters/node-service";
import { ExplorerAdapter } from "../../src/adapters/explorer-adapter";
import { FolderNodeContentsView } from "../../src/ui/contents-view";
import { formatError, setLanguage, t } from "../../src/ui/i18n";
import { DEFAULT_SETTINGS } from "../../src/shared/settings";
import { FakeObsidian } from "../helpers/fake-obsidian";

function dragEvent(type: string, clientY = -1): DragEvent {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: -1, clientY });
  Object.defineProperty(event, "dataTransfer", { value: { setData: vi.fn(), effectAllowed: "all", dropEffect: "none" } });
  return event as DragEvent;
}
const visual = { resolve: () => ({ kind: "fallback", value: "folder", accent: null, inheritedFrom: null }) as const };
const labels = () => ({ createNode: "Create", incompleteNode: "Incomplete", missingNodeFolder: "Missing folder", missingNodeNote: "Missing note", node: "Node", nodeConflict: "Conflict", root: "Root", unmanaged: "Unmanaged" });
function addNode(fake: FakeObsidian, path: string, tokens: string[] = []) {
  const folder = fake.addFolder(path);
  const source = tokens.length === 0 ? "" : `---\nfolder-nodes:\n${tokens.map((token) => `  - ${token}`).join("\n")}\n---\n`;
  fake.addFile(`${path}/${folder.name}.md`, source, tokens.length ? { "folder-nodes": tokens } : {});
  return folder;
}
function makeView(fake: FakeObsidian, nodes: NodeService, reportError = vi.fn()) {
  fake.app.fileManager.generateMarkdownLink = vi.fn((file) => `[[${file.path}]]`);
  const actions = { createChild: vi.fn(), createMissingNote: vi.fn(), editVisual: vi.fn(), entryMenu: vi.fn(), homepageEnabled: () => false, nodeMenu: vi.fn(), openHomepage: vi.fn(), problemMenu: vi.fn(), refresh: vi.fn(), reportError };
  return new FolderNodeContentsView({ app: fake.app } as never, nodes, visual, { isReferenced: () => false } as never, actions, true);
}

async function manualSiblings() {
  const fake = new FakeObsidian();
  fake.addFile("Vault.md", "---\nfolder-nodes:\n  - order=manual\n---\n", { "folder-nodes": ["order=manual"] });
  for (const [index, path] of ["A", "B", "C", "D"].entries()) addNode(fake, path, [`rank=${(index + 1) * 1024}`]);
  const nodes = new NodeService(fake.app, () => structuredClone(DEFAULT_SETTINGS));
  const view = makeView(fake, nodes);
  await view.onOpen();
  const handle = (path: string) => view.contentEl.querySelector<HTMLElement>(`[data-node-path='${path}'] .folder-nodes-node-drag-handle`)!;
  const card = (path: string) => view.contentEl.querySelector<HTMLElement>(`[data-node-path='${path}'] .folder-nodes-node-card`)!;
  return { fake, nodes, view, handle, card, place: vi.spyOn(nodes, "placeNode") };
}

describe("Placement and identity integration", () => {
  it("accepts entry into a new child of the same card when the mouse is released before another dragover", async () => {
    const { nodes, view, handle, card, place } = await manualSiblings();
    try {
      handle("C").dispatchEvent(dragEvent("dragstart"));
      card("A").querySelector(".folder-nodes-node-visual")!.dispatchEvent(dragEvent("dragover"));
      const enter = dragEvent("dragenter");
      card("A").dispatchEvent(enter);
      expect(enter.defaultPrevented).toBe(true);
      expect(enter.dataTransfer?.dropEffect).toBe("move");
      expect(place).not.toHaveBeenCalled();
      card("A").dispatchEvent(dragEvent("drop"));
      await vi.waitFor(() => expect(nodes.children("").map((entry) => entry.childPath)).toEqual(["C", "A", "B", "D"]));
      expect(place).toHaveBeenCalledOnce();
    } finally { await view.onClose(); }
  });

  it.each([
    { replaced: "A", end: "before", accepted: false },
    { replaced: "B", end: "before", accepted: false },
    { replaced: "B", end: "after", accepted: false },
    { replaced: "A", end: "after", accepted: true },
  ])("checks the rendered card and current gap after replacing $replaced, ending $end B", async ({ replaced, end, accepted }) => {
    const { fake, nodes, view, handle, card, place } = await manualSiblings();
    try {
      handle("D").dispatchEvent(dragEvent("dragstart"));
      card("B").dispatchEvent(dragEvent("dragover"));
      await fake.app.fileManager.trashFile(fake.requireFolder(replaced));
      addNode(fake, replaced, [replaced === "A" ? "rank=1024" : "rank=2048"]);
      const y = end === "before" ? -1 : 1;
      const enter = dragEvent("dragenter", y);
      card("B").dispatchEvent(enter);
      expect(enter.dataTransfer?.dropEffect).toBe(accepted ? "move" : "none");
      card("B").dispatchEvent(dragEvent("drop", y));
      expect(place).toHaveBeenCalledTimes(accepted ? 1 : 0);
      await vi.waitFor(() => expect(nodes.children("").map((entry) => entry.childPath)).toEqual(
        accepted ? ["A", "B", "D", "C"] : ["A", "B", "C", "D"]));
    } finally { await view.onClose(); }
  });

  it("clears an accepted sibling gap when the view receives Escape", async () => {
    const { view, handle, card, place } = await manualSiblings();
    try {
      handle("C").dispatchEvent(dragEvent("dragstart"));
      card("A").dispatchEvent(dragEvent("dragenter"));
      view.containerEl.ownerDocument.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      card("A").dispatchEvent(dragEvent("drop"));
      expect(place).not.toHaveBeenCalled();
    } finally { await view.onClose(); }
  });

  it("rejects dragging a sibling onto itself with localized feedback", async () => {
    const fake = new FakeObsidian();
    fake.addFile("Vault.md", "", { "folder-nodes": ["order=manual"] });
    addNode(fake, "A", ["rank=1024"]);
    addNode(fake, "B", ["rank=2048"]);
    const nodes = new NodeService(fake.app, () => structuredClone(DEFAULT_SETTINGS));
    const reportError = vi.fn();
    const view = makeView(fake, nodes, reportError);
    setLanguage("zh-CN");
    await view.onOpen();
    try {
      const source = view.contentEl.querySelector<HTMLElement>("[data-node-path='A'] .folder-nodes-node-drag-handle")!;
      const target = view.contentEl.querySelector<HTMLElement>("[data-node-path='A']")!;
      source.dispatchEvent(dragEvent("dragstart"));
      target.dispatchEvent(dragEvent("dragover"));
      expect(view.contentEl.querySelector(".folder-nodes-placement-feedback")?.textContent)
        .toBe(t("errorInvalidDropTarget"));
      target.dispatchEvent(dragEvent("drop"));
      expect(reportError).toHaveBeenCalledOnce();
      expect(formatError(reportError.mock.calls[0]?.[0])).toBe(t("errorInvalidDropTarget"));
      expect(fake.renames).toHaveLength(0);
    } finally {
      setLanguage("auto");
      await view.onClose();
    }
  });

  it.each(["", "/"])("moves a single file to the original Root with raw path %j", async (rootPath) => {
    const fake = new FakeObsidian();
    fake.root.path = rootPath;
    fake.addFile("Vault.md");
    addNode(fake, "Source");
    const file = fake.addFile("Source/file.txt", "original");
    const nodes = new NodeService(fake.app, () => structuredClone(DEFAULT_SETTINGS));
    const view = makeView(fake, nodes);
    view.setFolder("Source");
    try {
      view.contentEl.querySelector<HTMLElement>("[data-folder-nodes-focus-key='file:Source/file.txt']")!.dispatchEvent(dragEvent("dragstart"));
      view.contentEl.querySelector<HTMLElement>("[data-folder-nodes-focus-key='breadcrumb:']")!.dispatchEvent(dragEvent("drop"));
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(file.path).toBe("file.txt");
      expect(fake.requireFile("file.txt")).toBe(file);
      expect(fake.renames).toEqual([{ from: "Source/file.txt", to: "file.txt" }]);
    } finally { await view.onClose(); }
  });
  it.each(["file", "media"])("moves the original single %s item into a bound target", async (kind) => {
    const fake = new FakeObsidian();
    fake.addFile("Vault.md");
    addNode(fake, "Target");
    const file = fake.addFile(kind === "file" ? "file.txt" : "video.mp4", "original");
    const nodes = new NodeService(fake.app, () => structuredClone(DEFAULT_SETTINGS));
    const view = makeView(fake, nodes);
    await view.onOpen();
    try {
      const source = view.contentEl.querySelector<HTMLElement>(`[data-folder-nodes-focus-key='${kind === "file" ? "file" : "media"}:${file.path}']`)!;
      const target = view.contentEl.querySelector<HTMLElement>("[data-node-path='Target'] .folder-nodes-node-card")!;
      source.dispatchEvent(dragEvent("dragstart"));
      target.dispatchEvent(dragEvent("dragover"));
      target.dispatchEvent(dragEvent("drop"));
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(file.path).toBe(`Target/${kind === "file" ? "file.txt" : "video.mp4"}`);
      expect(fake.requireFile(file.path)).toBe(file);
      expect(fake.renames).toHaveLength(1);
    } finally { await view.onClose(); }
  });

  it.each(["rename-replace", "delete-replace", "target-replace", "target-rename"])("refuses stale Contents content drag: %s", async (change) => {
    const fake = new FakeObsidian();
    fake.addFile("Vault.md");
    const target = addNode(fake, "Target");
    const file = fake.addFile("file.txt", "original");
    const errors = vi.fn();
    const nodes = new NodeService(fake.app, () => structuredClone(DEFAULT_SETTINGS));
    const move = vi.spyOn(nodes, "moveFile");
    const view = makeView(fake, nodes, errors);
    await view.onOpen();
    try {
      const source = view.contentEl.querySelector<HTMLElement>("[data-folder-nodes-focus-key='file:file.txt']")!;
      const destination = view.contentEl.querySelector<HTMLElement>("[data-node-path='Target'] .folder-nodes-node-card")!;
      source.dispatchEvent(dragEvent("dragstart"));
      destination.dispatchEvent(dragEvent("dragover"));
      if (change === "rename-replace") { await fake.rename(file, "renamed.txt"); fake.addFile("file.txt", "replacement"); }
      if (change === "delete-replace") { fake.remove("file.txt"); fake.addFile("file.txt", "replacement"); }
      if (change === "target-replace") { fake.remove("Target"); addNode(fake, "Target"); }
      if (change === "target-rename") await fake.rename(target, "RenamedTarget");
      const count = fake.renames.length;
      destination.dispatchEvent(dragEvent("drop"));
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(move).not.toHaveBeenCalled();
      expect(errors).toHaveBeenCalledOnce();
      expect(fake.renames).toHaveLength(count);
      expect(destination.classList.contains("folder-nodes-content-drop-into")).toBe(false);
    } finally { await view.onClose(); }
  });

  it.each(["Escape", "dragend", "close"])("clears content drag ownership on %s", async (cancel) => {
    const fake = new FakeObsidian();
    fake.addFile("Vault.md");
    addNode(fake, "Target");
    fake.addFile("file.txt");
    const nodes = new NodeService(fake.app, () => structuredClone(DEFAULT_SETTINGS));
    const view = makeView(fake, nodes);
    await view.onOpen();
    try {
      const source = view.contentEl.querySelector<HTMLElement>("[data-folder-nodes-focus-key='file:file.txt']")!;
      const target = view.contentEl.querySelector<HTMLElement>("[data-node-path='Target'] .folder-nodes-node-card")!;
      source.dispatchEvent(dragEvent("dragstart"));
      target.dispatchEvent(dragEvent("dragover"));
      if (cancel === "Escape") view.containerEl.ownerDocument.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      if (cancel === "dragend") source.dispatchEvent(dragEvent("dragend"));
      if (cancel === "close") await view.onClose();
      target.dispatchEvent(dragEvent("drop"));
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(fake.renames).toEqual([]);
      expect(source.classList.contains("folder-nodes-is-dragging")).toBe(false);
      expect(target.classList.contains("folder-nodes-content-drop-into")).toBe(false);
    } finally { await view.onClose(); }
  });
  it("keeps a multi-selection drag as link copy without moving any item", async () => {
    const fake = new FakeObsidian();
    fake.addFile("Vault.md");
    addNode(fake, "Target");
    fake.addFile("first.txt");
    fake.addFile("second.txt");
    const nodes = new NodeService(fake.app, () => structuredClone(DEFAULT_SETTINGS));
    const view = makeView(fake, nodes);
    await view.onOpen();
    try {
      view.contentEl.querySelector<HTMLButtonElement>("[data-folder-nodes-focus-key='header:selection']")!.click();
      for (const path of ["first.txt", "second.txt"]) {
        view.contentEl.querySelector<HTMLButtonElement>(`[data-folder-nodes-focus-key='file:${path}']`)!.click();
      }
      const source = view.contentEl.querySelector<HTMLElement>("[data-folder-nodes-focus-key='file:first.txt']")!;
      const start = dragEvent("dragstart");
      source.dispatchEvent(start);
      expect((start as unknown as DragEvent).dataTransfer?.effectAllowed).toBe("copy");
      const target = view.contentEl.querySelector<HTMLElement>("[data-node-path='Target'] .folder-nodes-node-card")!;
      target.dispatchEvent(dragEvent("drop"));
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(fake.renames).toEqual([]);
    } finally { await view.onClose(); }
  });
  it("keeps the same-named Markdown visible inside an unmanaged folder", () => {
    const fake = new FakeObsidian();
    addNode(fake, "Unmanaged");
    const settings = structuredClone(DEFAULT_SETTINGS);
    settings.ignoredFolders.push("Unmanaged");
    const nodes = new NodeService(fake.app, () => settings);
    const root = document.createElement("div");
    const tree = root.createDiv({ cls: "nav-files-container" });
    const file = tree.createDiv({ cls: "nav-file-title", attr: { "data-path": "Unmanaged/Unmanaged.md" } });
    file.createSpan({ cls: "nav-file-title-content", text: "Unmanaged" });
    document.body.append(root);
    Object.assign(fake.app.workspace, { getActiveFile: () => null, getLeavesOfType: (type: string) => type === "file-explorer" ? [{ view: { containerEl: root } }] : [] });
    const adapter = new ExplorerAdapter(fake.app, nodes, visual as never, () => settings, labels, () => {}, () => {}, () => {}, () => {});
    try {
      adapter.start();
      expect(nodes.fileIdentity(fake.requireFile("Unmanaged/Unmanaged.md"))).toBe("ordinary");
      expect(file.classList.contains("folder-nodes-canonical-note")).toBe(false);
    } finally { adapter.stop(); root.remove(); }
  });

  it("rejects Contents insertion immediately after a hidden sibling", async () => {
    const fake = new FakeObsidian();
    fake.addFile("Vault.md", "---\nfolder-nodes:\n  - order=manual\n---\n", { "folder-nodes": ["order=manual"] });
    addNode(fake, "A", ["rank=1024"]);
    addNode(fake, "Hidden", ["rank=2048", "hidden=true"]);
    addNode(fake, "B", ["rank=3072"]);
    addNode(fake, "C", ["rank=4096"]);
    let reveal = false;
    const nodes = new NodeService(fake.app, () => structuredClone(DEFAULT_SETTINGS), () => reveal);
    const place = vi.spyOn(nodes, "placeNode");
    const view = makeView(fake, nodes);
    await view.onOpen();
    try {
      const b = view.contentEl.querySelector<HTMLElement>("[data-node-path='B']")!;
      expect(view.contentEl.querySelector("[data-node-path='Hidden']")).toBeNull();
      view.contentEl.querySelector<HTMLElement>("[data-node-path='C'] .folder-nodes-node-drag-handle")!.dispatchEvent(dragEvent("dragstart"));
      const enter = dragEvent("dragenter");
      b.dispatchEvent(enter);
      expect(enter.dataTransfer?.dropEffect).toBe("none");
      b.dispatchEvent(dragEvent("dragover"));
      expect(view.contentEl.querySelector(".folder-nodes-placement-feedback")?.textContent).toContain("hidden nodes");
      b.dispatchEvent(dragEvent("drop"));
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(place).not.toHaveBeenCalled();
      reveal = true;
      view.refresh();
      const revealedB = view.contentEl.querySelector<HTMLElement>("[data-node-path='B']")!;
      view.contentEl.querySelector<HTMLElement>("[data-node-path='C'] .folder-nodes-node-drag-handle")!.dispatchEvent(dragEvent("dragstart"));
      revealedB.dispatchEvent(dragEvent("dragover"));
      revealedB.dispatchEvent(dragEvent("drop"));
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(place).toHaveBeenCalledOnce();
      expect(nodes.children("").map((entry) => entry.childPath)).toEqual(["A", "Hidden", "C", "B"]);
    } finally { await view.onClose(); }
  });

  it("blocks a known destination collision during placement preview", () => {
    const fake = new FakeObsidian();
    const source = addNode(fake, "Source");
    addNode(fake, "Target");
    addNode(fake, "Target/Source");
    const nodes = new NodeService(fake.app, () => structuredClone(DEFAULT_SETTINGS));
    expect(nodes.previewPlacement(source.path, { kind: "move-into", parentPath: "Target" }).kind).toBe("blocked");
  });

  it("uses one Explorer gap and anchors the final gap after the expanded subtree", async () => {
    const fake = new FakeObsidian();
    fake.addFile("Vault.md", "", { "folder-nodes": ["order=manual"] });
    for (const [index, path] of ["C", "A", "B"].entries()) addNode(fake, path, [`rank=${(index + 1) * 1024}`]);
    addNode(fake, "B/Child");
    const nodes = new NodeService(fake.app, () => structuredClone(DEFAULT_SETTINGS));
    const root = document.createElement("div");
    const tree = root.createDiv({ cls: "nav-files-container" });
    const titles = new Map<string, HTMLElement>();
    for (const path of ["A", "B", "C"]) {
      const row = tree.createDiv({ cls: "nav-folder" });
      const title = row.createDiv({ cls: "nav-folder-title", attr: { "data-path": path } });
      title.createSpan({ cls: "nav-folder-title-content", text: path });
      vi.spyOn(title, "getBoundingClientRect").mockReturnValue({ top: 0, height: 40 } as DOMRect);
      titles.set(path, title);
      if (path === "B") row.createDiv({ cls: "nav-folder-children", text: "Visible descendant" });
    }
    document.body.append(root);
    Object.assign(fake.app.workspace, { getActiveFile: () => null, getLeavesOfType: (type: string) => type === "file-explorer" ? [{ view: { containerEl: root } }] : [] });
    const errors = vi.fn();
    const adapter = new ExplorerAdapter(fake.app, nodes, visual as never, () => structuredClone(DEFAULT_SETTINGS), labels, () => {}, () => {}, () => {}, errors);
    const hover = (path: string, y: number) => {
      const event = dragEvent("dragover");
      Object.defineProperty(event, "clientY", { value: y });
      titles.get(path)!.dispatchEvent(event);
    };
    try {
      adapter.start();
      titles.get("C")!.dispatchEvent(dragEvent("dragstart"));
      hover("A", 39);
      expect(titles.get("B")!.classList.contains("folder-nodes-drop-before")).toBe(true);
      hover("B", 1);
      expect(tree.querySelectorAll(".folder-nodes-drop-before")).toHaveLength(1);
      hover("B", 39);
      expect(titles.get("B")!.parentElement!.classList.contains("folder-nodes-drop-after")).toBe(true);
      expect(titles.get("B")!.classList.contains("folder-nodes-drop-after")).toBe(false);
      hover("B", 1);
      fake.remove("B");
      addNode(fake, "B", ["rank=2048"]);
      titles.get("B")!.dispatchEvent(dragEvent("drop"));
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(errors).toHaveBeenCalledOnce();
      expect(fake.renames).toEqual([]);
    } finally { adapter.stop(); root.remove(); }
  });

  it("preserves focus on the Nodes section disclosure during same-node refresh", async () => {
    const fake = new FakeObsidian();
    addNode(fake, "A");
    const nodes = new NodeService(fake.app, () => structuredClone(DEFAULT_SETTINGS));
    const view = makeView(fake, nodes);
    document.body.append(view.containerEl);
    await view.onOpen();
    try {
      const summary = view.contentEl.querySelector<HTMLElement>("summary")!;
      summary.tabIndex = 0;
      summary.focus();
      expect(document.activeElement).toBe(summary);
      view.refresh();
      expect(document.activeElement).toBe(view.contentEl.querySelector("summary"));
    } finally { await view.onClose(); view.containerEl.remove(); }
  });

  it("does not offer to create a missing note when the current node has conflicting notes", async () => {
    const fake = new FakeObsidian();
    addNode(fake, "A");
    fake.addFile("A/a.md");
    const nodes = new NodeService(fake.app, () => structuredClone(DEFAULT_SETTINGS));
    const view = makeView(fake, nodes);
    try {
      view.setFolder("A");
      expect(nodes.folderIdentity("A")).toBe("conflict");
      expect(view.contentEl.querySelector(".folder-nodes-current-title .is-conflict")).not.toBeNull();
      expect(view.contentEl.querySelector("[aria-label='Create missing Node Note']")).toBeNull();
    } finally { await view.onClose(); }
  });
});
