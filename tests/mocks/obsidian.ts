let language = "en";

export function moment(date: Date): { format(pattern: string): string } {
  const pad = (value: number, length = 2) => value.toString().padStart(length, "0");
  return {
    format(pattern) {
      const values: Record<string, string> = {
        YYYY: date.getFullYear().toString(), YY: pad(date.getFullYear() % 100),
        MM: pad(date.getMonth() + 1), M: String(date.getMonth() + 1),
        DD: pad(date.getDate()), D: String(date.getDate()),
        HH: pad(date.getHours()), H: String(date.getHours()),
        mm: pad(date.getMinutes()), m: String(date.getMinutes()),
        ss: pad(date.getSeconds()), s: String(date.getSeconds()), SSS: pad(date.getMilliseconds(), 3),
      };
      return pattern.replace(/\[([^\]]*)\]|YYYY|SSS|YY|MM|DD|HH|mm|ss|M|D|H|m|s/gu, (token, literal: string | undefined) => literal ?? values[token] ?? token);
    },
  };
}

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
export class ButtonComponent {
  public readonly buttonEl: HTMLButtonElement;
  private click: () => void = () => undefined;
  public constructor(container: HTMLElement) {
    this.buttonEl = container.createEl("button", { attr: { type: "button" } });
    this.buttonEl.addEventListener("click", () => this.click());
  }
  public onClick(callback: () => void): this { this.click = callback; return this; }
  public setButtonText(value: string): this { this.buttonEl.textContent = value; return this; }
  public setDisabled(value: boolean): this { this.buttonEl.disabled = value; return this; }
}
export class Setting {
  public readonly settingEl: HTMLDivElement;
  public readonly infoEl: HTMLDivElement;
  public readonly nameEl: HTMLDivElement;
  public readonly descEl: HTMLDivElement;
  public readonly controlEl: HTMLDivElement;
  public constructor(container: HTMLElement) {
    this.settingEl = container.createDiv({ cls: "setting-item" });
    this.infoEl = this.settingEl.createDiv({ cls: "setting-item-info" });
    this.nameEl = this.infoEl.createDiv({ cls: "setting-item-name" });
    this.descEl = this.infoEl.createDiv({ cls: "setting-item-description" });
    this.controlEl = this.settingEl.createDiv({ cls: "setting-item-control" });
  }
  public addButton(configure: (button: ButtonComponent) => unknown): this {
    configure(new ButtonComponent(this.controlEl));
    return this;
  }
  public setClass(value: string): this { this.settingEl.classList.add(value); return this; }
  public setDesc(value: string): this { this.descEl.textContent = value; return this; }
  public setName(value: string): this { this.nameEl.textContent = value; return this; }
}
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
