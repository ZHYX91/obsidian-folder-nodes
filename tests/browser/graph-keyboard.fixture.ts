import "../setup/obsidian-dom";
import { Scope } from "../mocks/obsidian";
import { DEFAULT_NODE_GRAPH_SETTINGS } from "../../src/shared/settings";
import { FolderNodeGraphView } from "../../src/ui/node-graph-view";
import type { NodeGraphIndexRecord } from "../../src/core/node-graph-index-snapshot";

// Only Obsidian's host objects are simulated. The production views, native
// buttons and browser input/default-click pipeline remain real.
let view: FolderNodeGraphView | null = null;
let opens: Array<{ path: string; newLeaf: boolean }> = [];
let clicks: Array<{ trusted: boolean; detail: number; shift: boolean; ctrl: boolean; meta: boolean; alt: boolean }> = [];
let keys: Array<{ trusted: boolean; key: string; handled: boolean }> = [];
let parentCalls = 0;
let target: HTMLElement | null = null;
window.addEventListener("keydown", (event) => {
  const handled = (view?.scope as Scope | null)?.handleKey(event) === false;
  keys.push({ trusted: event.isTrusted, key: event.key, handled });
  if (handled) { event.preventDefault(); event.stopPropagation(); }
}, true);
document.addEventListener("click", (event) => {
  if ((event.target as Element).closest(".folder-nodes-node-graph-node-expand-handle, .folder-nodes-node-graph-focus-overlay-toggle, .folder-nodes-node-graph-node-body")) {
    clicks.push({ trusted: event.isTrusted, detail: event.detail, shift: event.shiftKey,
      ctrl: event.ctrlKey, meta: event.metaKey, alt: event.altKey });
  }
}, true);

const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
Object.assign(window, { graphKeyboard: {
  async prepare(kind: string, parent: "handled" | "declined" | "unbound") {
    if (view !== null) { await view.onClose(); view.containerEl.remove(); }
    const records = new Map<string, NodeGraphIndexRecord>([
      ["", null], ["Work", ""], ["Work/A", "Work"], ["Work/A/Deep", "Work/A"],
    ].map(([path, parentPath]) => [path!, { path: path!, label: path || "Vault", parentPath: parentPath ?? null,
      notePath: path ? `${path}/${path.split("/").at(-1)}.md` : null,
      visual: { kind: "fallback", value: "folder", accent: null, inheritedFrom: null } }]));
    const scope = new Scope();
    if (parent !== "unbound") scope.register(null, null, () => { parentCalls++; return parent === "handled" ? false : undefined; });
    const app = { scope, vault: { getName: () => "Vault" }, workspace: { requestSaveLayout: () => {} } };
    const settings = { ...structuredClone(DEFAULT_NODE_GRAPH_SETTINGS), largeGraphThreshold: kind.startsWith("dom") ? 500 : 1 };
    view = new FolderNodeGraphView({ app } as never, { openFolderNode: async (path, newLeaf) => { opens.push({ path, newLeaf: newLeaf === true }); } },
      { getIndexSnapshot: () => ({ records, links: new Map(), revision: 1 }), getSettings: () => settings, onNodeMenu: () => {} });
    view.containerEl.style.cssText = "width:680px;height:590px";
    view.contentEl.style.height = "590px";
    document.body.append(view.containerEl);
    await view.onOpen(); view.setFocus("Work");
    await frame(); await frame();
    const selector = kind === "dom" ? "[data-node-path='Work'] .folder-nodes-node-graph-node-body"
      : kind === "dom-handle" ? "[data-node-path='Work'] .folder-nodes-node-graph-node-expand-handle"
      : kind === "canvas" ? "canvas" : kind === "overlay" ? ".folder-nodes-node-graph-focus-overlay-body"
      : ".folder-nodes-node-graph-focus-overlay-toggle";
    target = view.contentEl.querySelector<HTMLElement>(selector);
    if (target === null) throw new Error(`Missing ${kind} key target`);
    target.focus(); opens = []; clicks = []; keys = []; parentCalls = 0;
    return this.state();
  },
  state() {
    const handle = view?.contentEl.querySelector<HTMLElement>("[data-node-path='Work'] .folder-nodes-node-graph-node-expand-handle, .folder-nodes-node-graph-focus-overlay-toggle");
    return { opens, clicks, keys, parentCalls, expanded: handle?.getAttribute("aria-expanded"),
      focused: target === document.activeElement };
  },
  async close() { if (view !== null) { await view.onClose(); view.containerEl.remove(); view = null; } },
} });
