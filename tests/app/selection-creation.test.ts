import type { App, Command, Editor, EditorPosition, EditorTransaction, PluginManifest, WorkspaceLeaf } from "obsidian";
import { beforeEach, describe, expect, it, vi } from "vitest";

const host = vi.hoisted(() => ({ modals: [] as Array<{ contentEl: HTMLElement; closeCount: number }> }));
vi.mock("obsidian", async (importOriginal) => {
  const original = await importOriginal<typeof import("../mocks/obsidian")>();
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
      public override open(): void { host.modals.push(this); super.open(); }
    },
    PluginSettingTab: class { public containerEl = document.createElement("div"); },
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
  const getValue = () => lines.join("\n");
  const editor = {
    getValue,
    getSelection: () => selection,
    getCursor: (end: string) => end === "from" ? from : to,
    getLine: (line: number) => lines[line] ?? "",
    posToOffset: ({ line, ch }: EditorPosition) => lines.slice(0, line).reduce((offset, text) => offset + text.length + 1, ch),
    replaceSelection: vi.fn((link: string) => {
      const text = getValue();
      const next = text.slice(0, editor.posToOffset(from)) + link + text.slice(editor.posToOffset(to));
      lines.splice(0, lines.length, ...next.split("\n"));
      selection = link;
    }),
    transaction: vi.fn(({ changes }: EditorTransaction) => {
      const change = changes?.[0];
      if (change === undefined || change.to === undefined) throw new Error("Expected a bounded edit");
      const source = editor.getValue();
      const result = source.slice(0, editor.posToOffset(change.from)) + change.text + source.slice(editor.posToOffset(change.to));
      lines.splice(0, lines.length, ...result.split("\n"));
      selection = change.text;
    }),
  };
  const save = vi.fn(async () => undefined);
  const view = Object.assign(new MarkdownView({} as WorkspaceLeaf), { file, editor, getViewData: getValue, save });
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
    selectRange: (start: EditorPosition, end: EditorPosition) => { from = start; to = end; },
    moveRange: () => { from = { line: 0, ch: from.ch + 1 }; to = { line: 0, ch: to.ch + 1 }; },
    closeEditor: () => { leaves = []; },
  };
}

function nativeTableFixture() {
  const f = fixture({ confirm: false, table: true, label: "Saffron" });
  f.lines.splice(0, f.lines.length, "Before.", "", "| Name    | Value   |     |     |",
    "| ------- | ------- | --- | --- |", "| Saffron | Beta \\| |     |     |", "", "After.");
  f.selectRange({ line: 4, ch: 2 }, { line: 4, ch: 9 });
  f.generate.mockReturnValue("[[Saffron]]");
  const normalized = ["Before.", "", "| Name        | Value   |     |     |",
    "| ----------- | ------- | --- | --- |", "| [[Saffron]] | Beta \\| |     |     |", "", "After."];
  return { f, normalized };
}

