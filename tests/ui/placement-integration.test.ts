import { describe, expect, it, vi } from "vitest";
import { NodeService } from "../../src/adapters/node-service";
import { ExplorerAdapter } from "../../src/adapters/explorer-adapter";
import { FolderNodeContentsView } from "../../src/ui/contents-view";
import { DEFAULT_SETTINGS } from "../../src/shared/settings";
import { FakeObsidian } from "../helpers/fake-obsidian";

function dragEvent(type: string): MouseEvent {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: -1, clientY: -1 });
  Object.defineProperty(event, "dataTransfer", { value: { setData: vi.fn(), effectAllowed: "all", dropEffect: "none" } });
  return event;
}
const visual = { resolve: () => ({ kind: "fallback", value: "folder", accent: null, inheritedFrom: null }) as const };
const labels = () => ({ createNode: "Create", incompleteNode: "Incomplete", missingNodeFolder: "Missing folder", missingNodeNote: "Missing note", node: "Node", nodeConflict: "Conflict", root: "Root", unmanaged: "Unmanaged" });
function addNode(fake: FakeObsidian, path: string, tokens: string[] = []) {
  const folder = fake.addFolder(path);
  const source = tokens.length === 0 ? "" : `---\nfolder-nodes:\n${tokens.map((token) => `  - ${token}`).join("\n")}\n---\n`;
  fake.addFile(`${path}/${folder.name}.md`, source, tokens.length ? { "folder-nodes": tokens } : {});
  return folder;
}
function makeView(fake: FakeObsidian, nodes: NodeService) {
  const actions = { createChild: vi.fn(), createMissingNote: vi.fn(), editVisual: vi.fn(), entryMenu: vi.fn(), homepageEnabled: () => false, nodeMenu: vi.fn(), openHomepage: vi.fn(), problemMenu: vi.fn(), refresh: vi.fn(), reportError: vi.fn() };
  return new FolderNodeContentsView({ app: fake.app } as never, nodes, visual, { isReferenced: () => false } as never, actions, true);
}

describe("Placement and identity integration", () => {
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
