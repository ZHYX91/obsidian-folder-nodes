export interface RefreshBatch {
  full: boolean;
  paths: ReadonlySet<string>;
}

export class RefreshScheduler {
  private timer: number | null = null;
  private full = false;
  private readonly paths = new Set<string>();

  public constructor(
    private readonly run: (batch: RefreshBatch) => void,
    private readonly delayMs = 100,
    private readonly schedule: (callback: () => void, delay: number) => number = (callback, delay) => window.setTimeout(callback, delay),
    private readonly cancelSchedule: (timer: number) => void = (timer) => window.clearTimeout(timer),
  ) {}

  public request(path?: string): void {
    if (path === undefined) {
      this.full = true;
      this.paths.clear();
    } else if (!this.full) this.paths.add(path);
    if (this.timer !== null) return;
    this.timer = this.schedule(() => this.flush(), this.delayMs);
  }

  public flush(): void {
    if (this.timer !== null) this.cancelSchedule(this.timer);
    this.timer = null;
    if (!this.full && this.paths.size === 0) return;
    const batch = { full: this.full, paths: new Set(this.paths) };
    this.full = false;
    this.paths.clear();
    this.run(batch);
  }

  public cancel(): void {
    if (this.timer !== null) this.cancelSchedule(this.timer);
    this.timer = null;
    this.full = false;
    this.paths.clear();
  }
}
