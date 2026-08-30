export type RefreshReason = "active-leaf" | "full" | "metadata" | "path" | "reference";

export interface RefreshBatch {
  full: boolean;
  pathReasons: ReadonlyMap<string, ReadonlySet<RefreshReason>>;
  paths: ReadonlySet<string>;
  reasons: ReadonlySet<RefreshReason>;
}

export class RefreshScheduler {
  private timer: number | null = null;
  private full = false;
  private readonly pathReasons = new Map<string, Set<RefreshReason>>();
  private readonly paths = new Set<string>();
  private readonly reasons = new Set<RefreshReason>();

  public constructor(
    private readonly run: (batch: RefreshBatch) => void,
    private readonly delayMs = 100,
    private readonly schedule: (callback: () => void, delay: number) => number = (callback, delay) => window.setTimeout(callback, delay),
    private readonly cancelSchedule: (timer: number) => void = (timer) => window.clearTimeout(timer),
  ) {}

  public request(path?: string, reason: RefreshReason = path === undefined ? "full" : "path"): void {
    this.reasons.add(reason);
    if (path === undefined) {
      this.full = true;
    } else {
      this.paths.add(path);
      const reasons = this.pathReasons.get(path) ?? new Set<RefreshReason>();
      reasons.add(reason);
      this.pathReasons.set(path, reasons);
    }
    if (this.timer !== null) return;
    this.timer = this.schedule(() => this.flush(), this.delayMs);
  }

  public flush(): void {
    if (this.timer !== null) this.cancelSchedule(this.timer);
    this.timer = null;
    if (!this.full && this.paths.size === 0) return;
    const batch = {
      full: this.full,
      pathReasons: new Map([...this.pathReasons].map(([path, reasons]) => [path, new Set(reasons)])),
      paths: new Set(this.paths),
      reasons: new Set(this.reasons),
    };
    this.full = false;
    this.pathReasons.clear();
    this.paths.clear();
    this.reasons.clear();
    this.run(batch);
  }

  public cancel(): void {
    if (this.timer !== null) this.cancelSchedule(this.timer);
    this.timer = null;
    this.full = false;
    this.pathReasons.clear();
    this.paths.clear();
    this.reasons.clear();
  }
}
