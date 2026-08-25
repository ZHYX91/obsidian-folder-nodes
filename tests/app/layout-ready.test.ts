import { describe, expect, it } from "vitest";

import { onLayoutReadyOnce } from "../../src/app/layout-ready";

describe("onLayoutReadyOnce", () => {
  it("runs immediately exactly once when layout is already ready", () => {
    let count = 0;
    onLayoutReadyOnce(
      { layoutReady: true, onLayoutReady: (callback) => callback() },
      () => { count += 1; },
    );
    expect(count).toBe(1);
  });

  it("runs later when registration happens before layout readiness", () => {
    const queued: Array<() => void> = [];
    const host = {
      layoutReady: false,
      onLayoutReady: (callback: () => void) => { queued.push(callback); },
    };
    let count = 0;

    onLayoutReadyOnce(host, () => { count += 1; });
    expect(count).toBe(0);
    host.layoutReady = true;
    queued[0]?.();
    expect(count).toBe(1);
  });

  it("closes the host race when layout becomes ready during registration", () => {
    const queued: Array<() => void> = [];
    const host = {
      layoutReady: false,
      onLayoutReady: (callback: () => void) => {
        queued.push(callback);
        host.layoutReady = true;
      },
    };
    let count = 0;

    onLayoutReadyOnce(host, () => { count += 1; });
    expect(count).toBe(1);
    queued[0]?.();
    expect(count).toBe(1);
  });

  it("closes the host race when readiness is finalized after callback registration", async () => {
    const queued: Array<() => void> = [];
    const host = {
      layoutReady: false,
      onLayoutReady: (callback: () => void) => { queued.push(callback); },
    };
    let count = 0;

    onLayoutReadyOnce(host, () => { count += 1; });
    host.layoutReady = true;
    await Promise.resolve();

    expect(count).toBe(1);
    queued[0]?.();
    expect(count).toBe(1);
  });
});
