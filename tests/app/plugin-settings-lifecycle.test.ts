import type { App, Command, PluginManifest } from "obsidian";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("obsidian", async (importOriginal) => ({
  ...await importOriginal<Record<string, unknown>>(),
  Platform: { isDesktopApp: true, isMobile: false },
  Plugin: class {
    public constructor(public app: App, public manifest: PluginManifest) {}
    public addChild(): void {}
    public registerView(): void {}
    public addSettingTab(): void {}
    public addRibbonIcon(): HTMLElement { return document.createElement("button"); }
    public addCommand(command: Command): Command { return command; }
  },
}));
vi.mock("../../src/app/settings-tab", () => ({
  FolderNodesSettingTab: class { public refreshPersistenceStatus(): void {} },
}));
vi.mock("../../src/ui/styles.css", () => ({ default: ".folder-nodes {}" }));
vi.mock("../../src/ui/node-graph.css", () => ({ default: ".folder-nodes-node-graph {}" }));

import FolderNodesPlugin from "../../src/app/plugin";
import { createSettingsSnapshot, DEFAULT_SETTINGS, type PersistedFolderNodesSettings } from "../../src/shared/settings";
import { setLanguage } from "../../src/ui/i18n";
import { FakeObsidian } from "../helpers/fake-obsidian";

function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function fixture() {
  const fake = new FakeObsidian();
  fake.app.workspace.onLayoutReady = () => undefined;
  fake.app.workspace.layoutReady = false;
  const data = new Map<string, unknown>();
  const writes: Array<{ label: string; snapshot: PersistedFolderNodesSettings }> = [];
  const getData = (id = "folder-nodes"): unknown => data.get(id) ?? createSettingsSnapshot(DEFAULT_SETTINGS);
  const setData = (value: unknown, id = "folder-nodes"): void => { data.set(id, structuredClone(value)); };
  const createPlugin = (label: string, options: {
    id?: string;
    PluginClass?: typeof FolderNodesPlugin;
    beforeFirstWrite?: Promise<void>;
    afterFirstWrite?: Promise<void>;
  } = {}) => {
    const id = options.id ?? "folder-nodes";
    const PluginClass = options.PluginClass ?? FolderNodesPlugin;
    const plugin = new PluginClass(fake.app, { id, name: "Folder Nodes" } as PluginManifest);
    Reflect.set(plugin, "registerEvents", () => undefined);
    const reconcile = vi.spyOn(plugin, "reconcileSettingsChange").mockResolvedValue(undefined);
    const loadData = vi.fn(async () => structuredClone(getData(id)));
    let writeCount = 0;
    const saveData = vi.fn(async (snapshot: PersistedFolderNodesSettings) => {
      const first = ++writeCount === 1;
      if (first && options.beforeFirstWrite !== undefined) await options.beforeFirstWrite;
      setData(snapshot, id);
      writes.push({ label, snapshot: structuredClone(snapshot) });
      if (first && options.afterFirstWrite !== undefined) await options.afterFirstWrite;
    });
    Reflect.set(plugin, "loadData", loadData);
    Reflect.set(plugin, "saveData", saveData);
    return { plugin, loadData, saveData, reconcile };
  };
  return { createPlugin, getData, setData, writes };
}

const INCOMPATIBLE_DATA = [
  { schemaVersion: 4, language: "fr", futureOnly: { retain: true } },
  { schemaVersion: "invalid", language: "fr", futureOnly: { retain: true } },
] as const;

afterEach(() => { setLanguage("en"); vi.restoreAllMocks(); });

