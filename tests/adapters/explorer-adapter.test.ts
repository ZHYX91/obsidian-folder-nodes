import { describe, expect, it } from "vitest";
import { MarkdownView, TFile, TFolder, type App } from "obsidian";

import { ExplorerAdapter } from "../../src/adapters/explorer-adapter";
import type { NodeService } from "../../src/adapters/node-service";
import type { VisualService } from "../../src/adapters/visual-service";
import { DEFAULT_SETTINGS } from "../../src/shared/settings";

describe("ExplorerAdapter lifecycle", () => {
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
      children: () => [], getFolder: () => null, getFile: () => null, getCanonicalFile: () => null, isCanonicalFile: () => false, isIgnoredPath: () => false,
      isLeafNoteExempt: () => false, notePathForFolder: () => "Vault.md", openFolderNode: async () => undefined,
      placeNodeRelative: async () => ({ path: "" }), rootNotePath: () => "Vault.md",
    } as unknown as NodeService;
    const adapter = new ExplorerAdapter(
      app, service,
      { resolve: () => ({ kind: "fallback", value: "folder", accent: null, inheritedFrom: null }) } as unknown as VisualService,
      () => ({ ...structuredClone(DEFAULT_SETTINGS), adoptionState: "managed" }),
      () => ({ createNode: "Create node", missingNodeFolder: "Missing folder", missingNodeNote: "Missing note", missingNoteShort: "Missing", newFolder: "New folder", newNote: "New note", node: "Node", nodeConflict: "Conflict", root: "Root" }),
      () => undefined, () => undefined, () => undefined,
    );

    adapter.start();
    expect(root.querySelectorAll(".folder-nodes-explorer-root")).toHaveLength(1);
    expect(root.querySelectorAll(".folder-nodes-create-node")).toHaveLength(1);
    expect(root.querySelectorAll(".folder-nodes-native-create-hidden")).toHaveLength(2);
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
      children: () => [], getFolder: () => null, getFile: () => null, getCanonicalFile: () => file, isCanonicalFile: () => true, isIgnoredPath: () => false,
      isLeafNoteExempt: () => false, notePathForFolder: () => "Vault.md", openFolderNode: async () => undefined,
      placeNodeRelative: async () => ({ path: "" }), rootNotePath: () => "Vault.md",
    } as unknown as NodeService;
    const adapter = new ExplorerAdapter(
      app, service,
      { resolve: () => ({ kind: "lucide", value: "folder-tree", accent: null, inheritedFrom: null }) } as unknown as VisualService,
      () => ({ ...structuredClone(DEFAULT_SETTINGS), adoptionState: "managed", showIconInNoteTitle: true }),
      () => ({ createNode: "Create node", missingNodeFolder: "Missing folder", missingNodeNote: "Missing note", missingNoteShort: "Missing", newFolder: "New folder", newNote: "New note", node: "Node", nodeConflict: "Conflict", root: "Root" }),
      () => undefined, () => undefined, () => undefined,
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
