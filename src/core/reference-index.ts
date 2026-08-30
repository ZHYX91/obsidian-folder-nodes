import { normalizeVaultPath } from "./paths";

type ResolvedLinks = Readonly<Record<string, Readonly<Record<string, number>>>>;

export class ReferenceIndex {
  private readonly counts = new Map<string, number>();
  private readonly incomingSources = new Map<string, Set<string>>();
  private readonly sources = new Map<string, Map<string, number>>();

  public rebuild(resolvedLinks: ResolvedLinks): void {
    this.counts.clear();
    this.incomingSources.clear();
    this.sources.clear();
    for (const [source, targets] of Object.entries(resolvedLinks)) this.updateSource(source, targets);
  }

  public updateSource(sourcePath: string, targets: Readonly<Record<string, number>>): Set<string> {
    const source = normalizeVaultPath(sourcePath);
    const affected = new Set<string>();
    const previous = this.sources.get(source);
    if (previous !== undefined) {
      for (const [path, count] of previous) {
        affected.add(path);
        this.adjust(path, -count);
        const incoming = this.incomingSources.get(path);
        incoming?.delete(source);
        if (incoming?.size === 0) this.incomingSources.delete(path);
      }
    }
    const next = new Map<string, number>();
    for (const [rawPath, rawCount] of Object.entries(targets)) {
      if (!Number.isFinite(rawCount) || rawCount <= 0) continue;
      const path = normalizeVaultPath(rawPath);
      next.set(path, rawCount);
      affected.add(path);
      this.adjust(path, rawCount);
      const incoming = this.incomingSources.get(path) ?? new Set<string>();
      incoming.add(source);
      this.incomingSources.set(path, incoming);
    }
    if (next.size === 0) this.sources.delete(source);
    else this.sources.set(source, next);
    return affected;
  }

  public removeSource(sourcePath: string): Set<string> { return this.updateSource(sourcePath, {}); }
  public isReferenced(path: string): boolean { return (this.counts.get(normalizeVaultPath(path)) ?? 0) > 0; }
  public targetsForSource(path: string): readonly string[] {
    return [...(this.sources.get(normalizeVaultPath(path))?.keys() ?? [])];
  }
  public sourcesForTarget(path: string): readonly string[] {
    return [...(this.incomingSources.get(normalizeVaultPath(path)) ?? [])];
  }

  private adjust(path: string, delta: number): void {
    const next = (this.counts.get(path) ?? 0) + delta;
    if (next > 0) this.counts.set(path, next);
    else this.counts.delete(path);
  }
}
