import type { App, Command, PluginManifest } from "obsidian";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("obsidian", async (importOriginal) => ({
  ...await importOriginal<Record<string, unknown>>(),
  Plugin: class {
    public constructor(public app: App, public manifest: PluginManifest) {}
    public addCommand(command: Command): Command {
      return { ...command, id: `${this.manifest.id}:${command.id}`, name: `${this.manifest.name}: ${command.name}` };
    }
    public async saveData(): Promise<void> {}
  },
}));
vi.mock("../../src/app/settings-tab", () => ({ FolderNodesSettingTab: class {} }));
vi.mock("../../src/ui/styles.css", () => ({ default: ".folder-nodes {}" }));

import FolderNodesPlugin from "../../src/app/plugin";
import FolderNodesWithNodeGraphPlugin from "../../src/app/node-graph-plugin";
import { setLanguage, t } from "../../src/ui/i18n";

class TestPlugin extends FolderNodesWithNodeGraphPlugin {
  public registerGraphCommands(): void {
    for (const [id, name] of Object.entries(this.localizedCommandNames())) {
      if (id.startsWith("open-node-graph")) this.registerCommand({ id, name });
    }
  }
}

type Chrome = { localizedCommands: Command[]; registerCommands(): void; ribbonElement: HTMLElement };

function fixture() {
  const plugin = new TestPlugin({ workspace: { getLeavesOfType: () => [] } } as unknown as App,
    { id: "folder-nodes", name: "Folder Nodes" } as PluginManifest);
  const chrome = plugin as unknown as Chrome;
  chrome.registerCommands();
  plugin.registerGraphCommands();
  chrome.ribbonElement = document.createElement("button");
  return { plugin, chrome };
}

describe("plugin localization lifecycle", () => {
  beforeEach(() => setLanguage("en"));

  it("updates all host-prefixed command objects and ribbon labels across language changes", async () => {
    const { plugin, chrome } = fixture();
    const commands = [...chrome.localizedCommands];
    const names = commands.map(({ name }) => name);
    const ids = commands.map(({ id }) => id);
    expect(commands).toHaveLength(16);
    plugin.settings.language = "zh-CN";
    await plugin.applyLanguageSetting();
    expect(commands.every((command, index) => command.name !== names[index])).toBe(true);
    expect(commands.find(({ id }) => id.endsWith(":open-node-graph"))?.name).toBe("Folder Nodes: 打开节点图谱");
    expect(chrome.ribbonElement.getAttribute("aria-label")).toBe(t("contents"));
    plugin.settings.language = "en";
    await plugin.applyLanguageSetting();
    expect(commands.map(({ name }) => name)).toEqual(names);
    expect(commands.map(({ id }) => id)).toEqual(ids);
    commands.forEach((command, index) => expect(chrome.localizedCommands[index]).toBe(command));
    expect(chrome.ribbonElement.getAttribute("title")).toBe(t("contents"));
    FolderNodesPlugin.prototype.onunload.call(plugin);
    expect(chrome.localizedCommands).toHaveLength(0);
  });

  it("restores the hidden-node command label when settings reset the session override", async () => {
    const { plugin, chrome } = fixture();
    const command = chrome.localizedCommands.find(({ id }) => id.endsWith(":toggle-hidden-nodes"))!;
    plugin.settings.hiddenNodesEnabled = true;
    plugin.reconcileSettingsChange = FolderNodesPlugin.prototype.reconcileSettingsChange.bind(plugin);
    await plugin.toggleHiddenNodesThisSession();
    expect(command.name).toBe(`Folder Nodes: ${t("hideHiddenNodesThisSession")}`);
    plugin.settings.hiddenNodesEnabled = false;
    await plugin.reconcileSettingsChange();
    expect(command.name).toBe(`Folder Nodes: ${t("showHiddenNodesThisSession")}`);
  });
});
