import { basename, normalizeVaultPath } from "./paths";

const PROTECTED_FOLDER_NAMES = new Set([".git", ".trash"]);

export function isProtectedFolderPath(path: string): boolean {
  return normalizeVaultPath(path).split("/").some((segment) => PROTECTED_FOLDER_NAMES.has(segment.toLocaleLowerCase()));
}

export function matchesFolderExemption(
  path: string,
  exactFolders: readonly string[],
  prefixes: readonly string[],
): boolean {
  const normalized = normalizeVaultPath(path);
  if (normalized === "") return false;
  if (isProtectedFolderPath(normalized)) return true;
  if (exactFolders.some((folder) => {
    const exact = normalizeVaultPath(folder);
    return exact !== "" && (normalized === exact || normalized.startsWith(`${exact}/`));
  })) return true;
  return normalized.split("/").some((segment) => prefixes.some((prefix) => prefix !== "" && segment.startsWith(prefix)));
}

export function matchesLeafNoteExemption(
  path: string,
  exactNotes: readonly string[],
  prefixes: readonly string[],
): boolean {
  const normalized = normalizeVaultPath(path);
  if (exactNotes.some((note) => normalizeVaultPath(note) === normalized)) return true;
  return prefixes.some((prefix) => prefix !== "" && basename(normalized).startsWith(prefix));
}
