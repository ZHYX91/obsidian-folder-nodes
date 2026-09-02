import { App, TAbstractFile, TFile, TFolder } from "obsidian";

export class FakeObsidian {
  public readonly root = folder("");
  public readonly files = new Map<string, TAbstractFile>([["", this.root]]);
  public readonly contents = new Map<string, string>();
  public readonly frontmatters = new Map<string, Record<string, unknown>>();
  public readonly renames: Array<{ from: string; to: string }> = [];
  public readonly trashed: string[] = [];
  public readonly opened: string[] = [];
  public readonly app: App;

  public constructor(public readonly vaultName = "Vault") {
    const vault = {
      adapter: { exists: async (path: string) => this.files.has(normalize(path)) },
      configDir: ".obsidian",
      getAbstractFileByPath: (path: string) => this.files.get(normalize(path)) ?? null,
      getAllLoadedFiles: () => [...this.files.values()],
      getMarkdownFiles: () => [...this.files.values()].filter((entry): entry is TFile =>
        entry instanceof TFile && entry.extension.toLocaleLowerCase() === "md"),
      getName: () => this.vaultName,
      getRoot: () => this.root,
      createFolder: async (path: string) => this.addFolder(path),
      create: async (path: string, source: string) => this.addFile(path, source),
      read: async (file: TFile) => this.contents.get(file.path) ?? "",
      cachedRead: async (file: TFile) => this.contents.get(file.path) ?? "",
      modify: async (file: TFile, source: string) => {
        this.contents.set(file.path, source);
        this.frontmatters.set(file.path, parseFrontmatter(source));
      },
      process: async (file: TFile, update: (source: string) => string) => {
        const next = update(this.contents.get(file.path) ?? "");
        this.contents.set(file.path, next);
        this.frontmatters.set(file.path, parseFrontmatter(next));
        return next;
      },
      append: async (file: TFile, source: string) => {
        const next = (this.contents.get(file.path) ?? "") + source;
        this.contents.set(file.path, next);
        this.frontmatters.set(file.path, parseFrontmatter(next));
      },
    };
    const fileManager = {
      renameFile: async (entry: TAbstractFile, nextPath: string) => this.rename(entry, nextPath),
      trashFile: async (entry: TAbstractFile) => this.trash(entry),
      processFrontMatter: async (file: TFile, update: (frontmatter: Record<string, unknown>) => void) => {
        const value = structuredClone(this.frontmatters.get(file.path) ?? {});
        update(value);
        this.frontmatters.set(file.path, value);
      },
    };
    this.app = {
      fileManager,
      metadataCache: {
        getFileCache: (file: TFile) => ({ frontmatter: this.frontmatters.get(file.path) }),
        resolvedLinks: {},
      },
      vault,
      workspace: {
        getLeaf: () => ({ openFile: async (file: TFile) => { this.opened.push(file.path); } }),
        getLeavesOfType: () => [],
      },
    } as unknown as App;
  }

  public addFolder(rawPath: string): TFolder {
    const path = normalize(rawPath);
    const existing = this.files.get(path);
    if (existing instanceof TFolder) return existing;
    if (existing !== undefined) throw new Error(`Path exists: ${path}`);
    const parent = this.requireFolder(parentPath(path));
    const created = folder(path, parent);
    parent.children.push(created);
    this.files.set(path, created);
    return created;
  }

  public addFile(rawPath: string, source = "", frontmatter: Record<string, unknown> = {}): TFile {
    const path = normalize(rawPath);
    if (this.files.has(path)) throw new Error(`Path exists: ${path}`);
    const parent = this.requireFolder(parentPath(path));
    const created = file(path, parent);
    parent.children.push(created);
    this.files.set(path, created);
    this.contents.set(path, source);
    this.frontmatters.set(path, structuredClone(frontmatter));
    return created;
  }

  public remove(rawPath: string): void {
    const entry = this.files.get(normalize(rawPath));
    if (entry !== undefined) this.removeEntry(entry);
  }

  public requireFolder(rawPath: string): TFolder {
    const entry = this.files.get(normalize(rawPath));
    if (!(entry instanceof TFolder)) throw new Error(`Missing folder: ${rawPath}`);
    return entry;
  }

