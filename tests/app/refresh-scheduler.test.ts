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
    expect(run.mock.calls[0]?.[0].pathReasons.size).toBe(10_000);
    expect(run.mock.calls[0]?.[0].reasons).toEqual(new Set(["path"]));
  });

  it("retains targeted invalidations inside a full visual refresh", () => {
    const callbacks: Array<() => void> = [];
    const run = vi.fn();
    const scheduler = new RefreshScheduler(run, 100, (callback) => { callbacks.push(callback); return 1; }, () => undefined);
    scheduler.request("A/A.md");
    scheduler.request();
    callbacks[0]?.();
    expect(run.mock.calls[0]?.[0].full).toBe(true);
    expect(run.mock.calls[0]?.[0].pathReasons).toEqual(new Map([["A/A.md", new Set(["path"])]]));
    expect(run.mock.calls[0]?.[0].paths).toEqual(new Set(["A/A.md"]));
    expect(run.mock.calls[0]?.[0].reasons).toEqual(new Set(["path", "full"]));
  });

  it("keeps active-leaf UI refreshes distinguishable from graph data refreshes", () => {
    const callbacks: Array<() => void> = [];
    const run = vi.fn();
    const scheduler = new RefreshScheduler(run, 100, (callback) => { callbacks.push(callback); return 1; }, () => undefined);
    scheduler.request(undefined, "active-leaf");
    callbacks[0]?.();
    expect(run).toHaveBeenCalledWith({
      full: true,
      pathReasons: new Map(),
      paths: new Set(),
      reasons: new Set(["active-leaf"]),
    });
  });

  it("retains per-path metadata and structural reasons in one batch", () => {
    const callbacks: Array<() => void> = [];
    const run = vi.fn();
    const scheduler = new RefreshScheduler(run, 100, (callback) => { callbacks.push(callback); return 1; }, () => undefined);
    scheduler.request("A/A.md", "metadata");
    scheduler.request("A/A.md", "path");
    scheduler.request("B/B.md", "reference");
    callbacks[0]?.();
    expect(run.mock.calls[0]?.[0].pathReasons).toEqual(new Map([
      ["A/A.md", new Set(["metadata", "path"])],
      ["B/B.md", new Set(["reference"])],
    ]));
  });
});
