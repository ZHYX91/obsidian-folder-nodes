const WINDOWS_FORBIDDEN = /[<>:"/\\|?*#[\]^]/gu;
const TRAILING_DOTS_OR_SPACES = /[. ]+$/u;
const MULTIPLE_SPACES = /\s+/gu;
const WINDOWS_RESERVED = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu;
const GRAPHEMES = new Intl.Segmenter(undefined, { granularity: "grapheme" });

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
  return isSameVaultName(basename(folder), basename(normalized).slice(0, -3));
}

export function isSameVaultName(left: string, right: string): boolean {
  return left.normalize("NFC").localeCompare(right.normalize("NFC"), undefined, { sensitivity: "accent" }) === 0;
}

export function isSameVaultPath(left: string, right: string): boolean {
  return isSameVaultName(normalizeVaultPath(left), normalizeVaultPath(right));
}

export function sanitizeNodeName(input: string): string {
  let value = input
    .normalize("NFC")
    .replace(WINDOWS_FORBIDDEN, "-")
    .replace(MULTIPLE_SPACES, " ")
    .replace(TRAILING_DOTS_OR_SPACES, "")
    .trim();
  if (value === "") value = "Untitled";
  if (WINDOWS_RESERVED.test(value)) value = `_${value}`;
  let length = 0;
  let truncated = "";
  for (const { segment } of GRAPHEMES.segment(value)) {
    if (length + segment.length > 180) break;
    truncated += segment;
    length += segment.length;
  }
  return truncated.replace(TRAILING_DOTS_OR_SPACES, "") || "Untitled";
}

export function isDescendantPath(candidate: string, ancestor: string): boolean {
  const child = normalizeVaultPath(candidate);
  const parent = normalizeVaultPath(ancestor);
  return child !== parent && child.startsWith(`${parent}/`);
}
