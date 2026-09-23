import { expect, it, vi } from "vitest";
import { TFile, TFolder, type App } from "obsidian";
import { ExplorerAdapter } from "../../src/adapters/explorer-adapter";
import type { NodeService } from "../../src/adapters/node-service";
import type { VisualService } from "../../src/adapters/visual-service";
import { DEFAULT_SETTINGS } from "../../src/shared/settings";

it("updates the create destination after an active-only file switch", async () => {
  const root = document.createElement("div");
  root.className = "workspace-leaf-content";
  root.createDiv({ cls: "nav-header" }).createDiv({ cls: "nav-buttons-container" });
  root.createDiv({ cls: "nav-files-container" });
  document.body.append(root);
  const folders = new Map(["A", "B"].map(path => [path, Object.assign(new TFolder(), { path, name: path, children: [] })]));
  let active = Object.assign(new TFile(), { path: "A/A.md", parent: folders.get("A") });
  const app = {
    vault: { getName: () => "Vault", getRoot: () => ({ path: "" }) },
    workspace: { getActiveFile: () => active, getLeavesOfType: (type: string) => type === "file-explorer" ? [{ view: { containerEl: root } }] : [] },
  } as unknown as App;
  const service = {
    getFolder: (path: string) => folders.get(path) ?? null,
    nodeNoteCandidates: () => [], children: () => [], isIgnoredPath: () => false,
    revealingHiddenNodes: () => false,
  } as unknown as NodeService;
  const createNode = vi.fn();
  const adapter = new ExplorerAdapter(app, service, {} as VisualService, () => structuredClone(DEFAULT_SETTINGS),
    () => ({ createNode: "Create node", incompleteNode: "Incomplete", missingNodeFolder: "Missing folder", missingNodeNote: "Missing note", node: "Node", nodeConflict: "Conflict", root: "Root", unmanaged: "Unmanaged" }),
    createNode, () => undefined, () => undefined, () => undefined);
  try {
    adapter.start();
    await new Promise(resolve => window.setTimeout(resolve, 160));
    const button = root.querySelector<HTMLButtonElement>(".folder-nodes-create-node")!;
    expect(button.dataset.parentPath).toBe("A");
    active = Object.assign(new TFile(), { path: "B/B.md", parent: folders.get("B") });
    adapter.refreshActiveState();
    await new Promise(resolve => window.setTimeout(resolve, 160));
    button.click();
    expect(createNode).toHaveBeenCalledWith("B");
  } finally { adapter.stop(); root.remove(); }
});
