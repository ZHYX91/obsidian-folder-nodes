import { App, TAbstractFile, TFile, TFolder } from "obsidian";
import { parseDocument, stringify } from "yaml";

type FakeWrite = "create" | "modify" | "process" | "append" | "frontmatter" | "rename" | "trash";
interface FakeObsidianOptions {
  readonly metadataUpdates?: "immediate" | "deferred";
  readonly modifyEvents?: "immediate" | "deferred";
}

/**
 * A focused Vault/FileManager contract, not an Obsidian host. Source writes,
 * metadata refreshes and modify notifications are separate observable steps.
 * Normal fixtures derive caches from YAML; explicit cache overrides support
 * cache-only read scenarios and lag tests. Deferred modes model asynchronous
 * refreshes and notifications. failNext() fails before a mutation.
 */

export class FakeObsidian {
  public readonly root = folder("");
  public readonly files = new Map<string, TAbstractFile>([["", this.root]]);
  public readonly contents = new Map<string, string>();
  public readonly frontmatters = new Map<string, Record<string, unknown>>();
  public readonly renames: Array<{ from: string; to: string }> = [];
  public readonly trashed: string[] = [];
  public readonly opened: string[] = [];
  public readonly modifyListeners = new Set<(file: TFile) => void>();
  public readonly metadataListeners = new Set<(file: TFile, source: string, cache: { frontmatter: Record<string, unknown> }) => void>();
  public readonly app: App;
  private readonly pendingMetadata = new Set<TFile>();
  private readonly pendingModifyEvents: TFile[] = [];
  private readonly failures = new Map<FakeWrite, Error[]>();