  public requireFile(rawPath: string): TFile {
    const entry = this.files.get(normalize(rawPath));
    if (!(entry instanceof TFile)) throw new Error(`Missing file: ${rawPath}`);
    return entry;
  }

  public async rename(entry: TAbstractFile, rawNextPath: string): Promise<void> {
    const nextPath = normalize(rawNextPath);
    const from = entry.path;
    if (this.files.has(nextPath)) throw new Error(`Path exists: ${nextPath}`);
    const nextParent = this.requireFolder(parentPath(nextPath));
    this.renames.push({ from, to: nextPath });
    entry.parent?.children.splice(entry.parent.children.indexOf(entry), 1);
    nextParent.children.push(entry);
    entry.parent = nextParent;
    const affected = [...this.files.entries()].filter(([path]) => path === from || path.startsWith(`${from}/`)).sort(([a], [b]) => a.length - b.length);
    for (const [path] of affected) this.files.delete(path);
    for (const [path, current] of affected) {
      const target = path === from ? nextPath : `${nextPath}${path.slice(from.length)}`;
      const source = this.contents.get(path);
      const frontmatter = this.frontmatters.get(path);
      this.contents.delete(path);
      this.frontmatters.delete(path);
      setPath(current, target);
      this.files.set(target, current);
      if (source !== undefined) this.contents.set(target, source);
      if (frontmatter !== undefined) this.frontmatters.set(target, frontmatter);
    }
  }

  private async trash(entry: TAbstractFile): Promise<void> {
    this.trashed.push(entry.path);
    this.removeEntry(entry);
  }

  private removeEntry(entry: TAbstractFile): void {
    if (entry instanceof TFolder) for (const child of [...entry.children]) this.removeEntry(child);
    entry.parent?.children.splice(entry.parent.children.indexOf(entry), 1);
    this.files.delete(entry.path);
    this.contents.delete(entry.path);
    this.frontmatters.delete(entry.path);
  }
}

function normalize(path: string): string { return path.replaceAll("\\", "/").replace(/^\/+|\/+$/gu, "").replace(/\/{2,}/gu, "/"); }
function parentPath(path: string): string { const index = path.lastIndexOf("/"); return index < 0 ? "" : path.slice(0, index); }
function leafName(path: string): string { return path.slice(path.lastIndexOf("/") + 1); }

function folder(path: string, parent: TFolder | null = null): TFolder {
  return Object.assign(new TFolder(), { children: [], name: leafName(path), parent, path });
}

function file(path: string, parent: TFolder): TFile {
  const name = leafName(path);
  const dot = name.lastIndexOf(".");
  return Object.assign(new TFile(), {
    basename: dot < 0 ? name : name.slice(0, dot),
    extension: dot < 0 ? "" : name.slice(dot + 1),
    name,
    parent,
    path,
    stat: { ctime: 0, mtime: 0, size: 0 },
  });
}

function setPath(entry: TAbstractFile, path: string): void {
  entry.path = path;
  entry.name = leafName(path);
  if (entry instanceof TFile) {
    const dot = entry.name.lastIndexOf(".");
    entry.basename = dot < 0 ? entry.name : entry.name.slice(0, dot);
    entry.extension = dot < 0 ? "" : entry.name.slice(dot + 1);
  }
}

function parseFrontmatter(source: string): Record<string, unknown> {
  if (!source.startsWith("---\n")) return {};
  const end = source.indexOf("\n---\n", 4);
  if (end < 0) return {};
  const result: Record<string, unknown> = {};
  const lines = source.slice(4, end).split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const separator = line.indexOf(":");
    if (separator < 0) continue;
    const key = line.slice(0, separator).trim();
    const raw = line.slice(separator + 1).trim();
    if (raw === "" && /^\S/u.test(line)) {
      const values: unknown[] = [];
      while (/^\s+-\s+/u.test(lines[index + 1] ?? "")) {
        index += 1;
        const item = (lines[index] ?? "").replace(/^\s+-\s+/u, "");
        try { values.push(JSON.parse(item)); }
        catch { values.push(item); }
      }
      result[key] = values;
      continue;
    }
    if (/^\d+$/u.test(raw)) result[key] = Number(raw);
    else {
      try { result[key] = JSON.parse(raw); }
      catch { result[key] = raw; }
    }
  }
  return result;
}
