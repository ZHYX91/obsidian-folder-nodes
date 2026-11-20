import "../setup/obsidian-dom";
import { FakeObsidian } from "../helpers/fake-obsidian";
import { NodeService } from "../../src/adapters/node-service";
import { ReferenceIndex } from "../../src/core/reference-index";
import { DEFAULT_SETTINGS } from "../../src/shared/settings";
import { FolderNodeContentsView } from "../../src/ui/contents-view";

let view: FolderNodeContentsView | null = null;
let readOrder: () => string[] = () => [];
let events: { type: string; path?: string; tag: string; trusted: boolean }[] = [];
for (const type of ["dragstart", "dragenter", "dragover", "drop", "dragend"]) {
  document.addEventListener(type, (event) => {
    if (!(event.target instanceof Element)) return;
    const path = event.target.closest<HTMLElement>("[data-node-path]")?.dataset.nodePath;
    events.push({ type, ...(path === undefined ? {} : { path }), tag: event.target.tagName.toLowerCase(), trusted: event.isTrusted });
  }, true);
}

Object.assign(window, { contentsDrag: {
  async prepare(hiddenGap: boolean) {
    if (view !== null) { await view.onClose(); view.containerEl.remove(); }
    const fake = new FakeObsidian();
    const addNote = (path: string, tokens: string[]) => {
      fake.addFile(path, `---\nfolder-nodes:\n${tokens.map((token) => `  - ${token}`).join("\n")}\n---\n`, { "folder-nodes": tokens });
    };
    addNote("Vault.md", ["order=manual"]);
    for (const [index, name] of ["A", "Hidden", "B", "C"].entries()) {
      fake.addFolder(name);
      addNote(`${name}/${name}.md`, [`rank=${(index + 1) * 1024}`, ...(name === "Hidden" ? ["hidden=true"] : [])]);
    }
    const service = new NodeService(fake.app, () => DEFAULT_SETTINGS);
    readOrder = () => service.children("").map((entry) => entry.childPath);
    const noop = () => {};
    view = new FolderNodeContentsView({ app: fake.app } as never, service,
      { resolve: () => ({ kind: "fallback", value: "folder", accent: null, inheritedFrom: null }) }, new ReferenceIndex(), {
        homepageEnabled: () => false, refresh: () => view?.refresh(), reportError: (error) => { throw error; },
        createChild: noop, createMissingNote: noop, nodeMenu: noop, entryMenu: noop, problemMenu: noop,
        editVisual: noop, openHomepage: noop,
      });
    document.body.append(view.containerEl);
    await view.onOpen();
    events = [];
    const grid = view.contentEl.querySelector<HTMLElement>(".folder-nodes-node-grid")!;
    grid.style.cssText = "display:grid;grid-template-columns:280px;gap:10px";
    for (const shell of grid.querySelectorAll<HTMLElement>("[data-node-path]")) shell.style.height = "44px";
    const handle = grid.querySelector("[data-node-path='C'] .folder-nodes-node-drag-handle")!.getBoundingClientRect();
    const a = grid.querySelector("[data-node-path='A']")!.getBoundingClientRect();
    return { from: [handle.left + handle.width / 2, handle.top + handle.height / 2],
      to: [a.left + 95, hiddenGap ? a.bottom - 4 : a.top + 10] };
  },
  state() { return { events, order: readOrder() }; },
} });