  public constructor(public readonly vaultName = "Vault", private readonly options: FakeObsidianOptions = {}) {
    const vault = {
      on: (event: string, callback: (file: TFile) => void) => {
        if (event !== "modify") throw new Error(`Unsupported fake Vault event: ${event}`);
        this.modifyListeners.add(callback);
        return callback;
      },
      offref: (callback: (file: TFile) => void) => { this.modifyListeners.delete(callback); },
      adapter: { exists: async (path: string) => this.files.has(normalize(path)) },
      configDir: ".obsidian",
      getAbstractFileByPath: (path: string) => this.files.get(normalize(path)) ?? null,
      getAllLoadedFiles: () => [...this.files.values()],
      getMarkdownFiles: () => [...this.files.values()].filter((entry): entry is TFile =>
        entry instanceof TFile && entry.extension.toLocaleLowerCase() === "md"),
      getName: () => this.vaultName,
      getRoot: () => this.root,
      createFolder: async (path: string) => this.addFolder(path),
      create: async (path: string, source: string) => { this.failIfRequested("create"); return this.addFile(path, source); },
      read: async (file: TFile) => this.contents.get(file.path) ?? "",
      cachedRead: async (file: TFile) => this.contents.get(file.path) ?? "",
      modify: async (file: TFile, source: string) => {
        this.failIfRequested("modify");
        this.writeSource(file, source);
      },
      process: async (file: TFile, update: (source: string) => string) => {
        this.failIfRequested("process");
        const next = update(this.contents.get(file.path) ?? "");
        this.writeSource(file, next);
        return next;
      },
      append: async (file: TFile, source: string) => {
        this.failIfRequested("append");
        const next = (this.contents.get(file.path) ?? "") + source;
        this.writeSource(file, next);
      },
    };
    const fileManager = {
      renameFile: async (entry: TAbstractFile, nextPath: string) => this.rename(entry, nextPath),
      trashFile: async (entry: TAbstractFile) => this.trash(entry),
      processFrontMatter: async (file: TFile, update: (frontmatter: Record<string, unknown>) => void) => {
        this.failIfRequested("frontmatter");
        const source = this.contents.get(file.path) ?? "";
        const value = parseFrontmatter(source, true);
        update(value);
        this.writeSource(file, replaceFrontmatter(source, value));
      },
    };
    this.app = {
      fileManager,
      metadataCache: {
        on: (event: string, callback: (file: TFile, source: string, cache: { frontmatter: Record<string, unknown> }) => void) => {
          if (event !== "changed") throw new Error(`Unsupported fake metadata event: ${event}`);
          this.metadataListeners.add(callback);
          return callback;
        },
        offref: (callback: (file: TFile, source: string, cache: { frontmatter: Record<string, unknown> }) => void) => { this.metadataListeners.delete(callback); },
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

  /** A supplied cache is intentionally independent of source for cache-only or lag fixtures. */
  public addFile(rawPath: string, source = "", frontmatter?: Record<string, unknown>): TFile {
    const path = normalize(rawPath);
    if (this.files.has(path)) throw new Error(`Path exists: ${path}`);
    const parent = this.requireFolder(parentPath(path));
    const created = file(path, parent);
    parent.children.push(created);
    this.files.set(path, created);
    this.contents.set(path, source);
    this.frontmatters.set(path, frontmatter === undefined ? parseFrontmatter(source) : structuredClone(frontmatter));
    return created;
  }

  public failNext(operation: FakeWrite, error = new Error(`Fake ${operation} failed`)): void {
    const failures = this.failures.get(operation) ?? [];
    failures.push(error);
    this.failures.set(operation, failures);
  }

  public flushMetadata(): void {
    for (const file of this.pendingMetadata) this.refreshMetadata(file);
  }

  public refreshMetadata(file: TFile): void {
    this.pendingMetadata.delete(file);
    if (this.files.get(file.path) !== file) return;
    const source = this.contents.get(file.path) ?? "";
    const frontmatter = parseFrontmatter(source);
    this.frontmatters.set(file.path, frontmatter);
    for (const callback of this.metadataListeners) callback(file, source, { frontmatter });
  }

  public flushModifyEvents(): void {
    for (const file of this.pendingModifyEvents.splice(0)) {
      if (this.files.get(file.path) === file) for (const callback of this.modifyListeners) callback(file);
    }
  }

  private writeSource(file: TFile, source: string): void {
    if (this.files.get(file.path) !== file) throw new Error(`File identity changed: ${file.path}`);
    this.contents.set(file.path, source);
    if (this.options.metadataUpdates === "deferred") this.pendingMetadata.add(file);
    else this.refreshMetadata(file);
    if (this.options.modifyEvents === "deferred") this.pendingModifyEvents.push(file);
    else for (const callback of this.modifyListeners) callback(file);
  }

  private failIfRequested(operation: FakeWrite): void {
    const error = this.failures.get(operation)?.shift();
    if (error !== undefined) throw error;
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
    this.failIfRequested("rename");
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
    this.failIfRequested("trash");
    this.trashed.push(entry.path);
    this.removeEntry(entry);
  }

  private removeEntry(entry: TAbstractFile): void {
    if (entry instanceof TFolder) for (const child of [...entry.children]) this.removeEntry(child);
    entry.parent?.children.splice(entry.parent.children.indexOf(entry), 1);
    this.files.delete(entry.path);
    this.contents.delete(entry.path);
    this.frontmatters.delete(entry.path);
    if (entry instanceof TFile) this.pendingMetadata.delete(entry);
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

function parseFrontmatter(source: string, strict = false): Record<string, unknown> {
  const match = frontmatterBounds(source);
  if (match === null) return {};
  const document = parseDocument(match[1] ?? "");
  if (document.errors.length > 0) {
    if (strict) throw new Error("Invalid YAML in frontmatter write");
    return {};
  }
  const data: unknown = document.toJS();
  if (data !== null && typeof data === "object" && !Array.isArray(data)) return data as Record<string, unknown>;
  if (strict && data !== null) throw new Error("Frontmatter write requires a mapping");
  return {};
}

function frontmatterBounds(source: string): RegExpExecArray | null {
  const match = /^(?:\uFEFF)?---[ \t]*\r?\n([\s\S]*?)^(?:---|\.\.\.)[ \t]*(?=\r?\n|$)/mu.exec(source);
  return match?.index === 0 ? match : null;
}

function replaceFrontmatter(source: string, value: Record<string, unknown>): string {
  const bounds = frontmatterBounds(source);
  const bom = source.startsWith("\uFEFF") ? "\uFEFF" : "";
  const eol = source.includes("\r\n") ? "\r\n" : "\n";
  const body = bounds === null ? source.slice(bom.length) : source.slice(bounds[0].length).replace(/^\r?\n/u, "");
  const yaml = Object.keys(value).length === 0 ? "" : stringify(value).replaceAll("\n", eol);
  return `${bom}---${eol}${yaml}---${eol}${body}`;
}
