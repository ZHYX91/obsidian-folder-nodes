export class RuntimeStyles {
  private readonly sheets = new Map<Document, CSSStyleSheet>();
  private readonly bodyProperties = new Map<string, string>();
  private readonly css: string;

  public constructor(css: string) {
    if (css.trim() === "") throw new Error("Folder Nodes stylesheet must not be empty");
    this.css = css;
  }

  public setBodyProperty(name: string, value: string | null): boolean {
    if (!/^--folder-nodes-[a-z0-9-]+$/u.test(name)) throw new Error(`Invalid Folder Nodes style property: ${name}`);
    if (value !== null && /[;{}\r\n]/u.test(value)) throw new Error(`Invalid Folder Nodes style value: ${name}`);
    const previous = this.bodyProperties.get(name) ?? null;
    if (previous === value) return false;
    if (value === null) this.bodyProperties.delete(name);
    else this.bodyProperties.set(name, value);
    const source = this.source();
    for (const sheet of this.sheets.values()) sheet.replaceSync(source);
    return true;
  }

  public install(document: Document): boolean {
    const view = document.defaultView;
    if (view === null) throw new Error("Folder Nodes stylesheet requires a document window");

    const current = this.sheets.get(document);
    if (current !== undefined) {
      current.replaceSync(this.source());
      const wasAdopted = document.adoptedStyleSheets.includes(current);
      document.adoptedStyleSheets = [
        ...document.adoptedStyleSheets.filter((candidate) => candidate !== current),
        current,
      ];
      return !wasAdopted;
    }

    const sheet = new view.CSSStyleSheet();
    sheet.replaceSync(this.source());
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

  private source(): string {
    const properties = [...this.bodyProperties]
      .map(([name, value]) => `${name}: ${value};`)
      .join(" ");
    const overrides = properties === "" ? "" : `\nbody { ${properties} }`;
    const content = `${this.css}${overrides}`;
    return `:root { --folder-nodes-runtime-style: "${fingerprint(content)}"; }\n${content}`;
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
