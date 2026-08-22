export function shouldCreateReconciledNote(cacheExists: boolean, diskExists: boolean): boolean {
  return !cacheExists && !diskExists;
}
