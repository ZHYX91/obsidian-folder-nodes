import { describe, expect, it, vi } from "vitest";

import { RefreshScheduler } from "../../src/app/refresh-scheduler";

describe("RefreshScheduler", () => {
  it("coalesces an event storm into one bounded refresh", () => {
    const callbacks: Array<() => void> = [];
    const run = vi.fn();
    const scheduler = new RefreshScheduler(run, 100, (callback) => {
      callbacks.push(callback);
      return callbacks.length;
    }, () => undefined);
    for (let index = 0; index < 10_000; index += 1) scheduler.request(`Folder/${index}.md`);
    expect(callbacks).toHaveLength(1);
    callbacks[0]?.();
    expect(run).toHaveBeenCalledTimes(1);
    expect(run.mock.calls[0]?.[0].paths.size).toBe(10_000);
  });

  it("lets a full refresh supersede targeted paths", () => {
    const callbacks: Array<() => void> = [];
    const run = vi.fn();
    const scheduler = new RefreshScheduler(run, 100, (callback) => { callbacks.push(callback); return 1; }, () => undefined);
    scheduler.request("A/A.md");
    scheduler.request();
    callbacks[0]?.();
    expect(run.mock.calls[0]?.[0].full).toBe(true);
  });
});
