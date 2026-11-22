import { isSameVaultName, normalizeVaultPath } from "./paths";

interface NameEntry<T> {
  readonly name: string;
  value: T;
}

function siblingKey(path: string): { key: string; name: string } {
  const normalized = normalizeVaultPath(path);
  const start = normalized.lastIndexOf("/") + 1;
  const name = normalized.slice(start);
  // Keep the physical parent exact. This coarse bucket can contain distinct names such as SS and ß.
  const key = normalized.slice(0, start) + name.normalize("NFC").toLowerCase().toUpperCase();
  return { key, name };
}

export class SiblingPathIndex<T> {
  private readonly buckets = new Map<string, NameEntry<T>[]>();

  public constructor(entries: Iterable<readonly [string, T]> = []) {
    for (const [path, value] of entries) this.set(path, value);
  }

  public get(path: string): T | undefined { return this.find(path)?.value; }
  public has(path: string): boolean { return this.find(path) !== undefined; }

  public set(path: string, value: T): this {
    const { key, name } = siblingKey(path);
    const bucket = this.buckets.get(key);
    if (bucket === undefined) this.buckets.set(key, [{ name, value }]);
    else {
      const existing = bucket.find((entry) => isSameVaultName(entry.name, name));
      if (existing === undefined) bucket.push({ name, value });
      else existing.value = value;
    }
    return this;
  }

  public *values(): IterableIterator<T> {
    for (const bucket of this.buckets.values()) {
      for (const entry of bucket) yield entry.value;
    }
  }

  private find(path: string): NameEntry<T> | undefined {
    const { key, name } = siblingKey(path);
    return this.buckets.get(key)?.find((entry) => isSameVaultName(entry.name, name));
  }
}