describe("selection creation through the plugin", () => {
  beforeEach(() => { host.modals.length = 0; notices.length = 0; document.body.replaceChildren(); setLanguage("en"); });

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

  it("uses the edited final name for creation while preserving the entire selected body and alias", async () => {
    const original = "汉".repeat(100);
    const f = fixture({ label: original });
    f.trigger();
    const input = host.modals.at(-1)!.contentEl.querySelector<HTMLInputElement>("input")!;
    expect(input.value).toBe("汉".repeat(84));
    input.value = "Shorter name";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    f.submit();
    await vi.waitFor(() => expect(f.fake.opened).toEqual(["Parent/Shorter name/Shorter name.md"]));
    const note = f.fake.requireFile("Parent/Shorter name/Shorter name.md");
    expect(f.fake.contents.get(note.path)).toContain(original);
    expect(f.fake.frontmatters.get(note.path)?.aliases).toEqual([original]);
    expect(f.generate).toHaveBeenCalledExactlyOnceWith(note, f.file.path, undefined, original);
  });

  it.each(["throw after applying", "silently decline", "detach after applying"])("keeps the new note if plain text writeback can %s", async (outcome) => {
    const f = fixture({ confirm: false });
    f.editor.replaceSelection.mockImplementationOnce(link => {
      if (outcome === "silently decline") return;
      f.lines.splice(0, f.lines.length, link);
      if (outcome === "detach after applying") f.closeEditor();
      else throw new Error("host reported failure after applying the edit");
    });
    f.trigger();
    await vi.waitFor(() => expect(notices.at(-1)).toContain("Parent/Selected text/Selected text.md"));
    expect(f.fake.files.has("Parent/Selected text/Selected text.md")).toBe(true);
    expect(f.editor.getValue()).toBe(outcome === "silently decline" ? "Selected text" : "[[Selected text|Selected text]]");
    expect(f.fake.opened).toEqual([]);
  });

  it("saves one bounded table-cell replacement before opening the new note", async () => {
    const f = fixture({ table: true, label: "Alpha" });
    f.generate.mockReturnValue("[[Alpha|Alpha]]");
    f.view.save.mockImplementationOnce(async () => {
      expect(f.editor.getValue()).toBe("| before | [[Alpha\\|Alpha]] | after |\n| --- | --- | --- |");
      expect(f.fake.opened).toEqual([]);
      return undefined;
    });
    f.trigger();
    f.submit();
    await vi.waitFor(() => expect(f.fake.opened).toEqual(["Parent/Alpha/Alpha.md"]));
    expect(f.editor.transaction).toHaveBeenCalledWith({
      changes: [{ from: { line: 0, ch: 11 }, to: { line: 0, ch: 16 }, text: "[[Alpha\\|Alpha]]" }],
    }, "folder-nodes-selection-link");
    expect(f.editor.replaceSelection).not.toHaveBeenCalled();
    expect(f.view.save).toHaveBeenCalledOnce();
  });

  it("accepts native column width normalization around the exact inserted link", async () => {
    const { f, normalized } = nativeTableFixture();
    f.editor.transaction.mockImplementationOnce(() => { f.lines.splice(0, f.lines.length, ...normalized); });
    f.view.save.mockImplementationOnce(async () => {
      expect(f.editor.getValue()).toBe(normalized.join("\n"));
      expect(f.fake.opened).toEqual([]);
      return undefined;
    });
    f.trigger();
    await vi.waitFor(() => expect(f.fake.opened).toEqual(["Parent/Saffron/Saffron.md"]));
    expect(notices).toHaveLength(0);
    expect(f.editor.transaction).toHaveBeenCalledExactlyOnceWith({
      changes: [{ from: { line: 4, ch: 2 }, to: { line: 4, ch: 9 }, text: "[[Saffron]]" }],
    }, "folder-nodes-selection-link");
    expect(f.view.save).toHaveBeenCalledOnce();
  });

  it.each([
    ["neighboring cell", 4, "| [[Saffron]] | Gamma \\| |     |     |"],
    ["internal cell whitespace", 4, "| [[Saffron]] | Beta  \\| |     |     |"],
    ["link in wrong cell", 4, "| Saffron | [[Saffron]] |     |     |"],
    ["missing column", 4, "| [[Saffron]] | Beta \\| |     |"],
    ["column alignment", 3, "| :----------- | ------- | --- | --- |"],
    ["quote prefix", 2, "> | Name        | Value   |     |     |"],
    ["file content outside the table", 6, "After. "],
  ] as const)("rejects a change in %s during native width normalization", async (_kind, line, replacement) => {
    const { f, normalized } = nativeTableFixture();
    normalized[line] = replacement;
    f.editor.transaction.mockImplementationOnce(() => { f.lines.splice(0, f.lines.length, ...normalized); });
    f.trigger();
    await vi.waitFor(() => expect(notices.at(-1)).toContain("The source note changed during creation"));
    expect(f.fake.files.has("Parent/Saffron/Saffron.md")).toBe(true);
    expect(f.editor.getValue()).toBe(normalized.join("\n"));
    expect(f.editor.transaction).toHaveBeenCalledOnce();
    expect(f.view.save).not.toHaveBeenCalled();
    expect(f.fake.opened).toEqual([]);
  });

  it("waits for delayed table editor and view readback before saving, without dispatching again", async () => {
    const f = fixture({ confirm: false, table: true, label: "Alpha" });
    f.generate.mockReturnValue("[[Alpha|Alpha]]");
    const expected = "| before | [[Alpha\\|Alpha]] | after |\n| --- | --- | --- |";
    let savable = f.editor.getValue();
    f.view.getViewData = () => savable;
    const apply = f.editor.transaction.getMockImplementation()!;
    f.editor.transaction.mockImplementationOnce((change) => {
      window.setTimeout(() => apply(change), 0);
    });
    f.trigger();
    await vi.waitFor(() => expect(f.editor.getValue()).toBe(expected));
    expect(f.view.save).not.toHaveBeenCalled();
    expect(f.fake.files.has("Parent/Alpha/Alpha.md")).toBe(true);
    savable = expected;
    await vi.waitFor(() => expect(f.fake.opened).toEqual(["Parent/Alpha/Alpha.md"]));
    expect(f.editor.transaction).toHaveBeenCalledOnce();
    expect(f.view.save).toHaveBeenCalledOnce();
  });

  it("keeps the new node if the bound table editor never acknowledges the edit", async () => {
    const f = fixture({ confirm: false, table: true, label: "Alpha" });
    const before = f.editor.getValue();
    f.generate.mockReturnValue("[[Alpha|Alpha]]");
    f.editor.transaction.mockImplementationOnce(() => undefined);
    f.trigger();
    await vi.waitFor(() => expect(notices.at(-1)).toContain("Could not verify the link replacement in the editor"));
    expect(f.editor.getValue()).toBe(before);
    expect(notices.at(-1)).toContain("Parent/Alpha/Alpha.md");
    expect(f.fake.files.has("Parent/Alpha/Alpha.md")).toBe(true);
    expect(f.fake.opened).toEqual([]);
    expect(f.view.save).not.toHaveBeenCalled();
  });

  it("keeps the new node and leaves a concurrent table edit untouched", async () => {
    const f = fixture({ confirm: false, table: true, label: "Alpha" });
    f.generate.mockReturnValue("[[Alpha|Alpha]]");
    f.editor.transaction.mockImplementationOnce(() => {
      f.lines[0] = "| before | Alpha | edited |";
    });
    f.trigger();
    await vi.waitFor(() => expect(notices.at(-1)).toContain("The source note changed during creation"));
    expect(f.editor.getValue()).toBe("| before | Alpha | edited |\n| --- | --- | --- |");
    expect(f.fake.files.has("Parent/Alpha/Alpha.md")).toBe(true);
    expect(f.editor.transaction).toHaveBeenCalledOnce();
    expect(f.view.save).not.toHaveBeenCalled();
    expect(f.fake.opened).toEqual([]);
  });

  it("keeps the new node when the link is in the editor but saving fails", async () => {
    const f = fixture({ confirm: false, table: true, label: "Alpha" });
    f.generate.mockReturnValue("[[Alpha|Alpha]]");
    f.view.save.mockRejectedValueOnce(new Error("Save refused"));
    f.trigger();
    await vi.waitFor(() => expect(notices.at(-1)).toContain("Save refused"));
    expect(notices.at(-1)).toContain("Parent/Alpha/Alpha.md");
    expect(f.editor.getValue()).toContain("[[Alpha\\|Alpha]]");
    expect(f.fake.files.has("Parent/Alpha/Alpha.md")).toBe(true);
    expect(f.fake.opened).toEqual([]);
  });

  it("keeps the new node if the table transaction throws after it applies the link", async () => {
    const f = fixture({ confirm: false, table: true, label: "Alpha" });
    f.generate.mockReturnValue("[[Alpha|Alpha]]");
    const apply = f.editor.transaction.getMockImplementation()!;
    f.editor.transaction.mockImplementationOnce((change) => {
      apply(change);
      throw new Error("The host did not finish the edit");
    });
    f.trigger();
    await vi.waitFor(() => expect(notices.at(-1)).toContain("The host did not finish the edit"));
    expect(f.editor.getValue()).toContain("[[Alpha\\|Alpha]]");
    expect(f.fake.files.has("Parent/Alpha/Alpha.md")).toBe(true);
    expect(f.view.save).not.toHaveBeenCalled();
  });

  it("refuses a cell selection that does not match the full source range", () => {
    const f = fixture({ table: true, label: "Alpha" });
    f.lines[0] = "| before | Other | after |";
    f.trigger();
    expect(host.modals).toHaveLength(0);
    expect(notices.at(-1)).toContain("The source editor changed during creation");
    expect(f.fake.files.has("Parent/Alpha/Alpha.md")).toBe(false);
  });

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

  it.each(["| -- | -- | -- |", "> | :-- | --: | :--: |", "> > | --- | --- | --- |"])(
    "escapes aliases in a single cell and stops cross-cell creation with %s", async (delimiter) => {
      const quote = delimiter.slice(0, delimiter.indexOf("|"));
      for (const [label, crosses] of [["Alpha", false], ["Alpha | Beta", true]] as const) {
        const f = fixture({ confirm: false, table: true, label });
        f.lines[0] = quote + "|" + " ".repeat(8 - quote.length) + "| " + label + " |";
        f.lines[1] = crosses ? delimiter : delimiter.replace(/\|[^|]+\|$/u, "|");
        f.generate.mockReturnValue("[[Somewhere|Alpha]]");
        f.trigger();
        if (crosses) {
          expect(notices.at(-1)).toContain("crosses Markdown table cells");
          expect(f.fake.opened).toEqual([]);
          expect(f.generate).not.toHaveBeenCalled();
        } else {
          await vi.waitFor(() => expect(f.fake.opened).toHaveLength(1));
          expect(f.selection()).toBe("[[Somewhere\\|Alpha]]");
        }
      }
    },
  );

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

  it.each(["selection", "range", "source", "table", "editor"] as const)("rolls back when %s changes during creation", async (drift) => {
    const f = fixture({ confirm: false, table: true });
    f.generate.mockImplementation(() => {
      if (drift === "selection") f.changeSelection("changed");
      else if (drift === "range") f.moveRange();
      else if (drift === "source") f.fake.remove(f.file.path);
      else if (drift === "table") f.lines[1] = "no longer a delimiter";
      else f.closeEditor();
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
    expect(notices[0]).toContain("Automatic cleanup stopped");
    expect(notices[0]).toContain("Parent/Selected text/Selected text.md");
    expect(notices[0]).toContain("host generation failed");
    expect(notices[0]).toContain("concurrently modified created file");
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
