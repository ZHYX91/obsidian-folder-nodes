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
export class Notice { public constructor(_message: string, _timeout?: number) {} }
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

export function normalizePath(path: string): string {
  return path.replaceAll("\\", "/").replace(/^\/+|\/+$/gu, "").replace(/\/{2,}/gu, "/");
}

export function getLanguage(): string {
  return language;
}

export function setMockLanguage(value: string): void {
  language = value;
}
