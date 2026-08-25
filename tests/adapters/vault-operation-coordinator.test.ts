import { afterEach, describe, expect, it, vi } from "vitest";

import { VaultOperationCoordinator } from "../../src/adapters/vault-operation-coordinator";

afterEach(() => vi.useRealTimers());

describe("VaultOperationCoordinator", () => {
  it("serializes operations even when an earlier operation rejects", async () => {
    const coordinator = new VaultOperationCoordinator();
    const order: number[] = [];
    const first = coordinator.run(async () => {
      order.push(1);
      throw new Error("expected");
    });
    const second = coordinator.run(async () => { order.push(2); });

    await expect(first).rejects.toThrow("expected");
    await second;
    expect(order).toEqual([1, 2]);
  });

  it("matches descendant events for a recursive rename and expires stale expectations", () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    const coordinator = new VaultOperationCoordinator();
    coordinator.expect("rename", "New", "Old", true);
    expect(coordinator.consume("rename", "New/Child.md", "Old/Child.md")).toBe(true);
    expect(coordinator.consume("rename", "New/Other.md", "Elsewhere/Other.md")).toBe(false);
    vi.advanceTimersByTime(2_000);
    expect(coordinator.consume("rename", "New", "Old")).toBe(false);
  });
});
