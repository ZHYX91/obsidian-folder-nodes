import type { FolderNodesSettings } from "../core/types";

export async function runAdoptionMigration(
  settings: FolderNodesSettings,
  persist: () => Promise<void>,
  migrate: () => Promise<void>,
): Promise<void> {
  const previousState = settings.adoptionState;
  let migratingPersisted = false;
  try {
    settings.adoptionState = "migrating";
    await persist();
    migratingPersisted = true;
    await migrate();
    settings.adoptionState = "managed";
    await persist();
  } catch (error) {
    settings.adoptionState = previousState === "managed" ? "managed" : "unadopted";
    if (migratingPersisted) await persist();
    throw error;
  }
}
