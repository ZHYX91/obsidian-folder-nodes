let language = "en";

export class TAbstractFile {
  public name = "";
  public parent: TFolder | null = null;
  public path = "";
}

export class TFile extends TAbstractFile {
  public basename = "";
  public extension = "";
  public stat = { ctime: 0, mtime: 0, size: 0 };
}

export class TFolder extends TAbstractFile {
  public children: TAbstractFile[] = [];
  public isRoot(): boolean { return this.parent === null; }
}

export class App {}
export class Component { public onunload(): void {} }
export class WorkspaceLeaf {}
export class ItemView {
  public readonly app: unknown;
  public readonly containerEl = document.createElement("div");
  public readonly contentEl = this.containerEl.createDiv();
  private readonly cleanups: Array<() => void> = [];

  public constructor(public readonly leaf: { readonly app: unknown }) {
    this.app = leaf.app;
  }

  public register(cleanup: () => void): void { this.cleanups.push(cleanup); }
  public registerDomEvent<K extends keyof DocumentEventMap>(
    target: Document | HTMLElement,
    type: K,
    callback: (event: DocumentEventMap[K]) => void,
  ): void {
    target.addEventListener(type, callback as EventListener);
    this.register(() => target.removeEventListener(type, callback as EventListener));
  }
  public unload(): void {
    for (const cleanup of this.cleanups.splice(0).reverse()) cleanup();
  }
}
export class Notice {
  public static readonly messages: string[] = [];
  public constructor(message: string, _timeout?: number) { Notice.messages.push(message); }
}
export class MenuItem {
  public disabled = false;
  public icon = "";
  public title = "";
  public warning = false;
  public click: (() => void) | null = null;
  public setDisabled(value: boolean): this { this.disabled = value; return this; }
  public setIcon(value: string): this { this.icon = value; return this; }
  public setTitle(value: string): this { this.title = value; return this; }
  public setWarning(value: boolean): this { this.warning = value; return this; }
  public onClick(value: () => void): this { this.click = value; return this; }
}
export class Menu {
  public static lastCreated: Menu | null = null;
  public readonly items: MenuItem[] = [];
  public separators = 0;
  public constructor() { Menu.lastCreated = this; }
  public addItem(configure: (item: MenuItem) => unknown): this {
    const item = new MenuItem();
    configure(item);
    this.items.push(item);
    return this;
  }
  public addSeparator(): this { this.separators += 1; return this; }
  public showAtMouseEvent(_event: MouseEvent): void {}
  public showAtPosition(_position: { x: number; y: number }, _document?: Document): void {}
}
export class SearchComponent {
  public readonly inputEl: HTMLInputElement;
  public readonly clearButtonEl: HTMLButtonElement;
  private changed: (value: string) => void = () => undefined;
  public constructor(container: HTMLElement) {
    this.inputEl = container.createEl("input", { attr: { type: "search" } });
    this.clearButtonEl = container.createEl("button", { attr: { type: "button" } });
    this.inputEl.addEventListener("input", () => this.changed(this.inputEl.value));
    this.clearButtonEl.addEventListener("click", () => {
      this.inputEl.value = "";
      this.changed("");
    });
  }
  public onChange(callback: (value: string) => void): this { this.changed = callback; return this; }
  public setPlaceholder(value: string): this { this.inputEl.placeholder = value; return this; }
  public setValue(value: string): this { this.inputEl.value = value; return this; }
}
export class Modal {
  public closeCount = 0;
  public close(): void { this.closeCount += 1; }
}
export class MarkdownView { public containerEl = document.createElement("div"); public file: TFile | null = null; }

export function setIcon(container: HTMLElement, icon: string): void {
  const svg = container.ownerDocument.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("data-icon", icon);
  container.replaceChildren(svg);
}

export function setTooltip(element: HTMLElement, value: string): void {
  element.setAttribute("data-tooltip", value);
}

export function normalizePath(path: string): string {
  return path.replaceAll("\\", "/").replace(/^\/+|\/+$/gu, "").replace(/\/{2,}/gu, "/");
}

export function getLanguage(): string {
  return language;
}

export function getIconIds(): string[] {
  return ["brain", "folder", "folder-tree", "home", "star"];
}

export function setMockLanguage(value: string): void {
  language = value;
}
