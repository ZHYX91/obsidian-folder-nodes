export class RuntimeStyles {
  private readonly sheets = new Map<Document, CSSStyleSheet>();
  private readonly source: string;

  public constructor(css: string) {
    if (css.trim() === "") throw new Error("Folder Nodes stylesheet must not be empty");
    this.source = `:root { --folder-nodes-runtime-style: "${fingerprint(css)}"; }\n${css}`;
  }

  public install(document: Document): boolean {
    const view = document.defaultView;
    if (view === null) throw new Error("Folder Nodes stylesheet requires a document window");

    const current = this.sheets.get(document);
    if (current !== undefined) {
      current.replaceSync(this.source);
      const wasAdopted = document.adoptedStyleSheets.includes(current);
      document.adoptedStyleSheets = [
        ...document.adoptedStyleSheets.filter((candidate) => candidate !== current),
        current,
      ];
      return !wasAdopted;
    }

    const sheet = new view.CSSStyleSheet();
    sheet.replaceSync(this.source);
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
    this.sheets.set(document, sheet);
    return true;
  }

  public removeAll(): void {
    for (const [document, sheet] of this.sheets) {
      document.adoptedStyleSheets = document.adoptedStyleSheets.filter(
        (candidate) => candidate !== sheet,
      );
    }
    this.sheets.clear();
  }
}

function fingerprint(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}
