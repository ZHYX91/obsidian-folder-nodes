import type { App, Command, Editor, PluginManifest, WorkspaceLeaf } from "obsidian";
import { beforeEach, describe, expect, it, vi } from "vitest";

const host = vi.hoisted(() => ({ modals: [] as Array<{ contentEl: HTMLElement; closeCount: number }> }));
vi.mock("obsidian", async (importOriginal) => {
  const original = await importOriginal<typeof import("../mocks/obsidian")>();
  class Button extends original.ButtonComponent { public setCta(): this { return this; } }
  return {
    ...original,
    Plugin: class {
      public commands: Command[] = [];
      public constructor(public app: App, public manifest: PluginManifest) {}
      public addCommand(command: Command): Command { this.commands.push(command); return command; }
      public registerEvent(): void {}
      public async saveData(): Promise<void> {}
    },
    Modal: class extends original.Modal {
      public contentEl = document.createElement("div");
      public setTitle(): void {}
      public onOpen(): void {}
      public open(): void { host.modals.push(this); this.onOpen(); }
    },
    PluginSettingTab: class { public containerEl = document.createElement("div"); },
    Setting: class extends original.Setting {
      public override addButton(configure: (button: Button) => unknown): this { configure(new Button(this.controlEl)); return this; }
      public setHeading(): this { return this; }
      public addToggle(configure: (toggle: { setValue(value: boolean): unknown; onChange(callback: (value: boolean) => Promise<void>): unknown }) => unknown): this {
        const input = this.controlEl.createEl("input", { attr: { type: "checkbox" } });
        const toggle = {
          setValue(value: boolean) { input.checked = value; return toggle; },
          onChange(callback: (value: boolean) => Promise<void>) { input.addEventListener("change", () => { void callback(input.checked); }); return toggle; },
        };
        configure(toggle);
        return this;
      }
    },
  };
});
vi.mock("../../src/ui/styles.css", () => ({ default: ".folder-nodes {}" }));

import { MarkdownView, Menu, Notice, parseYaml, type TFile } from "obsidian";
import FolderNodesPlugin from "../../src/app/plugin";
import { FolderNodesSettingTab } from "../../src/app/settings-tab";
import { NodeService } from "../../src/adapters/node-service";
import { createSettingsSnapshot } from "../../src/shared/settings";
import { setLanguage, t } from "../../src/ui/i18n";
import { FakeObsidian } from "../helpers/fake-obsidian";

type Shell = { commands: Command[]; registerCommands(): void; registerEvents(): void };
type Entry = "command" | "editor-menu";
const notices = (Notice as unknown as typeof import("../mocks/obsidian").Notice).messages;

