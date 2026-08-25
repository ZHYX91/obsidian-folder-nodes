import { describe, expect, it, vi } from "vitest";

import { SettingsSaveCoordinator } from "../../src/shared/settings-save-coordinator";

function deferred() {
  let reject!: (error: unknown) => void;
  let resolve!: () => void;
  const promise = new Promise<void>((resolvePromise, rejectPromise) => {
    reject = rejectPromise;
    resolve = resolvePromise;
  });
  return { promise, reject, resolve };
}

describe("SettingsSaveCoordinator", () => {
  it("captures immutable snapshots and serializes overlapping saves", async () => {
    const first = deferred();
    const persisted: Array<{ value: number }> = [];
    const persist = vi.fn(async (snapshot: { value: number }) => {
      persisted.push(snapshot);
      if (snapshot.value === 1) await first.promise;
    });
    const coordinator = new SettingsSaveCoordinator(persist);
    const settings = { value: 1 };

    const firstSave = coordinator.save(settings);
    settings.value = 2;
    const secondSave = coordinator.save(settings);
    settings.value = 3;

    await vi.waitFor(() => expect(persist).toHaveBeenCalledOnce());
    expect(persisted).toEqual([{ value: 1 }]);
    first.resolve();
    await Promise.all([firstSave, secondSave]);

    expect(persisted).toEqual([{ value: 1 }, { value: 2 }]);
  });

  it("continues with the latest queued snapshot after a failed save", async () => {
    const first = deferred();
    const persist = vi.fn()
      .mockImplementationOnce(() => first.promise)
      .mockResolvedValueOnce(undefined);
    const coordinator = new SettingsSaveCoordinator<{ value: number }>(persist);

    const failed = coordinator.save({ value: 1 });
    const next = coordinator.save({ value: 2 });
    first.reject(new Error("disk unavailable"));

    await expect(failed).rejects.toThrow("disk unavailable");
    await expect(next).resolves.toBeUndefined();
    expect(persist).toHaveBeenNthCalledWith(2, { value: 2 });
  });
});
