import type { App, OpenViewState, PluginManifest, TFile, WorkspaceLeaf } from "obsidian";
import { describe, expect, it, vi } from "vitest";
import { type OpenLinkArgs, interceptLinkNavigation } from "../../src/app/link-navigation";
import { normalizeSettings } from "../../src/shared/settings";
import { FakeObsidian } from "../helpers/fake-obsidian";

vi.mock("obsidian", async (importOriginal) => {
  const original = await importOriginal<typeof import("../mocks/obsidian")>();
  const getLinkpath = (link: string) => link.split("#")[0] ?? "";
  return {
    ...original, getLinkpath,
    parseLinktext: (link: string) => ({ path: getLinkpath(link), subpath: link.slice(getLinkpath(link).length) }),
    Keymap: { isModEvent: (event: MouseEvent) => event.ctrlKey ? "tab" : false },
    Plugin: class { constructor(public app: App, public manifest: PluginManifest) {} },
    PluginSettingTab: class {},
  };
});
vi.mock("../../src/ui/styles.css", () => ({ default: ".folder-nodes {}" }));

import { MarkdownView } from "obsidian";
import FolderNodesPlugin from "../../src/app/plugin";
import { NodeService } from "../../src/adapters/node-service";

type Request = { linkText: string; sourcePath: string; newLeaf?: OpenLinkArgs[2]; viewState?: OpenViewState; claim(action: Promise<void>): void };
type Entry = { reconciliationReady: boolean; syncLinkNavigation(): void; registerUnresolvedLinkDocument(doc: Document): void };

function fixture(periodic?: (request: Request) => void) {
  const fake = new FakeObsidian();
  fake.addFolder("Notes");
  fake.addFile("Notes/Notes.md");
  const source = fake.addFile("Notes/Source.md");
  const view = Object.assign(new MarkdownView({} as WorkspaceLeaf), { file: source, navigation: true });
  const openOriginal = vi.fn(async () => {});
  const leaf = { view, openFile: openOriginal, getViewState: () => ({ pinned: false }) };
  Object.assign(view, { leaf });
  document.body.append(view.containerEl);
  const native = vi.fn(async (..._args: OpenLinkArgs) => {});
  const open = vi.fn(async (_file: TFile, _state?: OpenViewState) => {});
  const getLeaf = vi.fn(() => ({ openFile: open }));
  const trigger = vi.fn((_event: string, request: Request) => periodic?.(request));
  Object.assign(fake.app.workspace, { openLinkText: native, getLeaf, getActiveViewOfType: () => view,
    iterateAllLeaves: (callback: (item: typeof leaf) => void) => callback(leaf), trigger });
  Object.assign(fake.app.vault, { getFileByPath: (path: string) => fake.files.get(path) ?? null });
  Object.assign(fake.app.fileManager, { getNewFileParent: () => source.parent });
  Object.assign(fake.app.metadataCache, { getFirstLinkpathDest: () => null,
    getFileCache: (file: TFile) => file === source
      ? { links: [{ link: "Topic#Here", original: "[[Topic#Here|Alias]]", displayText: "Alias" }] }
      : { frontmatter: fake.frontmatters.get(file.path) },
  });
  const plugin = new FolderNodesPlugin(fake.app, { id: "folder-nodes" } as PluginManifest);
  plugin.service = new NodeService(fake.app, () => plugin.settings);
  vi.spyOn(plugin, "refreshVisuals").mockImplementation(() => undefined);
  const shell = plugin as unknown as Entry;
  shell.reconciliationReady = true;
  shell.registerUnresolvedLinkDocument(document);
  const enable = (enabled = true) => { plugin.settings.createNodesFromLinks = enabled; shell.syncLinkNavigation(); };
  const follow = (...args: OpenLinkArgs) => fake.app.workspace.openLinkText(...args);
  function click(text: string, parentClass = "") {
    const parent = view.containerEl.createDiv({ cls: parentClass });
    const anchor = parent.createEl("a", { cls: "internal-link is-unresolved", text: "Alias", attr: { "data-href": text } });
    const event = new MouseEvent("click", { bubbles: true, cancelable: true, ctrlKey: true });
    anchor.dispatchEvent(event);
    return event.defaultPrevented;
  }
  return { fake, plugin, source, view, native, getLeaf, openOriginal, open, trigger, enable, follow, click };
}

