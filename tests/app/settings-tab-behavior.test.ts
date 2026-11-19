import { type App, type PluginManifest } from "obsidian";
import { describe, expect, it, vi } from "vitest";

import FolderNodesPlugin from "../../src/app/plugin";
import { FolderNodesSettingTab } from "../../src/app/settings-tab";
import { CURRENT_SETTINGS_SCHEMA_VERSION, DEFAULT_SETTINGS, type PersistedFolderNodesSettings } from "../../src/shared/settings";
import type { SettingsSaveState } from "../../src/shared/settings-save-coordinator";
import { setLanguage, t } from "../../src/ui/i18n";
import { AVAILABLE_INTERFACE_LOCALES, INTERFACE_LOCALE_LABELS } from "../../src/core/interface-languages";

vi.mock("obsidian", async (importOriginal) => {
  const actual = await importOriginal<typeof import("obsidian")>();
  class TestPluginSettingTab {
    public hide(): void { this.containerEl.replaceChildren(); }
    public readonly containerEl = document.createElement("div");
  }
  return {
    ...actual, PluginSettingTab: TestPluginSettingTab,
    Plugin: class {
      public constructor(public app: App, public manifest: PluginManifest) {}
      public async saveData(_snapshot: unknown): Promise<void> {}
    },
  };
});
vi.mock("../../src/ui/styles.css", () => ({ default: ".folder-nodes {}" }));
vi.mock("../../src/ui/node-graph.css", () => ({ default: ".folder-nodes-node-graph {}" }));

function fixture() {
  const state: { current: SettingsSaveState } = { current: "saved" };
  const plugin = {
    settings: structuredClone(DEFAULT_SETTINGS),
    ensureStyles: vi.fn(),
    getSettingsCompatibility: () => ({
      status: "compatible" as const,
      currentSchemaVersion: CURRENT_SETTINGS_SCHEMA_VERSION,
      storedSchemaVersion: CURRENT_SETTINGS_SCHEMA_VERSION,
    }),
    getSettingsSaveState: () => state.current,
    retrySettingsSave: vi.fn(async () => { state.current = "saved"; }),
    saveSettings: vi.fn(async (): Promise<void> => undefined),
    reconcileSettingsChange: vi.fn(async () => undefined),
    previewSelectionName: (selection: string) => selection,
    openBatchOrganize: vi.fn(),
    openPropertyMigration: vi.fn(),
    showHealth: vi.fn(),
  };
  const tab = new FolderNodesSettingTab({} as App, plugin as unknown as FolderNodesPlugin);
  document.body.append(tab.containerEl);
  return { tab, plugin, state };
}

function numberControl(tab: FolderNodesSettingTab, name: string, description: string, panel: HTMLElement = document.body.createDiv()) {
  const method = tab as unknown as {
    renderGraphNumberSetting: (
      panel: HTMLElement,
      key: "largeGraphThreshold" | "overviewEdgeLimit",
      name: string,
      description: string,
      minimum: number,
      maximum: number,
    ) => void;
  };
  method.renderGraphNumberSetting(panel, "largeGraphThreshold", name, description, 50, 10_000);
  const input = panel.querySelector<HTMLInputElement>("input");
  if (input === null) throw new Error("Missing graph numeric input");
  return { input, panel };
}

function persistenceFixture(failures: number) {
  const plugin = new FolderNodesPlugin({} as App, { id: "folder-nodes", name: "Folder Nodes" } as PluginManifest);
  const snapshots: PersistedFolderNodesSettings[] = [];
  vi.spyOn(plugin, "saveData").mockImplementation(async (snapshot: unknown) => {
    snapshots.push(structuredClone(snapshot as PersistedFolderNodesSettings));
    if (snapshots.length <= failures) throw new Error("Disk unavailable");
  });
  vi.spyOn(plugin, "ensureStyles").mockImplementation(() => undefined);
  const reconcile = vi.spyOn(plugin, "reconcileSettingsChange").mockResolvedValue(undefined);
  const tab = new FolderNodesSettingTab({} as App, plugin);
  Reflect.set(plugin, "settingsTab", tab);
  Reflect.set(tab, "renderGeneral", (panel: HTMLElement) => numberControl(tab, "Canvas threshold", "Choose the Canvas threshold", panel));
  Reflect.set(tab, "revealActiveTab", () => undefined);
  document.body.append(tab.containerEl);
  tab.display();
  const input = tab.containerEl.querySelector<HTMLInputElement>("input")!;
  return { plugin, tab, input, snapshots, reconcile };
}