function fixture({ confirm = true, table = false, label = "Selected text" } = {}) {
  const fake = new FakeObsidian();
  fake.addFolder("Parent");
  fake.addFile("Parent/Parent.md");
  const file = fake.addFile("Parent/Source.md");
  const lines = table ? [`| before | ${label} | after |`, "| --- | --- | --- |"] : label.split("\n");
  let selection = label;
  let from = { line: 0, ch: table ? 11 : 0 };
  let to = { line: table ? 0 : lines.length - 1, ch: table ? 11 + label.length : (lines.at(-1)?.length ?? 0) };
  const editor = {
    getSelection: () => selection,
    getCursor: (end: string) => end === "from" ? from : to,
    getLine: (line: number) => lines[line] ?? "",
    replaceSelection: vi.fn((link: string) => { selection = link; }),
  };
  const view = Object.assign(new MarkdownView({} as WorkspaceLeaf), { file, editor });
  let leaves = [{ view }] as unknown as WorkspaceLeaf[];
  const events = new Map<string, (...args: unknown[]) => void>();
  Object.assign(fake.app.workspace, {
    getLeavesOfType: () => leaves,
    getActiveFile: () => file,
    on: (event: string, callback: (...args: unknown[]) => void) => { events.set(event, callback); return {}; },
  });
  vi.spyOn(fake.app.vault, "on").mockImplementation(() => ({} as ReturnType<App["vault"]["on"]>));
  Object.assign(fake.app.metadataCache, { on: () => ({}) });
  const generate = vi.fn((note: TFile, _sourcePath: string, _subpath: string | undefined, _label: string) => {
    expect(fake.files.get(note.path)).toBe(note);
    return "[[Selected text|Selected text]]";
  });
  Object.assign(fake.app.fileManager, { generateMarkdownLink: generate });
  const plugin = new FolderNodesPlugin(fake.app, { id: "folder-nodes", name: "Folder Nodes" } as PluginManifest);
  plugin.settings.confirmSelectionCreation = confirm;
  plugin.service = new NodeService(fake.app, () => plugin.settings);
  vi.spyOn(plugin, "refreshVisuals").mockImplementation(() => undefined);
  const shell = plugin as unknown as Shell;
  shell.registerCommands();
  shell.registerEvents();
  function trigger(entry: Entry = "command") {
    if (entry === "command") {
      const callback = shell.commands.find(({ id }) => id === "create-from-selection")!.editorCheckCallback!;
      expect(callback(true, editor as unknown as Editor, view)).toBe(true);
      expect(host.modals).toHaveLength(0);
      callback(false, editor as unknown as Editor, view);
    } else {
      const menu = new Menu();
      events.get("editor-menu")!(menu, editor, view);
      (menu as unknown as { items: Array<{ click: () => void }> }).items[0]!.click();
    }
  }
  function submit() {
    host.modals.at(-1)!.contentEl.querySelectorAll<HTMLButtonElement>("button")[1]!.click();
  }
  return { fake, plugin, file, editor, view, lines, generate, trigger, submit,
    selection: () => selection,
    changeSelection: (value: string) => { selection = value; },
    moveRange: () => { from = { line: 0, ch: from.ch + 1 }; to = { line: 0, ch: to.ch + 1 }; },
    closeEditor: () => { leaves = []; },
  };
}