describe("opening missing links", () => {
  it("leaves new and upgraded settings off, passes editing gestures through, then opens the requested node and anchor", async () => {
    const f = fixture();
    expect(normalizeSettings({ schemaVersion: 3 }).createNodesFromLinks).toBe(false);
    expect(f.plugin.settings.createNodesFromLinks).toBe(false);
    await f.follow("Topic", f.source.path);
    expect(f.native).toHaveBeenCalledOnce();
    expect(f.click("Topic")).toBe(false);
    f.enable();
    expect(f.click("Topic", "cm-editor")).toBe(false);
    expect(f.click("Topic", "markdown-embed")).toBe(false);
    expect(f.fake.files.has("Notes/Topic")).toBe(false);
    await f.follow("Topic#Here", f.source.path, "split", { active: false });
    expect(f.getLeaf).toHaveBeenCalledWith("split");
    expect(f.open).toHaveBeenCalledWith(f.fake.files.get("Notes/Topic/Topic.md"), { active: false, eState: { subpath: "#Here" } });
    expect(f.fake.frontmatters.get("Notes/Topic/Topic.md")?.aliases).toContain("Alias");
    f.enable(false);
    expect(f.fake.app.workspace.openLinkText).toBe(f.native);
  });

  it("honors existing notes, exempt paths and invalid links", async () => {
    const f = fixture();
    f.enable();
    const existing = f.fake.addFile("Existing.md");
    await f.follow("Existing", f.source.path, "tab");
    expect(f.open).toHaveBeenCalledWith(existing, undefined);
    expect(f.fake.files.has("Notes/Existing")).toBe(false);
    for (const link of ["../Unsafe", "Private.pdf", "#Here", "_ignored/Topic", ".obsidian/Topic"]) {
      await f.follow(link, f.source.path);
      expect(f.native).toHaveBeenCalledWith(link, f.source.path);
    }
    expect(f.trigger).not.toHaveBeenCalled();
  });

  it("routes a Reading-view click once, and defers failed or cancelled periodic navigation without creating nodes", async () => {
    const f = fixture((request) => {
      if (request.linkText === "Cancel") request.claim(Promise.resolve());
      if (request.linkText === "Fail") request.claim(Promise.reject(new Error("template failed")));
    });
    f.enable();
    expect(f.click("Cancel")).toBe(true);
    expect(f.trigger).toHaveBeenCalledOnce();
    const report = vi.spyOn(f.plugin as unknown as { reportActionError(error: unknown): void }, "reportActionError");
    await f.follow("Fail", f.source.path, "tab");
    expect(report).toHaveBeenCalledExactlyOnceWith(new Error("template failed"));
    expect(f.native).not.toHaveBeenCalled();
    expect(f.fake.files.has("Notes/Cancel")).toBe(false);
    expect(f.fake.files.has("Notes/Fail")).toBe(false);
    expect(f.click("Topic#Here")).toBe(true);
    await vi.waitFor(() => expect(f.open).toHaveBeenCalledOnce());
    expect(f.fake.frontmatters.get("Notes/Topic/Topic.md")?.aliases).toContain("Alias");
  });

  it("opens a new tab when the originating view is repurposed during creation", async () => {
    const f = fixture();
    f.enable();
    const pending = f.follow("Next", f.source.path);
    f.view.file = f.fake.addFile("Other.md");
    await pending;
    expect(f.getLeaf).toHaveBeenCalledWith("tab");
    expect(f.openOriginal).not.toHaveBeenCalled();
  });

  it("reports a failed node write once without running the native creation path", async () => {
    const f = fixture();
    f.enable();
    const error = new Error("Write failed");
    vi.spyOn(f.plugin.service, "createNodePath").mockRejectedValue(error);
    const report = vi.spyOn(f.plugin as unknown as { reportActionError(error: unknown): void }, "reportActionError");
    await f.follow("Refused", f.source.path);
    expect(report).toHaveBeenCalledExactlyOnceWith(error);
    expect(f.native).not.toHaveBeenCalled();
    expect(f.fake.files.has("Notes/Refused.md")).toBe(false);
    expect(f.fake.files.has("Notes/Refused")).toBe(false);
  });

  it.each([true, false])("keeps priority and cleans up with the periodic wrapper installed first=%s", async (first) => {
    const match = "2026-11-20";
    const action = vi.fn(async () => {});
    const f = fixture((request) => { if (request.linkText === match) request.claim(action()); });
    const install = () => interceptLinkNavigation(f.fake.app.workspace, (text) => text === match ? action() : null);
    if (!first) f.enable();
    const remove = install();
    if (first) f.enable();
    await f.follow(match, f.source.path);
    expect(action).toHaveBeenCalledOnce();
    expect(f.fake.files.has("Notes/" + match)).toBe(false);
    f.enable(false);
    remove();
    await f.follow("Native", f.source.path);
    expect(f.native).toHaveBeenCalledOnce();
  });
});