describe("imperative settings edit state", () => {
  it.each(["en", "zh-CN", "ar"] as const)("offers the local user guide and issue form from General in %s", (locale) => {
    const { tab } = fixture();
    try {
      setLanguage(locale);
      tab.display();
      const options = [...tab.containerEl.querySelector<HTMLSelectElement>("select")!.options];
      expect(options.map((option) => option.textContent)).toEqual([t("auto"), ...Object.values(INTERFACE_LOCALE_LABELS)]);
      const links = [...tab.containerEl.querySelectorAll<HTMLAnchorElement>(".folder-nodes-settings-support a")];
      const guide = locale === "en" ? "README.md" : `docs/i18n/README.${locale}.md`;
      expect(links.map((link) => [link.textContent, link.getAttribute("href")])).toEqual([
        [t("userGuide"), `https://github.com/ZHYX91/obsidian-folder-nodes/blob/main/${guide}`],
        [t("reportIssue"), "https://github.com/ZHYX91/obsidian-folder-nodes/issues/new/choose"],
      ]);
    } finally { tab.containerEl.remove(); setLanguage("en"); }
  });

  it("retains a guide across tab switches and forgets it when settings close", () => {
    const { tab } = fixture();
    const select = (id: string) => tab.containerEl.querySelector<HTMLButtonElement>(`#folder-nodes-settings-tab-${id}`)!.click();
    const guide = () => tab.containerEl.querySelector<HTMLDetailsElement>("details")!;
    tab.showManagement();
    expect(guide().open).toBe(false);
    guide().open = true;
    select("general");
    select("management");
    const previous = guide();
    expect(previous.open).toBe(true);
    tab.hide();
    previous.dispatchEvent(new Event("toggle"));
    tab.display();
    expect(guide().open).toBe(false);
    tab.containerEl.remove();
  });

  it("places optional examples after their related settings and keeps required guidance visible", () => {
    const { tab } = fixture();
    tab.display();
    const select = (id: string) => tab.containerEl.querySelector<HTMLButtonElement>(`#folder-nodes-settings-tab-${id}`)!.click();
    select("management");
    const rows = [...tab.containerEl.querySelectorAll(".setting-item")];
    const descriptionFor = (name: string) => rows
      .find((row) => row.querySelector(".setting-item-name")?.textContent === name)
      ?.querySelector(".setting-item-description")?.textContent;
    expect(descriptionFor(t("leafExemptions"))).toBe(t("leafExemptionsDesc"));
    expect(descriptionFor(t("folderExemptions"))).toBe(t("folderExemptionsDesc"));
    expect(descriptionFor("AGENTS.md")).toBe(t("exactPathRule"));
    expect(descriptionFor(t("nameStartsWith", { prefix: "_" }))).toBe(t("nameStartRule"));
    select("icons");
    const guide = tab.containerEl.querySelector<HTMLDetailsElement>("details")!;
    expect(guide.textContent).toContain("icon: 💰");
    expect(guide.textContent).toContain(t("iconColorBehavior"));
    expect(guide.querySelectorAll(".folder-nodes-icon-comparison-row")).toHaveLength(4);
    expect(guide.parentElement!.lastElementChild).toBe(guide);
    expect(guide.parentElement!.querySelector(".folder-nodes-settings-guide-brief")?.textContent).toBe(t("iconGuideIntro"));
    select("naming");
    const naming = tab.containerEl.querySelector<HTMLDetailsElement>("details")!;
    expect(naming.textContent).toContain("[[a|b]]");
    expect(naming.textContent).toContain("a/a.md");
    expect(naming.previousElementSibling?.querySelector(".setting-item-name")?.textContent).toBe(t("aliases"));
    expect(naming.nextElementSibling?.querySelector(".setting-item-name")?.textContent).toBe(t("prefix"));
    expect(naming.parentElement!.querySelector(".folder-nodes-settings-guide-brief")?.textContent).toBe(t("creationGuideSelection"));
    tab.containerEl.remove();
  });

  it("shows independent timestamp fields only for naming parts that use a timestamp", () => {
    const { tab, plugin } = fixture();
    Object.assign(plugin.settings.prefix, { enabled: true, source: "timestamp", timestampFormat: "YYYY" });
    Object.assign(plugin.settings.suffix, { enabled: true, source: "custom", timestampFormat: "HHmm" });
    tab.display();
    tab.containerEl.querySelector<HTMLButtonElement>("#folder-nodes-settings-tab-naming")!.click();
    const format = (part: "prefix" | "suffix") => [...tab.containerEl.querySelectorAll(".setting-item")]
      .find((row) => row.querySelector(".setting-item-name")?.textContent === `${t(part)}: ${t("timestampFormat")}`)
      ?.querySelector("input")?.value;
    expect(format("prefix")).toBe("YYYY");
    expect(format("suffix")).toBeUndefined();
    plugin.settings.suffix.source = "timestamp";
    tab.display();
    expect(format("prefix")).toBe("YYYY");
    expect(format("suffix")).toBe("HHmm");
    tab.containerEl.remove();
  });

  it("opens the intended five tabs and management actions through the imperative surface", () => {
    const { tab, plugin } = fixture();
    expect(tab.getSettingDefinitions()).toEqual([]);
    tab.display();
    expect([...tab.containerEl.querySelectorAll("[role=tab]")].map((button) => button.textContent))
      .toEqual([t("general"), t("management"), t("icons"), t("naming"), t("nodeGraph")]);
    tab.containerEl.querySelector<HTMLButtonElement>("#folder-nodes-settings-tab-management")!.click();
    const panel = tab.containerEl.querySelector<HTMLElement>("[role=tabpanel]")!;
    const guide = panel.querySelector<HTMLDetailsElement>("details.folder-nodes-settings-guide")!;
    const essential = panel.querySelector<HTMLElement>(".folder-nodes-settings-guide-brief")!;
    const firstRule = panel.querySelector<HTMLElement>(".setting-item")!;
    expect(guide.open).toBe(false);
    const ruleNames = [...panel.querySelectorAll(".setting-item-name")].map((name) => name.textContent);
    expect(ruleNames).toContain(t("nameStartsWith", { prefix: "_" }));
    expect(ruleNames).not.toContain("_*");
    expect(guide.querySelector("summary")?.textContent).toBe(t("managementGuideTitle"));
    expect(essential.textContent).toContain(t("managementGuideBoundary"));
    expect(essential.compareDocumentPosition(firstRule) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
    expect(panel.lastElementChild).toBe(guide);
    for (const [label, action] of [
      [t("previewOrganizePlan"), plugin.openBatchOrganize],
      [t("previewPropertyMigration"), plugin.openPropertyMigration],
      [t("health"), plugin.showHealth],
    ] as const) {
      [...panel.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent === label)!.click();
      expect(action).toHaveBeenCalledOnce();
    }
    expect(plugin.saveSettings).not.toHaveBeenCalled();
    tab.containerEl.remove();
  });

  it.each([
    "leafNoteExemptions", "ignoredFolders", "leafNotePrefixes", "ignoredFolderPrefixes",
  ] as const)("deletes the clicked %s values while saving is pending", async (key) => {
    const { tab, plugin } = fixture();
    plugin.settings.leafNoteExemptions = [];
    plugin.settings.ignoredFolders = [];
    plugin.settings.leafNotePrefixes = [];
    plugin.settings.ignoredFolderPrefixes = [];
    plugin.settings[key] = ["Alpha", "Bravo", "Charlie"];
    const pending: Array<() => void> = [];
    plugin.saveSettings.mockImplementation(() => new Promise<void>((resolve) => { pending.push(resolve); }));
    tab.display();
    tab.containerEl.querySelector<HTMLButtonElement>("#folder-nodes-settings-tab-management")!.click();
    const rules = [...tab.containerEl.querySelectorAll<HTMLElement>(".setting-item")]
      .filter((row) => row.querySelector(".clickable-icon[aria-label]") !== null);
    const first = rules[0]!.querySelector<HTMLElement>(".clickable-icon")!;
    const second = rules[1]!.querySelector<HTMLElement>(".clickable-icon")!;
    first.click();
    second.click();
    first.click();
    expect(plugin.settings[key]).toEqual(["Charlie"]);
    expect(plugin.saveSettings).toHaveBeenCalledTimes(2);
    for (const resolve of pending) resolve();
    await vi.waitFor(() => expect(plugin.reconcileSettingsChange).toHaveBeenCalledTimes(2));
    expect(plugin.settings[key]).toEqual(["Charlie"]);
    const remaining = [...tab.containerEl.querySelectorAll<HTMLElement>(".setting-item")]
      .filter((row) => row.querySelector(".clickable-icon[aria-label]") !== null);
    expect(remaining).toHaveLength(1);
    expect(remaining[0]!.textContent).toContain("Charlie");
    tab.containerEl.remove();
  });

  it("retains a failed rule deletion for Retry and does not reconcile unsaved settings", async () => {
    const { tab, plugin, state } = fixture();
    plugin.settings.leafNoteExemptions = ["Alpha"];
    plugin.saveSettings.mockImplementation(async () => { state.current = "pending"; throw new Error("Disk unavailable"); });
    tab.display();
    tab.containerEl.querySelector<HTMLButtonElement>("#folder-nodes-settings-tab-management")!.click();
    tab.containerEl.querySelector<HTMLElement>(".clickable-icon[aria-label]")!.click();
    await vi.waitFor(() => expect(tab.containerEl.querySelector(".folder-nodes-settings-warning")).not.toBeNull());
    expect(plugin.settings.leafNoteExemptions).toEqual([]);
    expect(plugin.reconcileSettingsChange).not.toHaveBeenCalled();
    tab.containerEl.remove();
  });

  it("scopes language and direction to settings across all supported locales", () => {
    const { tab } = fixture();
    for (const method of ["renderGeneral", "renderManagement", "renderIcons", "renderNaming", "renderNodeGraph", "revealActiveTab"]) {
      Reflect.set(tab, method, () => undefined);
    }
    const bodyDirection = document.body.dir;
    const bodyLanguage = document.body.lang;
    try {
      for (const locale of [...AVAILABLE_INTERFACE_LOCALES, "en"] as const) {
        setLanguage(locale);
        tab.display();
        expect(tab.containerEl.lang).toBe(locale);
        expect(tab.containerEl.dir).toBe(locale === "ar" ? "rtl" : "ltr");
        const buttons = [...tab.containerEl.querySelectorAll<HTMLButtonElement>("[role=tab]")];
        expect(buttons.map((button) => button.textContent))
          .toEqual(["general", "management", "icons", "naming", "nodeGraph"].map((key) => t(key as Parameters<typeof t>[0])));
        buttons[4]?.click();
        expect(tab.containerEl.querySelector("[role=tab][aria-selected=true]")?.textContent).toBe(t("nodeGraph"));
        expect(document.body.dir).toBe(bodyDirection);
        expect(document.body.lang).toBe(bodyLanguage);
      }
    } finally { setLanguage("en"); }
  });

  it("does not write an empty or intermediate graph threshold and commits valid edits on blur", async () => {
    const { tab, plugin } = fixture();
    const saved = plugin.settings.nodeGraph.largeGraphThreshold;
    const { input } = numberControl(tab, "Canvas threshold", "Choose the Canvas threshold");
    input.value = "";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    expect(plugin.settings.nodeGraph.largeGraphThreshold).toBe(saved);
    expect(plugin.saveSettings).not.toHaveBeenCalled();
    input.value = "240";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    expect(plugin.settings.nodeGraph.largeGraphThreshold).toBe(saved);
    input.dispatchEvent(new Event("blur"));
    await vi.waitFor(() => expect(plugin.saveSettings).toHaveBeenCalledOnce());
    expect(plugin.settings.nodeGraph.largeGraphThreshold).toBe(240);
    expect(plugin.reconcileSettingsChange).toHaveBeenCalledOnce();
  });

  it("keeps YAML, link mappings and numeric inputs readable inside Arabic RTL settings", () => {
    const { tab } = fixture();
    const panel = document.body.createDiv({ attr: { dir: "rtl" } });
    const guides = tab as unknown as { renderIconGuide(panel: HTMLElement): void; renderNamingGuide(panel: HTMLElement): void };
    try {
      setLanguage("ar");
      guides.renderIconGuide(panel);
      guides.renderNamingGuide(panel);
      const example = panel.querySelector<HTMLElement>("code");
      expect(example?.textContent).toBe("icon: 💰");
      expect(example?.dir).toBe("ltr");
      const mappings = [...panel.querySelectorAll<HTMLElement>(".folder-nodes-settings-guide-mapping")];
      expect(mappings).toHaveLength(2);
      expect(mappings.map((mapping) => mapping.dir)).toEqual(["ltr", "ltr"]);
      expect(mappings.map((mapping) => mapping.textContent)).toEqual(["[[a]]→a/a.md", "[[a|b]]→a/a.md"]);
      const { input } = numberControl(tab, "Canvas", "Threshold", panel);
      expect(input.dir).toBe("ltr");
      expect(input.value).toBe("500");
      expect(panel.dir).toBe("rtl");
    } finally { setLanguage("en"); }
  });

  it("reports invalid numeric submissions without clamping or saving", async () => {
    const { tab, plugin } = fixture();
    const saved = plugin.settings.nodeGraph.largeGraphThreshold;
    const { input, panel } = numberControl(tab, "Canvas threshold", "Choose the Canvas threshold");
    input.value = "49";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("blur"));
    expect(plugin.saveSettings).not.toHaveBeenCalled();
    expect(plugin.settings.nodeGraph.largeGraphThreshold).toBe(saved);
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(panel.textContent).toContain("50");
    expect(panel.textContent).toContain("10000");
  });

  it("updates failed-save feedback in place and retries without replacing a focused editor", async () => {
    const { tab, plugin, state } = fixture();
    Reflect.set(tab, "renderGeneral", (panel: HTMLElement) => {
      panel.createEl("input", { attr: { "data-test-editor": "true" } });
    });
    Reflect.set(tab, "revealActiveTab", () => undefined);
    tab.display();
    const editor = tab.containerEl.querySelector<HTMLInputElement>("[data-test-editor]");
    if (editor === null) throw new Error("Missing sentinel editor");
    editor.value = "draft";
    editor.focus();
    state.current = "pending";
    tab.refreshPersistenceStatus();
    expect(tab.containerEl.querySelector("[data-test-editor]")).toBe(editor);
    expect(document.activeElement).toBe(editor);
    expect(editor.value).toBe("draft");

    const retry = tab.containerEl.querySelector<HTMLButtonElement>(".folder-nodes-settings-warning button");
    expect(retry).not.toBeNull();
    retry?.click();
    await vi.waitFor(() => expect(plugin.retrySettingsSave).toHaveBeenCalledOnce());
    await vi.waitFor(() => expect(tab.containerEl.querySelector(".folder-nodes-settings-warning")).toBeNull());
    expect(tab.containerEl.querySelector("[data-test-editor]")).toBe(editor);
    expect(document.activeElement).toBe(editor);
  });

  it("applies the retained committed graph snapshot after Retry while preserving an unfinished edit", async () => {
    const { plugin, tab, input, snapshots, reconcile } = persistenceFixture(1);
    input.value = "240";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("blur"));
    await vi.waitFor(() => expect(plugin.getSettingsSaveState()).toBe("pending"));
    expect(reconcile).not.toHaveBeenCalled();
    input.value = "2";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.focus();
    tab.containerEl.querySelector<HTMLButtonElement>(".folder-nodes-settings-warning button")!.click();
    await vi.waitFor(() => expect(plugin.getSettingsSaveState()).toBe("saved"));
    await vi.waitFor(() => expect(reconcile).toHaveBeenCalledOnce());
    expect(snapshots.map((snapshot) => snapshot.nodeGraph.largeGraphThreshold)).toEqual([240, 240]);
    expect(plugin.settings.nodeGraph.largeGraphThreshold).toBe(240);
    expect(tab.containerEl.querySelector("input")).toBe(input);
    expect(input.value).toBe("2");
    expect(document.activeElement).toBe(input);
    expect(tab.containerEl.querySelector(".folder-nodes-settings-warning")).toBeNull();
    await plugin.retrySettingsSave();
    expect(reconcile).toHaveBeenCalledOnce();
  });

  it("keeps failed retries pending and applies only the latest committed graph snapshot on recovery", async () => {
    const { plugin, tab, input, snapshots, reconcile } = persistenceFixture(3);
    for (const value of ["240", "360"]) {
      input.value = value;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("blur"));
      await vi.waitFor(() => expect(plugin.getSettingsSaveState()).toBe("pending"));
    }
    input.value = "3";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    tab.containerEl.querySelector<HTMLButtonElement>(".folder-nodes-settings-warning button")!.click();
    await vi.waitFor(() => expect(snapshots).toHaveLength(3));
    await vi.waitFor(() => expect(plugin.getSettingsSaveState()).toBe("pending"));
    expect(tab.containerEl.querySelector(".folder-nodes-settings-warning")).not.toBeNull();
    expect(reconcile).not.toHaveBeenCalled();
    tab.containerEl.querySelector<HTMLButtonElement>(".folder-nodes-settings-warning button")!.click();
    await vi.waitFor(() => expect(reconcile).toHaveBeenCalledOnce());
    expect(plugin.getSettingsSaveState()).toBe("saved");
    expect(snapshots.map((snapshot) => snapshot.nodeGraph.largeGraphThreshold)).toEqual([240, 360, 360, 360]);
    expect(input.value).toBe("3");
    expect(tab.containerEl.querySelector("input")).toBe(input);
  });
});
