import { type App, type PluginManifest, TFile, type TFolder } from "obsidian";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("obsidian", async (importOriginal) => ({
  ...await importOriginal<Record<string, unknown>>(),
  Plugin: class {
    public constructor(public app: App, public manifest: PluginManifest) {}
  },
}));
vi.mock("../../src/app/settings-tab", () => ({ FolderNodesSettingTab: class {} }));
vi.mock("../../src/ui/styles.css", () => ({ default: ".folder-nodes {}" }));

import FolderNodesPlugin from "../../src/app/plugin";
import { NodeService } from "../../src/adapters/node-service";
import { VisualService } from "../../src/adapters/visual-service";
import { DEFAULT_SETTINGS } from "../../src/shared/settings";
import { setLanguage, t } from "../../src/ui/i18n";
import { FakeObsidian } from "../helpers/fake-obsidian";
import { Menu } from "../mocks/obsidian";

beforeEach(() => {
  setLanguage("en");
  vi.stubGlobal("CSS", { supports: () => false });
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); document.body.replaceChildren(); });

function fixture() {
  const fake = new FakeObsidian();
  fake.app.workspace.trigger = vi.fn();
  const folder = fake.addFolder("A");
  const note = fake.addFile("A/A.md", "---\nicon: star\n---\nBody");
  const nodes = new NodeService(fake.app, () => structuredClone(DEFAULT_SETTINGS));
  const visuals = new VisualService(fake.app, nodes, () => false);
  const plugin = new FolderNodesPlugin(fake.app, { id: "folder-nodes" } as PluginManifest);
  Reflect.set(plugin, "service", nodes);
  Reflect.set(plugin, "visuals", visuals);
  Reflect.set(plugin, "refreshVisuals", vi.fn());
  const buttons = (label: string) => [...document.querySelectorAll<HTMLButtonElement>("button")]
    .filter((button) => button.textContent === label);
  return { fake, folder, note, nodes, plugin, buttons };
}

describe("plugin visual picker ownership", () => {
  it("rechecks the cover source identity inside the delayed frontmatter callback", async () => {
    const f = fixture();
    const image = f.fake.addFile("A/cover.png");
    f.fake.app.metadataCache.fileToLinktext = () => "A/cover.png";
    const pluginMenu = f.plugin as unknown as { openEntryMenu(anchor: HTMLElement, entry: TFile, folder: TFolder): void };
    pluginMenu.openEntryMenu(document.createElement("button"), image, f.folder);
    const action = Menu.lastCreated!.items.find((item) => item.title === t("setAsVisual"))!;
    const original = f.fake.app.fileManager.processFrontMatter.bind(f.fake.app.fileManager);
    let resume!: () => void;
    const paused = new Promise<void>((resolve) => { resume = resolve; });
    const write = vi.spyOn(f.fake.app.fileManager, "processFrontMatter").mockImplementation(async (file, callback) => {
      await paused;
      await original(file, callback);
    });
    const writing: Promise<unknown>[] = [];
    Reflect.set(f.plugin, "runAction", (operation: Promise<unknown>) => writing.push(operation));
    action.click!();
    await vi.waitFor(() => expect(write).toHaveBeenCalledOnce());
    f.fake.files.set(image.path, Object.assign(new TFile(), image));
    const before = new Map(f.fake.contents);
    resume();
    await Promise.all(writing);
    expect(f.fake.contents).toEqual(before);
    f.plugin.onunload();
  });

  it.each(["unload", "note", "icon", "image"])("rejects a stale cover menu after %s changes", async (change) => {
    const f = fixture();
    const image = f.fake.addFile("A/cover.png");
    f.fake.app.metadataCache.fileToLinktext = () => "A/cover.png";
    const pluginMenu = f.plugin as unknown as { openEntryMenu(anchor: HTMLElement, entry: TFile, folder: TFolder): void };
    pluginMenu.openEntryMenu(document.createElement("button"), image, f.folder);
    const action = Menu.lastCreated!.items.find((item) => item.title === t("setAsVisual"))!;
    expect(action).toBeDefined();
    if (change === "unload") f.plugin.onunload();
    if (change === "note") f.fake.files.set(f.note.path, Object.assign(new TFile(), f.note));
    if (change === "image") f.fake.files.set(image.path, Object.assign(new TFile(), image));
    if (change === "icon") await f.fake.app.vault.modify(f.note, "---\nicon: brain\n---\nOther window");
    const before = new Map(f.fake.contents);
    const writing: Promise<unknown>[] = [];
    Reflect.set(f.plugin, "runAction", (operation: Promise<unknown>) => writing.push(operation));
    action.click!();
    await Promise.all(writing);
    expect(f.fake.contents).toEqual(before);
    f.plugin.onunload();
  });

  it("closes the production picker and disables its old confirmation on unload", async () => {
    const f = fixture();
    f.plugin.promptVisual(f.folder);
    const confirm = f.buttons(t("confirm"))[0]!;
    const remove = f.buttons(t("delete"))[0]!;
    const before = f.fake.contents.get(f.note.path);
    const write = vi.spyOn(f.fake.app.fileManager, "processFrontMatter");
    f.plugin.onunload();
    expect(confirm.isConnected).toBe(false);
    confirm.click();
    remove.click();
    await Promise.resolve();
    expect(write).not.toHaveBeenCalled();
    expect(f.fake.contents.get(f.note.path)).toBe(before);
  });

  it("rejects another window's icon change through the real picker callback", async () => {
    const f = fixture();
    f.plugin.promptVisual(f.folder);
    const confirm = f.buttons(t("confirm"))[0]!;
    await f.fake.app.vault.modify(f.note, "---\nicon: brain\n---\nOther window");
    const write = vi.spyOn(f.fake.app.fileManager, "processFrontMatter");
    confirm.click();
    await vi.waitFor(() => expect(write).toHaveBeenCalledOnce());
    expect(f.fake.frontmatters.get(f.note.path)?.icon).toBe("brain");
    expect(f.fake.contents.get(f.note.path)).toContain("Other window");
    f.plugin.onunload();
  });
});
