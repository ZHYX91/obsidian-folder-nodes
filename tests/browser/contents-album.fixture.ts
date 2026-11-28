import "../setup/obsidian-dom";
import { Menu } from "../mocks/obsidian";
import { FakeObsidian } from "../helpers/fake-obsidian";
import { NodeService } from "../../src/adapters/node-service";
import { ReferenceIndex } from "../../src/core/reference-index";
import { DEFAULT_SETTINGS } from "../../src/shared/settings";
import { FolderNodeContentsView } from "../../src/ui/contents-view";

let anchor: { x: number; y: number; width?: number; mainDocument: boolean } | null = null;
const copies: string[] = [];
let plainLinks = false;
let view: FolderNodeContentsView;
Menu.prototype.showAtPosition = (position, documentOwner) => {
  anchor = { ...position, mainDocument: documentOwner === document };
};
Object.defineProperty(navigator, "clipboard", { value: { writeText: async (text: string) => { copies.push(text); } } });

function button(key: string): HTMLButtonElement {
  const node = document.querySelector<HTMLButtonElement>(`[data-folder-nodes-focus-key="${CSS.escape(key)}"]`);
  if (!node) throw new Error(`Missing button: ${key}`);
  return node;
}

Object.assign(window, { contentsAlbum: {
  async prepare() {
    const fake = new FakeObsidian();
    fake.addFolder("Album");
    fake.addFolder("Notes");
    fake.addFile("Album/Album.md", "# Album");
    fake.addFile("Notes/A.jpg", "same name");
    fake.addFile("Album/readme.txt", "file section entry");
    for (const name of ["B.jpg", "C.jpg", "A.jpg", "Z [最後] (1) #%.jpg", "D.mp4"]) fake.addFile(`Album/${name}`, "");
    for (let index = 1; index <= 198; index++) fake.addFile(`Album/Z${String(index).padStart(3, "0")}.jpg`, "");
    Object.assign(fake.app.vault, {
      getResourcePath: () => "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
    });
    const service = new NodeService(fake.app, () => DEFAULT_SETTINGS);
    const noop = () => {};
    view = new FolderNodeContentsView({ app: fake.app } as never, service,
      { resolve: () => ({ kind: "fallback", value: "folder", accent: null, inheritedFrom: null }) },
      new ReferenceIndex(), {
        homepageEnabled: () => false, refresh: noop, reportError: (error) => { throw error; },
        createChild: noop, createMissingNote: noop, nodeMenu: noop, entryMenu: noop, problemMenu: noop,
        editVisual: noop, openHomepage: noop,
      }, false, () => ({ format: plainLinks ? "link" : "embed", blankLines: plainLinks }));
    document.body.style.cssText = "padding:14px;--size-2-1:2px;--size-4-2:8px;--size-4-3:12px;--font-ui-small:13px;";
    const hostIcons = document.createElement("style");
    hostIcons.textContent = ".clickable-icon svg { width: 16px; height: 16px; pointer-events: none; }";
    document.head.append(hostIcons);
    const viewport = document.createElement("meta");
    viewport.name = "viewport";
    viewport.content = "width=device-width,initial-scale=1";
    document.head.append(viewport);
    document.body.append(view.containerEl);
    await view.onOpen();
    view.setFolder("Album");
  },
  setFolder(path: string) { view.setFolder(path); },
  menuAnchor() { return anchor; },
  chooseSort(title: string) {
    const item = Menu.lastCreated?.items.find((candidate) => candidate.title === title);
    if (!item?.click) throw new Error(`Missing sort option: ${title}`);
    item.click();
  },
  point(key: string) {
    const node = button(key);
    node.scrollIntoView({ block: "center" });
    const { x, y, width, height } = node.getBoundingClientRect();
    for (const fraction of [0.5, 0.25, 0.75]) {
      const point = { x: x + width * fraction, y: y + height * 0.75 };
      if (document.elementFromPoint(point.x, point.y)?.closest("button") === node) return point;
    }
    throw new Error(`Button is obstructed: ${key}`);
  },
  focus(key: string) { button(key).focus(); },
  geometry() {
    const copy = button("album:copy");
    const sort = button("album:sort");
    const grid = copy.closest("details")!.querySelector(".folder-nodes-album-grid")!;
    return { copy: copy.getBoundingClientRect().toJSON(), sort: sort.getBoundingClientRect().toJSON(),
      grid: grid.getBoundingClientRect().toJSON(), width: innerWidth, coarse: matchMedia("(pointer: coarse)").matches };
  },
  useRegularLinks() { plainLinks = true; },
  state() {
    const cards = [...document.querySelectorAll(".folder-nodes-album-card")];
    return { shown: cards.map((card) => card.getAttribute("aria-label")),
      selected: cards.filter((card) => card.getAttribute("aria-pressed") === "true").map((card) => card.getAttribute("aria-label")),
      active: (document.activeElement as HTMLElement).dataset.folderNodesFocusKey,
      more: document.querySelector('[data-folder-nodes-focus-key="more:album"]')?.textContent, copies };
  },
} });
