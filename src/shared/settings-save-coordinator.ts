export type SettingsSaveState = "saved" | "saving" | "pending";

interface PendingSave<T> {
  readonly generation: number;
  readonly snapshot: T;
}

class SettingsStorageQueue {
  private tail: Promise<void> = Promise.resolve();

  public run<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.tail.then(operation);
    this.tail = result.then(() => undefined, () => undefined);
    return result;
  }
}

const STORAGE_QUEUES = Symbol.for("folder-nodes.settings-storage-queues");
type SettingsStorageOwner = object & { [STORAGE_QUEUES]?: Map<string, SettingsStorageQueue> };

export function getSettingsStorageQueue(owner: object, pluginId: string): SettingsStorageQueue {
  let queues = (owner as SettingsStorageOwner)[STORAGE_QUEUES];
  if (queues === undefined) {
    queues = new Map();
    // The host outlives plugin instances and module reloads; keep this registry off serialized data.
    Object.defineProperty(owner, STORAGE_QUEUES, { value: queues });
  }
  let queue = queues.get(pluginId);
  if (queue === undefined) {
    queue = new SettingsStorageQueue();
    queues.set(pluginId, queue);
  }
  return queue;
}

export class SettingsSaveCoordinator<T> {
  private latestRequestedGeneration = 0;
  private pendingSave: PendingSave<T> | null = null;
  private state: SettingsSaveState = "saved";
  private closed = false;

  public constructor(
    private readonly persist: (snapshot: T) => Promise<void>,
    private readonly onStateChange: (state: SettingsSaveState) => void = () => undefined,
    private readonly queue = new SettingsStorageQueue(),
  ) {}

  public save(value: T): Promise<void> {
    if (this.closed) return Promise.reject(new Error("Settings persistence is closed."));
    const snapshot = structuredClone(value);
    const generation = ++this.latestRequestedGeneration;
    this.setState("saving");
    return this.queue.run(() => this.persistSnapshot(snapshot, generation));
  }

  public retry(): Promise<void> {
    if (this.closed) return Promise.reject(new Error("Settings persistence is closed."));
    const pending = this.pendingSave;
    if (pending === null || pending.generation !== this.latestRequestedGeneration) {
      return Promise.resolve();
    }
    return this.save(pending.snapshot);
  }

  public flush(latest?: T): Promise<void> {
    if (this.closed) return Promise.reject(new Error("Settings persistence is closed."));
    if (latest !== undefined) return this.save(latest);
    return this.queue.run(async () => {
      const pending = this.pendingSave;
      if (pending === null || pending.generation !== this.latestRequestedGeneration) return;
      this.setState("saving");
      await this.persistSnapshot(pending.snapshot, ++this.latestRequestedGeneration);
    });
  }

  public close(): void {
    this.closed = true;
  }

  public getState(): SettingsSaveState {
    return this.state;
  }

  private async persistSnapshot(snapshot: T, generation: number): Promise<void> {
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
