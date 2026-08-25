import { describe, expect, it, vi } from "vitest";

import { runAdoptionMigration } from "../../src/app/migration-state";
import { DEFAULT_SETTINGS } from "../../src/shared/settings";

describe("runAdoptionMigration", () => {
  it("restores the prior in-memory state when entering migrating cannot be saved", async () => {
    const settings = structuredClone(DEFAULT_SETTINGS);
    settings.adoptionState = "unadopted";
    const persist = vi.fn().mockRejectedValueOnce(new Error("disk full"));
    const migrate = vi.fn();

    await expect(runAdoptionMigration(settings, persist, migrate)).rejects.toThrow("disk full");

    expect(settings.adoptionState).toBe("unadopted");
    expect(persist).toHaveBeenCalledOnce();
    expect(migrate).not.toHaveBeenCalled();
  });

  it("persists managed state after a successful migration", async () => {
    const settings = structuredClone(DEFAULT_SETTINGS);
    settings.adoptionState = "unadopted";
    const persist = vi.fn(async () => undefined);
    const migrate = vi.fn(async () => undefined);

    await runAdoptionMigration(settings, persist, migrate);

    expect(settings.adoptionState).toBe("managed");
    expect(persist).toHaveBeenCalledTimes(2);
    expect(migrate).toHaveBeenCalledOnce();
  });

  it("restores and persists the prior state after migration fails", async () => {
    const settings = structuredClone(DEFAULT_SETTINGS);
    settings.adoptionState = "managed";
    const persist = vi.fn(async () => undefined);
    const migrate = vi.fn().mockRejectedValueOnce(new Error("cancelled"));

    await expect(runAdoptionMigration(settings, persist, migrate)).rejects.toThrow("cancelled");

    expect(settings.adoptionState).toBe("managed");
    expect(persist).toHaveBeenCalledTimes(2);
  });
});
