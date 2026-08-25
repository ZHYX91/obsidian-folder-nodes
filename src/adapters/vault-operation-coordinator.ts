import { normalizeVaultPath } from "../core/paths";

const EXPECTED_EVENT_TTL_MS = 2_000;

export type VaultEventKind = "create" | "delete" | "rename";

interface ExpectedVaultEvent {
  expiresAt: number;
  kind: VaultEventKind;
  newPath: string;
  oldPath: string | null;
  recursive: boolean;
}

export class VaultOperationCoordinator {
  private operationTail: Promise<void> = Promise.resolve();
  private readonly expectedEvents: ExpectedVaultEvent[] = [];

  public run<T>(operation: () => Promise<T>): Promise<T> {
    const run = this.operationTail.then(operation, operation);
    this.operationTail = run.then(() => undefined, () => undefined);
    return run;
  }

  public expect(kind: VaultEventKind, newPath: string, oldPath: string | null = null, recursive = false): void {
    this.pruneExpiredEvents();
    this.expectedEvents.push({
      expiresAt: Date.now() + EXPECTED_EVENT_TTL_MS,
      kind,
      newPath: normalizeVaultPath(newPath),
      oldPath: oldPath === null ? null : normalizeVaultPath(oldPath),
      recursive,
    });
  }

  public consume(kind: VaultEventKind, newPath: string, oldPath: string | null = null): boolean {
    this.pruneExpiredEvents();
    const normalizedNew = normalizeVaultPath(newPath);
    const normalizedOld = oldPath === null ? null : normalizeVaultPath(oldPath);
    const index = this.expectedEvents.findIndex((expected) => this.matches(expected, kind, normalizedNew, normalizedOld));
    if (index < 0) return false;
    if (this.expectedEvents[index]?.recursive !== true) this.expectedEvents.splice(index, 1);
    return true;
  }

  private matches(expected: ExpectedVaultEvent, kind: VaultEventKind, newPath: string, oldPath: string | null): boolean {
    if (expected.kind !== kind) return false;
    if (!expected.recursive) return expected.newPath === newPath && expected.oldPath === oldPath;
    if (newPath !== expected.newPath && !newPath.startsWith(`${expected.newPath}/`)) return false;
    if (expected.oldPath === null) return oldPath === null;
    return oldPath !== null && (oldPath === expected.oldPath || oldPath.startsWith(`${expected.oldPath}/`));
  }

  private pruneExpiredEvents(): void {
    const now = Date.now();
    for (let index = this.expectedEvents.length - 1; index >= 0; index -= 1) {
      if ((this.expectedEvents[index]?.expiresAt ?? 0) <= now) this.expectedEvents.splice(index, 1);
    }
  }
}
