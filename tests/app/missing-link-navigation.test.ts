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

  it.each(["folder", "leaf"])("respects the spelling a new unresolved Node will use for a %s exemption", async (type) => {
    const f = fixture();
    f.enable();
    if (type === "folder") f.plugin.settings.ignoredFolders = ["Notes/Café"];
    else f.plugin.settings.leafNoteExemptions = ["Notes/Café.md"];
    const raw = "Cafe\u0301";
    await f.follow(raw, f.source.path);
    expect(f.native).toHaveBeenCalledWith(raw, f.source.path);
    expect(f.fake.files.has("Notes/Café")).toBe(false);
    expect(f.trigger).not.toHaveBeenCalled();
  });

  it.each(["Café", "Cafe\u0301"])("opens an existing leaf with spelling %s while metadata is catching up", async (name) => {
    const f = fixture();
    f.enable();
    const existing = f.fake.addFile(`Notes/${name}.md`);
    await f.follow("Cafe\u0301", f.source.path, "tab");
    expect(f.open).toHaveBeenCalledWith(existing, undefined);
    expect(f.fake.files.has("Notes/Café")).toBe(false);
    expect(f.trigger).not.toHaveBeenCalled();
  });

  it("keeps the exact existing ancestor when only the new leaf needs normalization", async () => {
    const f = fixture();
    f.enable();
    for (const name of ["Café", "Cafe\u0301"]) {
      f.fake.addFolder(name);
      f.fake.addFile(`${name}/${name}.md`);
    }
    const spelling = "Cafe\u0301/Ele\u0300ve";
    f.plugin.settings.ignoredFolders = ["Café"];
    await f.follow(spelling, f.source.path, "tab");
    const note = f.fake.requireFile("Cafe\u0301/Elève/Elève.md");
    expect(f.open).toHaveBeenCalledWith(note, undefined);
    expect(f.fake.files.has("Café/Elève")).toBe(false);
    expect(f.native).not.toHaveBeenCalled();
  });

  it("refuses to open a leaf across a normalized ancestor collision", async () => {
    const f = fixture();
    f.enable();
    f.fake.addFolder("Café");
    f.fake.addFile("Café/Café.md");
    f.fake.addFile("Café/Topic.md");
    const report = vi.spyOn(f.plugin as unknown as { reportActionError(error: unknown): void }, "reportActionError");
    await f.follow("Cafe\u0301/Topic", f.source.path, "tab");
    expect(report).toHaveBeenCalledOnce();
    expect(f.open).not.toHaveBeenCalled();
    expect(f.native).not.toHaveBeenCalled();
    expect(f.fake.files.has("Café/Topic")).toBe(false);
  });

  it("hands a differently spelled file returned by Vault lookup back to native navigation", async () => {
    const f = fixture();
    f.enable();
    const other = f.fake.addFile("Notes/CASE.md");
    const lookup = f.fake.app.vault.getFileByPath.bind(f.fake.app.vault);
    vi.spyOn(f.fake.app.vault, "getFileByPath").mockImplementation((path) => path === "Notes/Case.md" ? other : lookup(path));
    await f.follow("Case", f.source.path, "tab");
    expect(f.native).toHaveBeenCalledWith("Case", f.source.path, "tab");
    expect(f.open).not.toHaveBeenCalled();
    expect(f.fake.files.has("Notes/Case")).toBe(false);
  });

  it.each(["", "/"])("creates and opens a node at the Vault root represented as %j", async (rootPath) => {
    const f = fixture();
    const { vault, fileManager } = f.fake.app;
    f.fake.root.path = rootPath;
    vi.spyOn(fileManager, "getNewFileParent").mockReturnValue(f.fake.root);
    const lookup = vault.getAbstractFileByPath.bind(vault);
    vi.spyOn(vault, "getAbstractFileByPath").mockImplementation((path) =>
      path === "" || path === "/" ? null : lookup(path));
    f.enable();
    await f.follow("Ordinary target", f.source.path, "tab");
    const note = f.fake.files.get("Ordinary target/Ordinary target.md");
    expect(note).toBeDefined();
    expect(f.open).toHaveBeenCalledWith(note, undefined);
    expect(f.native).not.toHaveBeenCalled();
    expect(f.fake.trashed).toEqual([]);
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

  it("refuses a replaced root even when the old root remains in the generic path lookup", async () => {
    const f = fixture();
    const { vault, fileManager } = f.fake.app;
    const root = f.fake.root;
    const replacement = new FakeObsidian().root;
    replacement.children = root.children;
    const rootNote = f.fake.addFile("Vault.md");
    vi.spyOn(fileManager, "getNewFileParent").mockReturnValue(root);
    const read = vault.read.bind(vault);
    vi.spyOn(vault, "read").mockImplementation(async (file) => {
      if (file === rootNote) vi.spyOn(vault, "getRoot").mockReturnValue(replacement);
      return read(file);
    });
    const report = vi.spyOn(f.plugin as unknown as { reportActionError(error: unknown): void }, "reportActionError");
    f.enable();
    await f.follow("Refused", f.source.path);
    expect(report).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining("identity changed") }));
    expect(f.fake.files.has("Refused")).toBe(false);
    expect(f.fake.files.get("Vault.md")).toBe(rootNote);
    expect(f.native).not.toHaveBeenCalled();
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
