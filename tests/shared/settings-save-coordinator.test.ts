import { describe, expect, it, vi } from "vitest";

import { getSettingsStorageQueue, SettingsSaveCoordinator } from "../../src/shared/settings-save-coordinator";

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
    expect(coordinator.getState()).toBe("saving");
    settings.value = 2;
    const secondSave = coordinator.save(settings);
    settings.value = 3;

    await vi.waitFor(() => expect(persist).toHaveBeenCalledOnce());
    expect(persisted).toEqual([{ value: 1 }]);
    first.resolve();
    await Promise.all([firstSave, secondSave]);

    expect(persisted).toEqual([{ value: 1 }, { value: 2 }]);
    expect(coordinator.getState()).toBe("saved");
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
    expect(coordinator.getState()).toBe("saved");
  });

  it("retains the latest failed snapshot for an explicit retry", async () => {
    const persisted: Array<{ nested: { value: number } }> = [];
    const persist = vi.fn()
      .mockRejectedValueOnce(new Error("disk unavailable"))
      .mockImplementationOnce(async (snapshot) => { persisted.push(snapshot); });
    const states: string[] = [];
    const coordinator = new SettingsSaveCoordinator<{ nested: { value: number } }>(
      persist,
      (state) => states.push(state),
    );
    const value = { nested: { value: 7 } };

    await expect(coordinator.save(value)).rejects.toThrow("disk unavailable");
    value.nested.value = 99;
    expect(coordinator.getState()).toBe("pending");
    await coordinator.retry();

    expect(persisted).toEqual([{ nested: { value: 7 } }]);
    expect(coordinator.getState()).toBe("saved");
    expect(states).toEqual(["saving", "pending", "saving", "saved"]);
  });

  it("flushes one final latest snapshot after all earlier writes", async () => {
    const first = deferred();
    const persisted: Array<{ value: number }> = [];
    const coordinator = new SettingsSaveCoordinator<{ value: number }>(async (snapshot) => {
      persisted.push(snapshot);
      if (snapshot.value === 1) await first.promise;
    });

    const initial = coordinator.save({ value: 1 });
    const flushed = coordinator.flush({ value: 3 });
    await vi.waitFor(() => expect(persisted).toEqual([{ value: 1 }]));
    first.resolve();
    await Promise.all([initial, flushed]);

    expect(persisted).toEqual([{ value: 1 }, { value: 3 }]);
    expect(coordinator.getState()).toBe("saved");
  });

  it("flushes a retained pending snapshot when no newer value is supplied", async () => {
    const persist = vi.fn()
      .mockRejectedValueOnce(new Error("disk unavailable"))
      .mockResolvedValueOnce(undefined);
    const coordinator = new SettingsSaveCoordinator<{ value: number }>(persist);

    await expect(coordinator.save({ value: 4 })).rejects.toThrow("disk unavailable");
    await coordinator.flush();

    expect(persist).toHaveBeenNthCalledWith(2, { value: 4 });
    expect(coordinator.getState()).toBe("saved");
  });

  it("reserves an accepted retry flush before later reads and lets it settle after close", async () => {
    const first = deferred();
    const queue = getSettingsStorageQueue({}, "folder-nodes");
    let stored = 0;
    const persist = vi.fn()
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(async (snapshot: { value: number }) => { stored = snapshot.value; });
    const coordinator = new SettingsSaveCoordinator<{ value: number }>(persist, undefined, queue);
    const failed = expect(coordinator.save({ value: 7 })).rejects.toThrow("Disk unavailable");
    const flush = coordinator.flush();
    coordinator.close();
    const read = queue.run(async () => stored);
    first.reject(new Error("Disk unavailable"));

    await Promise.all([failed, flush]);
    await expect(read).resolves.toBe(7);
    await expect(coordinator.save({ value: 9 })).rejects.toThrow("closed");
    await expect(coordinator.retry()).rejects.toThrow("closed");
    await expect(coordinator.flush()).rejects.toThrow("closed");
    expect(persist).toHaveBeenCalledTimes(2);
    expect(coordinator.getState()).toBe("saved");
  });

  it("does not retry an older failed snapshot when a newer save was accepted after flush", async () => {
    const persist = vi.fn().mockRejectedValueOnce(new Error("Disk unavailable")).mockResolvedValue(undefined);
    const coordinator = new SettingsSaveCoordinator<{ value: number }>(persist);
    await expect(coordinator.save({ value: 1 })).rejects.toThrow("Disk unavailable");

    const flush = coordinator.flush();
    const latest = coordinator.save({ value: 2 });
    await Promise.all([flush, latest]);

    expect(persist.mock.calls).toEqual([[{ value: 1 }], [{ value: 2 }]]);
    expect(coordinator.getState()).toBe("saved");
  });
});
