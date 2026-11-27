import "../setup/obsidian-dom";
import type { TFile } from "obsidian";
import { Menu } from "../mocks/obsidian";
import { FakeObsidian } from "../helpers/fake-obsidian";
import { NodeService } from "../../src/adapters/node-service";
import { ReferenceIndex } from "../../src/core/reference-index";
import { DEFAULT_SETTINGS } from "../../src/shared/settings";
import { FolderNodeContentsView } from "../../src/ui/contents-view";

let view: FolderNodeContentsView | null = null;
let copied = "";
Object.defineProperty(navigator, "clipboard", {
  configurable: true,
  value: { writeText: (value: string) => { copied = value; return Promise.resolve(); } },
});
Object.assign(window, { albumFixture: {
  async prepare() {
    if (view !== null) { await view.onClose(); view.containerEl.remove(); }
    copied = "";
    const fake = new FakeObsidian();
    Object.assign(fake.app.vault, { getResourcePath: () => "" });
    Object.assign(fake.app.fileManager, { generateMarkdownLink: (file: TFile) => `[[${file.name}]]` });
    fake.addFile("Vault.md");
    for (const [name, timestamp] of [["image2.png", 20], ["image10.png", 10], ["image3.png", 30]] as const) {
      fake.addFile(name).stat = { ctime: timestamp, mtime: timestamp, size: 1 };
    }
    const service = new NodeService(fake.app, () => DEFAULT_SETTINGS);
    const noop = () => {};
    view = new FolderNodeContentsView({ app: fake.app } as never, service,
      { resolve: () => ({ kind: "fallback", value: "folder", accent: null, inheritedFrom: null }) }, new ReferenceIndex(), {
        homepageEnabled: () => false, refresh: () => view?.refresh(), reportError: (error) => { throw error; },
        createChild: noop, createMissingNote: noop, nodeMenu: noop, entryMenu: noop, problemMenu: noop,
        editVisual: noop, openHomepage: noop,
      });
    view.containerEl.createEl("style", { text: ".clickable-icon > svg { width: 18px; height: 18px; }" });
    document.body.append(view.containerEl);
    await view.onOpen();
  },
  sort(index: number) {
    document.querySelector<HTMLButtonElement>("[data-folder-nodes-focus-key='album:sort']")!.click();
    Menu.lastCreated!.items[index]!.click!();
  },
  state() {
    const cards = [...document.querySelectorAll(".folder-nodes-album-card")];
    return {
      shown: cards.map((card) => card.getAttribute("aria-label")),
      selected: cards.filter((card) => card.getAttribute("aria-pressed") === "true")
        .map((card) => card.getAttribute("aria-label")),
      copied,
    };
  },
} });
