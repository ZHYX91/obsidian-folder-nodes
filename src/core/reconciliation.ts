export function shouldCreateReconciledNote(cacheExists: boolean, diskExists: boolean): boolean {
  return !cacheExists && !diskExists;
}

export type FolderRenameReconciliation = "create-canonical" | "none" | "rename-stale";

export function folderRenameReconciliation(canonicalExists: boolean, staleExists: boolean): FolderRenameReconciliation {
  if (canonicalExists) return "none";
  return staleExists ? "rename-stale" : "create-canonical";
}
