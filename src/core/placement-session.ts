import type { PlacementIntent } from "./placement";

/** A drag owns objects as well as paths; a replacement at the same path is not its target. */
export class PlacementSession<T extends { path: string }> {
  private source: T | null = null;
  private sourcePath = "";
  private intent: PlacementIntent | null = null;
  private bindings: Array<{ path: string; entry: T }> = [];

  public constructor(private readonly resolve: (path: string) => T | null) {}

  public start(source: T): void {
    this.clear();
    this.source = source;
    this.sourcePath = source.path;
  }

  public preview(intent: PlacementIntent): boolean {
    this.intent = null;
    this.bindings = [];
    if (this.source === null || this.resolve(this.sourcePath) !== this.source || this.source.path !== this.sourcePath) return false;
    const paths = intent.kind === "move-into" ? [intent.parentPath]
      : [intent.gap.parentPath, intent.gap.previousSiblingPath, intent.gap.nextSiblingPath];
    for (const path of paths) {
      if (path === null) continue;
      const entry = this.resolve(path);
      if (entry === null) return false;
      this.bindings.push({ path, entry });
    }
    this.intent = structuredClone(intent);
    return true;
  }

  public commit(intent: PlacementIntent): { source: T; intent: PlacementIntent } | null {
    if (this.source === null || this.intent === null || JSON.stringify(intent) !== JSON.stringify(this.intent)) return null;
    if (this.resolve(this.sourcePath) !== this.source || this.source.path !== this.sourcePath) return null;
    if (this.bindings.some(({ path, entry }) => this.resolve(path) !== entry || entry.path !== path)) return null;
    return { source: this.source, intent: this.intent };
  }

  public clear(): void {
    this.source = null;
    this.intent = null;
    this.bindings = [];
  }
}