describe("selection creation through the plugin", () => {
  beforeEach(() => { host.modals.length = 0; notices.length = 0; setLanguage("en"); });

  for (const entry of ["command", "editor-menu"] as const) {
    it.each([true, false])(`${entry} shares creation with confirmation %s`, async (confirm) => {
      const f = fixture({ confirm });
      f.trigger(entry);
      if (confirm) {
        expect(f.fake.files.has("Parent/Selected text")).toBe(false);
        expect(host.modals).toHaveLength(1);
        f.submit();
      } else expect(host.modals).toHaveLength(0);
      await vi.waitFor(() => expect(f.fake.opened).toEqual(["Parent/Selected text/Selected text.md"]));
      const note = f.fake.requireFile("Parent/Selected text/Selected text.md");
      expect(f.generate).toHaveBeenCalledExactlyOnceWith(note, "Parent/Source.md", undefined, "Selected text");
      expect(f.fake.contents.get(note.path)).toContain("Selected text");
    expect(parseYaml(f.fake.contents.get(note.path)!.split("---")[1]!)).toMatchObject({ aliases: ["Selected text"] });
      expect(f.editor.replaceSelection).toHaveBeenCalledExactlyOnceWith("[[Selected text|Selected text]]");
    });
  }

  // The boundary returns prescribed host strings: this fake does not choose paths or syntax.
  const formats = [
    ["shortest wiki", "[[Selected text|Selected text]]"],
    ["relative wiki", "[[Selected text/Selected text|Selected text]]"],
    ["vault wiki", "[[Parent/Selected text/Selected text|Selected text]]"],
    ["shortest Markdown", "[Selected text](Selected%20text.md)"],
    ["relative Markdown", "[Selected text](Selected%20text/Selected%20text.md)"],
    ["vault Markdown", "[Selected text](Parent/Selected%20text/Selected%20text.md)"],
  ] as const;
  it.each(formats)("passes the host's %s target through in prose and tables", async (_format, generated) => {
    for (const table of [false, true]) {
      const f = fixture({ confirm: false, table });
      f.generate.mockReturnValue(generated);
      f.trigger();
      await vi.waitFor(() => expect(f.fake.opened).toHaveLength(1));
      expect(f.selection()).toBe(table ? generated.replaceAll("|", "\\|") : generated);
      expect(f.generate).toHaveBeenCalledExactlyOnceWith(f.fake.requireFile("Parent/Selected text/Selected text.md"), "Parent/Source.md", undefined, "Selected text");
    }
  });

  it("leaves duplicate-basename disambiguation to the host and keeps aliases off independent of the label", async () => {
    const f = fixture({ confirm: false, label: "  Selected\n text  " });
    f.fake.addFolder("Elsewhere");
    f.fake.addFile("Elsewhere/Selected text.md");
    f.plugin.settings.addSelectionAlias = false;
    f.generate.mockReturnValue("[[Parent/Selected text/Selected text|Selected text]]");
    f.trigger();
    await vi.waitFor(() => expect(f.fake.opened).toHaveLength(1));
    const note = f.fake.requireFile("Parent/Selected text/Selected text.md");
    expect(f.generate).toHaveBeenCalledExactlyOnceWith(note, f.file.path, undefined, "Selected text");
    expect(f.fake.frontmatters.get(note.path)).not.toHaveProperty("aliases");
    expect(f.fake.contents.get(note.path)).toContain("  Selected\n text  ");
    expect(f.selection()).toBe("[[Parent/Selected text/Selected text|Selected text]]");
  });

  it.each(["selection", "range", "source", "table", "editor"] as const)("rejects %s drift after preview before creating", async (drift) => {
    const f = fixture({ table: true });
    f.trigger();
    if (drift === "selection") f.changeSelection("changed");
    else if (drift === "range") f.moveRange();
    else if (drift === "source") f.fake.remove(f.file.path);
    else if (drift === "table") f.lines[1] = "no longer a delimiter";
    else f.closeEditor();
    f.submit();
    await vi.waitFor(() => expect(notices).toHaveLength(1));
    expect(f.fake.files.has("Parent/Selected text")).toBe(false);
    expect(f.generate).not.toHaveBeenCalled();
    expect(f.editor.replaceSelection).not.toHaveBeenCalled();
  });

  it.each([true, false])("rolls back real node creation when host generation fails, confirmation %s", async (confirm) => {
    const f = fixture({ confirm });
    f.generate.mockImplementation(() => { throw new Error("host generation failed"); });
    f.trigger();
    if (confirm) f.submit();
    await vi.waitFor(() => expect(notices.some((message) => message.includes("host generation failed"))).toBe(true));
    expect(f.fake.files.has("Parent/Selected text")).toBe(false);
    expect(f.selection()).toBe("Selected text");
    expect(f.fake.opened).toEqual([]);
  });

  it.each(["selection", "range", "source", "table", "editor", "replacement"] as const)("rolls back when %s changes during creation", async (drift) => {
    const f = fixture({ confirm: false, table: true });
    f.generate.mockImplementation(() => {
      if (drift === "selection") f.changeSelection("changed");
      else if (drift === "range") f.moveRange();
      else if (drift === "source") f.fake.remove(f.file.path);
      else if (drift === "table") f.lines[1] = "no longer a delimiter";
      else if (drift === "editor") f.closeEditor();
      else f.editor.replaceSelection.mockImplementation(() => { throw new Error("replacement failed"); });
      return "[[Selected text|Selected text]]";
    });
    f.trigger();
    await vi.waitFor(() => expect(notices).toHaveLength(1));
    expect(f.fake.files.has("Parent/Selected text")).toBe(false);
    expect(f.fake.opened).toEqual([]);
  });

  it("reports rollback failure and preserves a node whose content changed", async () => {
    const f = fixture({ confirm: false });
    f.generate.mockImplementation((note) => {
      f.fake.contents.set(note.path, "user-owned edit");
      throw new Error("host generation failed");
    });
    f.trigger();
    await vi.waitFor(() => expect(notices).toHaveLength(1));
    expect(notices[0]).toContain("could not be rolled back");
    expect(f.fake.contents.get("Parent/Selected text/Selected text.md")).toBe("user-owned edit");
    expect(f.editor.replaceSelection).not.toHaveBeenCalled();
  });

  it.each([true, false])("rolls back an unsafe WikiLink display label with confirmation %s", async (confirm) => {
    const f = fixture({ confirm, label: "one [two]" });
    f.generate.mockReturnValue("[[one [two]|one [two]]]");
    f.trigger();
    if (confirm) f.submit();
    await vi.waitFor(() => expect(notices).toEqual([t("errorSelectionWikiLinkLabelUnsafe")]));
    expect(f.fake.opened).toEqual([]);
    expect(f.editor.replaceSelection).not.toHaveBeenCalled();
    expect([...f.fake.files.keys()]).toEqual(["", "Parent", "Parent/Parent.md", "Parent/Source.md"]);
  });

  it("uses the normalized original text as a Markdown label while preserving raw body and aliases", async () => {
    const label = "  [one] \\\n *two* | three  ";
    const f = fixture({ confirm: false, label });
    f.generate.mockReturnValue("[[one] \\ *two* | three](Parent/space%20and(unclosed.md)");
    f.trigger("editor-menu");
    await vi.waitFor(() => expect(f.fake.opened).toHaveLength(1));
    expect(f.generate.mock.calls[0]?.[3]).toBe("[one] \\ *two* | three");
    expect(f.selection()).toBe("[\\[one\\] \\\\ \\*two\\* \\| three](Parent/space%20and%28unclosed.md)");
    const source = f.fake.contents.get(f.fake.opened[0]!)!;
    expect(source).toContain(label);
    expect(parseYaml(source.split("---")[1]!)).toMatchObject({ aliases: [label.trim()] });
  });

  it("keeps conflict and cross-cell validation when confirmation is disabled and serializes repeated submissions", async () => {
    const conflict = fixture({ confirm: false });
    conflict.fake.addFolder("Parent/Selected text");
    conflict.trigger();
    await vi.waitFor(() => expect(notices).toHaveLength(1));
    expect(conflict.generate).not.toHaveBeenCalled();
    notices.length = 0;
    const cross = fixture({ confirm: false, table: true, label: "one | two" });
    cross.trigger();
    expect(notices).toEqual([t("selectionCrossesTableCells")]);
    expect(cross.fake.files.has("Parent/one _ two")).toBe(false);
    notices.length = 0;
    const repeated = fixture({ confirm: false });
    repeated.trigger();
    repeated.trigger();
    await vi.waitFor(() => expect(repeated.fake.opened).toHaveLength(1));
    await vi.waitFor(() => expect(notices).toHaveLength(1));
    expect(repeated.generate).toHaveBeenCalledOnce();
    expect(repeated.editor.replaceSelection).toHaveBeenCalledOnce();
  });

  it("persists the imperative confirmation toggle without enabling declarative settings", async () => {
    const f = fixture();
    const saved: unknown[] = [];
    vi.spyOn(f.plugin, "saveSettings").mockImplementation(async () => { saved.push(createSettingsSnapshot(f.plugin.settings)); });
    const tab = new FolderNodesSettingTab(f.fake.app, f.plugin);
    const naming = tab as unknown as { renderNaming(panel: HTMLElement): void; renderNamingPart(): void };
    naming.renderNamingPart = () => undefined;
    const panel = document.createElement("div");
    naming.renderNaming(panel);
    const row = [...panel.querySelectorAll<HTMLElement>(".setting-item")].find((item) => item.querySelector(".setting-item-name")?.textContent === t("confirmSelectionCreation"))!;
    const toggle = row.querySelector<HTMLInputElement>("input")!;
    expect(toggle.checked).toBe(true);
    toggle.checked = false;
    toggle.dispatchEvent(new Event("change"));
    await vi.waitFor(() => expect(saved).toHaveLength(1));
    expect(saved[0]).toMatchObject({ confirmSelectionCreation: false, addSelectionAlias: true, schemaVersion: 3 });
    expect(tab.getSettingDefinitions()).toEqual([]);
  });
});
