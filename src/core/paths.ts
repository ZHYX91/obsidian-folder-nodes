const WINDOWS_FORBIDDEN = /[<>:"/\\|?*]/gu;
const TRAILING_DOTS_OR_SPACES = /[. ]+$/u;
const MULTIPLE_SPACES = /\s+/gu;

export function normalizeVaultPath(path: string): string {
  return path.replaceAll("\\", "/").replace(/^\/+|\/+$/gu, "").replace(/\/{2,}/gu, "/");
}

export function basename(path: string): string {
  const normalized = normalizeVaultPath(path);
  return normalized.slice(normalized.lastIndexOf("/") + 1);
}

export function dirname(path: string): string {
  const normalized = normalizeVaultPath(path);
  const index = normalized.lastIndexOf("/");
  return index < 0 ? "" : normalized.slice(0, index);
}

export function nodeNotePath(folderPath: string): string {
  const normalized = normalizeVaultPath(folderPath);
  const name = basename(normalized);
  return normalized.length === 0 ? "" : `${normalized}/${name}.md`;
}

export function isCanonicalNodeNote(notePath: string): boolean {
  const normalized = normalizeVaultPath(notePath);
  if (!normalized.toLocaleLowerCase().endsWith(".md")) return false;
  const folder = dirname(normalized);
  if (folder.length === 0) return false;
  return basename(folder) === basename(normalized).slice(0, -3);
}

export function sanitizeNodeName(input: string): string {
  const value = input
    .normalize("NFC")
    .replace(WINDOWS_FORBIDDEN, "-")
    .replace(MULTIPLE_SPACES, " ")
    .replace(TRAILING_DOTS_OR_SPACES, "")
    .trim();
  return value === "" ? "Untitled" : value.slice(0, 180);
}

export function isDescendantPath(candidate: string, ancestor: string): boolean {
  const child = normalizeVaultPath(candidate);
  const parent = normalizeVaultPath(ancestor);
  return child !== parent && child.startsWith(`${parent}/`);
}
