import { readFileSync } from "node:fs";
import { Script } from "node:vm";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

interface Frame { elapsedMs: number; top?: number; missing?: boolean; }
interface Observation {
  path: string; status: string; targetSource: string; frames: Frame[];
  middleViewportEligible: boolean; topRange: number | null; finalDelta: number | null;
}
interface Provider {
  recordExplorerTrace(): void;
  createRevealFixture(disclosure?: boolean): Promise<void>;
  explorerTrace: Observation[];
}

const source = readFileSync(path.resolve("acceptance/fixtures/.obsidian/plugins/folder-nodes-acceptance-provider/main.js"), "utf8");
const disposers: Array<() => void> = [];
afterEach(() => { for (const dispose of disposers.splice(0)) dispose(); document.body.replaceChildren(); vi.restoreAllMocks(); });

function fixture() {
  const root = document.createElement("div");
  root.className = "workspace-leaf-content";
  root.dataset.type = "file-explorer";
  const scroll = root.appendChild(document.createElement("div"));
  scroll.className = "nav-files-container";
  let top = 300;
  const makeRow = () => {
    const row = scroll.appendChild(document.createElement("div"));
    row.className = "nav-folder-title";
    row.dataset.path = "Disclosure/Node 060";
    row.textContent = "Node 060";
    row.getBoundingClientRect = () => ({ top, bottom: top + 24, height: 24, width: 180 } as DOMRect);
    return row;
  };
  const row = makeRow();
  scroll.getBoundingClientRect = () => ({ top: 50, bottom: 650, height: 600 } as DOMRect);
  Object.defineProperties(scroll, { scrollHeight: { value: 5000, configurable: true }, clientHeight: { value: 600 } });
  scroll.scrollTop = 1500;
  document.body.append(root);
  let now = 0;
  let nextFrame: FrameRequestCallback | undefined;
  vi.spyOn(window.performance, "now").mockImplementation(() => now);
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => { nextFrame = callback; return 1; });
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => { nextFrame = undefined; });
  const files = new Map<string, string>();
  const folders = new Set<string>();
  const app = {
    workspace: { getLeavesOfType: () => [{ view: { containerEl: root, tree: {} } }] },
    plugins: { plugins: { "folder-nodes": {} } },
    vault: {
      getAbstractFileByPath: (path: string) => folders.has(path),
      createFolder: async (path: string) => { folders.add(path); },
      create: async (path: string, content: string) => { files.set(path, content); },
    },
  };
  class Plugin {
    app = app;
    register(dispose: () => void) { disposers.push(dispose); }
    registerDomEvent(target: Document, name: string, callback: EventListener, options: AddEventListenerOptions) {
      target.addEventListener(name, callback, options);
      this.register(() => target.removeEventListener(name, callback, options));
    }
  }
  const module = { exports: undefined as unknown };
  new Script(source).runInNewContext({ module, require: () => ({ Plugin, Notice: class {} }), document });
  const provider = new (module.exports as new () => Provider)();
  return { provider, row, root, scroll, files, folders, makeRow,
    setTop: (value: number) => { top = value; },
    frame: (time: number) => { now = time; const callback = nextFrame; nextFrame = undefined; callback?.(time); },
  };
}

describe("disclosure acceptance instrumentation", () => {
  it("tracks the clicked row before host mutation without focusedItem, including recycled rows", () => {
    const f = fixture();
    f.provider.recordExplorerTrace();
    f.row.addEventListener("click", () => { f.setTop(312); f.row.remove(); f.makeRow(); });
    f.row.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    f.frame(100);
    f.setTop(304);
    f.frame(800);
    const trace = f.provider.explorerTrace[0]!;
    expect(trace.frames.map((frame) => frame.top)).toEqual([300, 312, 304]);
    expect(trace).toMatchObject({ status: "complete", targetSource: "clicked-row", middleViewportEligible: true, topRange: 12, finalDelta: 4 });
  });

  it("retains missing-row evidence instead of silently yielding an empty apparent success", () => {
    const f = fixture();
    f.provider.recordExplorerTrace();
    f.row.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    f.row.remove();
    f.frame(100);
    f.frame(800);
    expect(f.provider.explorerTrace[0]).toMatchObject({ status: "incomplete", middleViewportEligible: false });
    expect(f.provider.explorerTrace[0]!.frames[1]!.missing).toBe(true);
  });

  it("rejects boundary-clamped samples as middle-viewport evidence", () => {
    const f = fixture();
    f.provider.recordExplorerTrace();
    f.row.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    f.scroll.scrollTop = 0;
    f.frame(100);
    f.frame(800);
    expect(f.provider.explorerTrace[0]).toMatchObject({ status: "complete", middleViewportEligible: false });
  });

  it("prepares a long list with a wide central subtree and starts tracing in one command", async () => {
    const f = fixture();
    await f.provider.createRevealFixture(true);
    expect(f.folders.size).toBe(623);
    expect([...f.folders].filter((path) => /^Disclosure\/Node \d+$/u.test(path))).toHaveLength(120);
    expect([...f.folders].filter((path) => path.startsWith("Disclosure/Node 060/Wide/"))).toHaveLength(498);
    expect(f.files.get("Disclosure/Node 060/Node 060.md")).toContain("rank=62464");
    expect(f.files.get("Disclosure/Node 060/Wide/Child 498/Child 498.md")).not.toContain("rank=");
    expect(f.provider.explorerTrace).toEqual([]);
    await f.provider.createRevealFixture(true);
    expect(f.folders.size).toBe(623);
  });
});
