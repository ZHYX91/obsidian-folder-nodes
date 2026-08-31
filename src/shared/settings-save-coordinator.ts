export type SettingsSaveState = "saved" | "saving" | "pending";

interface PendingSave<T> {
  readonly generation: number;
  readonly snapshot: T;
}

export class SettingsSaveCoordinator<T> {
  private tail: Promise<void> = Promise.resolve();
  private latestRequestedGeneration = 0;
  private pendingSave: PendingSave<T> | null = null;
  private state: SettingsSaveState = "saved";

  public constructor(
    private readonly persist: (snapshot: T) => Promise<void>,
    private readonly onStateChange: (state: SettingsSaveState) => void = () => undefined,
  ) {}

  public save(value: T): Promise<void> {
    const snapshot = structuredClone(value);
    const generation = ++this.latestRequestedGeneration;
    this.setState("saving");
    const operation = this.tail.then(async () => {
      try {
        await this.persist(snapshot);
        if (this.pendingSave !== null && this.pendingSave.generation <= generation) {
          this.pendingSave = null;
        }
        this.setState(generation === this.latestRequestedGeneration ? "saved" : "saving");
      } catch (error) {
        if (generation === this.latestRequestedGeneration) {
          this.pendingSave = { generation, snapshot };
          this.setState("pending");
        } else {
          this.setState("saving");
        }
        throw error;
      }
    });
    this.tail = operation.then(() => undefined, () => undefined);
    return operation;
  }

  public retry(): Promise<void> {
    const pending = this.pendingSave;
    if (pending === null || pending.generation !== this.latestRequestedGeneration) {
      return Promise.resolve();
    }
    return this.save(pending.snapshot);
  }

  public flush(latest?: T): Promise<void> {
    if (latest !== undefined) return this.save(latest);
    return this.tail.then(() => this.retry());
  }

  public getState(): SettingsSaveState {
    return this.state;
  }

  private setState(state: SettingsSaveState): void {
    if (state === this.state) return;
    this.state = state;
    try {
      this.onStateChange(state);
    } catch {
      // A presentation observer cannot change persistence completion.
    }
  }
}