describe("plugin settings persistence across reloads", () => {
  it.each([false, true])("orders startup after accepted saves and final flush (module reset: %s)", async (resetModules) => {
    const f = fixture();
    const blocked = deferred();
    const old = f.createPlugin("old", { beforeFirstWrite: blocked.promise });
    await old.plugin.onload();
    old.plugin.settings.language = "de";
    const saving = old.plugin.saveSettings();
    await vi.waitFor(() => expect(old.saveData).toHaveBeenCalledOnce());
    old.plugin.settings.language = "ja";
    old.plugin.onunload();
    let PluginClass = FolderNodesPlugin;
    if (resetModules) {
      vi.resetModules();
      PluginClass = (await import("../../src/app/plugin")).default;
    }
    const current = f.createPlugin("current", { PluginClass });
    const loading = current.plugin.onload();
    try {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      expect(current.loadData).not.toHaveBeenCalled();
    } finally { blocked.resolve(); }
    await Promise.all([saving, loading]);
    expect(current.plugin.settings.language).toBe("ja");
    current.plugin.settings.language = "fr";
    await current.plugin.saveSettings();
    expect(f.writes.map(({ label, snapshot }) => [label, snapshot.language])).toEqual([
      ["old", "de"], ["old", "ja"], ["current", "fr"],
    ]);
    expect(f.getData()).toMatchObject({ language: "fr" });
    expect(current.plugin.getSettingsSaveState()).toBe("saved");
  });

  it.each(INCOMPATIBLE_DATA)("protects observable schema $schemaVersion from a queued unload flush", async (incompatible) => {
    const f = fixture();
    const acknowledgment = deferred();
    const old = f.createPlugin("old", { afterFirstWrite: acknowledgment.promise });
    await old.plugin.onload();
    old.plugin.settings.language = "de";
    const saving = old.plugin.saveSettings();
    await vi.waitFor(() => expect(f.writes).toHaveLength(1));
    old.plugin.settings.language = "ja";
    old.plugin.onunload();
    f.setData(incompatible);
    const current = f.createPlugin("current");
    const loading = current.plugin.onload();
    acknowledgment.resolve();
    await Promise.all([saving, loading]);
    await vi.waitFor(() => expect(old.plugin.getSettingsSaveState()).not.toBe("saving"));
    expect(old.saveData).toHaveBeenCalledOnce();
    expect(f.getData()).toEqual(incompatible);
    expect(old.plugin.getSettingsSaveState()).toBe("blocked");
    expect(current.plugin.getSettingsSaveState()).toBe("blocked");
    await expect(current.plugin.saveSettings()).rejects.toMatchObject({ code: "settings_schema_incompatible" });
    await expect(current.plugin.retrySettingsSave()).rejects.toMatchObject({ code: "settings_schema_incompatible" });
    current.plugin.onunload();
    expect(current.saveData).not.toHaveBeenCalled();
  });

  it.each(INCOMPATIBLE_DATA)("rechecks schema $schemaVersion before dispatching a startup migration", async (incompatible) => {
    const f = fixture();
    const current = f.createPlugin("current");
    current.loadData.mockImplementationOnce(async () => {
      f.setData(incompatible);
      return { schemaVersion: 2, language: "de" };
    });
    await current.plugin.onload();
    await vi.waitFor(() => expect(current.plugin.getSettingsSaveState()).not.toBe("saving"));
    expect(current.saveData).not.toHaveBeenCalled();
    expect(f.getData()).toEqual(incompatible);
    expect(current.plugin.getSettingsSaveState()).toBe("blocked");
  });

  it("continues the shared queue after an older write rejects", async () => {
    const f = fixture();
    const blocked = deferred();
    const old = f.createPlugin("old", { beforeFirstWrite: blocked.promise });
    await old.plugin.onload();
    old.plugin.settings.language = "de";
    const saving = old.plugin.saveSettings();
    const failed = expect(saving).rejects.toThrow("Disk unavailable");
    await vi.waitFor(() => expect(old.saveData).toHaveBeenCalledOnce());
    old.plugin.settings.language = "ja";
    old.plugin.onunload();
    const current = f.createPlugin("current");
    const loading = current.plugin.onload();
    blocked.reject(new Error("Disk unavailable"));
    await Promise.all([failed, loading]);
    expect(current.plugin.settings.language).toBe("ja");
    current.plugin.settings.language = "fr";
    await current.plugin.saveSettings();
    expect(f.getData()).toMatchObject({ language: "fr" });
    expect(old.plugin.getSettingsSaveState()).toBe("saved");
  });

  it.each(["read", "write"] as const)("retains the failed snapshot for retry after a persistence %s failure", async (failure) => {
    const f = fixture();
    const current = f.createPlugin("current");
    await current.plugin.onload();
    if (failure === "read") current.loadData.mockRejectedValueOnce(new Error("Disk unavailable"));
    else current.saveData.mockRejectedValueOnce(new Error("Disk unavailable"));
    current.plugin.settings.language = "de";
    await expect(current.plugin.saveSettings()).rejects.toThrow("Disk unavailable");
    expect(current.plugin.getSettingsSaveState()).toBe("pending");
    current.plugin.settings.language = "fr";
    await current.plugin.retrySettingsSave();
    expect(f.getData()).toMatchObject({ language: "de" });
    expect(current.plugin.getSettingsSaveState()).toBe("saved");
    expect(current.reconcile).toHaveBeenCalledOnce();
  });

  it.each(["App", "plugin id"] as const)("isolates a different %s from a blocked writer", async (identity) => {
    const f = fixture();
    const blocked = deferred();
    const old = f.createPlugin("old", { beforeFirstWrite: blocked.promise });
    await old.plugin.onload();
    const saving = old.plugin.saveSettings();
    await vi.waitFor(() => expect(old.saveData).toHaveBeenCalledOnce());
    const other = identity === "App" ? fixture().createPlugin("other") : f.createPlugin("other", { id: "other-plugin" });
    let loaded = false;
    const loading = other.plugin.onload().then(() => { loaded = true; });
    try {
      await vi.waitFor(() => expect(loaded).toBe(true));
      await other.plugin.saveSettings();
      expect(other.saveData).toHaveBeenCalledOnce();
    } finally { blocked.resolve(); }
    await Promise.all([saving, loading]);
  });

  it("does not poison startup after a previous instance's load rejects", async () => {
    const f = fixture();
    const old = f.createPlugin("old");
    old.loadData.mockRejectedValueOnce(new Error("Read unavailable"));
    await expect(old.plugin.onload()).rejects.toThrow("Read unavailable");
    old.plugin.onunload();
    const current = f.createPlugin("current");
    await current.plugin.onload();
    await current.plugin.saveSettings();
    expect(old.saveData).not.toHaveBeenCalled();
    expect(current.saveData).toHaveBeenCalledOnce();
  });

  it("closes an instance unloaded before startup without writing defaults", async () => {
    const f = fixture();
    const old = f.createPlugin("old");
    old.plugin.onunload();
    old.plugin.onunload();
    await expect(old.plugin.saveSettings()).rejects.toThrow("closed");
    await expect(old.plugin.retrySettingsSave()).rejects.toThrow("closed");
    await old.plugin.onload();
    expect(old.loadData).not.toHaveBeenCalled();
    expect(old.saveData).not.toHaveBeenCalled();
  });

  it("lets an accepted startup read settle after unload without initializing or migrating", async () => {
    const f = fixture();
    const blocked = deferred();
    const old = f.createPlugin("old");
    old.loadData.mockImplementationOnce(async () => {
      await blocked.promise;
      return { schemaVersion: 2, language: "de" };
    });
    const loading = old.plugin.onload();
    await vi.waitFor(() => expect(old.loadData).toHaveBeenCalledOnce());
    old.plugin.onunload();
    const current = f.createPlugin("current");
    const reloading = current.plugin.onload();
    blocked.resolve();
    await Promise.all([loading, reloading]);
    expect(old.plugin.service).toBeUndefined();
    expect(old.saveData).not.toHaveBeenCalled();
    await expect(old.plugin.saveSettings()).rejects.toThrow("closed");
    expect(current.plugin.getSettingsSaveState()).toBe("saved");
  });

  it("accepts one final flush and rejects new work after repeated unload", async () => {
    const f = fixture();
    const old = f.createPlugin("old");
    await old.plugin.onload();
    old.plugin.settings.language = "de";
    old.plugin.onunload();
    old.plugin.onunload();
    await vi.waitFor(() => expect(old.plugin.getSettingsSaveState()).toBe("saved"));
    expect(old.saveData).toHaveBeenCalledOnce();
    await expect(old.plugin.saveSettings()).rejects.toThrow("closed");
    await expect(old.plugin.retrySettingsSave()).rejects.toThrow("closed");
    expect(old.saveData).toHaveBeenCalledOnce();
    expect(f.getData()).toMatchObject({ language: "de" });
  });
});
