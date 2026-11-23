const WINDOWS_FORBIDDEN = /[<>:"/\\|?*#[\]^]/gu;
const TRAILING_DOTS_OR_SPACES = /[. ]+$/u;
const MULTIPLE_SPACES = /\s+/gu;
const WINDOWS_RESERVED = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu;
const WINDOWS_SUPERSCRIPT_DEVICE = /^(?:com|lpt)[¹²³](?:\.|$)/iu;
// eslint-disable-next-line no-control-regex -- Win32 forbids each ASCII control in a filename.
const WINDOWS_CONTROL = /[\u0000-\u001f]/gu;
const NON_ASCII = /[\u0080-\u{10FFFF}]/u;
const GRAPHEMES = new Intl.Segmenter(undefined, { granularity: "grapheme" });
const UTF8 = new TextEncoder();
const NODE_NAME_BYTE_LIMIT = 255 - UTF8.encode(".md").length;

export function normalizeVaultPath(path: string): string {
  return path.replaceAll("\\", "/").replace(/^\/+|\/+$/gu, "").replace(/\/{2,}/gu, "/");
}

/** Join a Vault path without changing the spelling of existing names. */
export function childVaultPath(parent: string, name: string): string {
  return normalizeVaultPath(`${parent}/${name}`);
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
  if (left === right) return true;
  if (!NON_ASCII.test(left) && !NON_ASCII.test(right)) return left.toLowerCase() === right.toLowerCase();
  const first = left.normalize("NFC");
  const second = right.normalize("NFC");
  if (first === second) return true;
  // Unicode regex matching uses simple case folding without expanding names such as ß into ss.
  const literal = first.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  return new RegExp(`^${literal}$`, "iu").test(second);
}

export function isSameVaultPath(left: string, right: string): boolean {
  return isSameVaultName(normalizeVaultPath(left), normalizeVaultPath(right));
}

export function sanitizeNodeName(input: string): string {
  const name = cleanName(input);
  return limitName(WINDOWS_RESERVED.test(name) ? `_${name}` : name, Number.POSITIVE_INFINITY);
}

export function sanitizeNewNodeName(input: string): string {
  const name = limitName(cleanName(input).replace(WINDOWS_CONTROL, "-"), NODE_NAME_BYTE_LIMIT);
  // Truncating a long grapheme can expose a device name at the end of the component.
  return WINDOWS_RESERVED.test(name) || WINDOWS_SUPERSCRIPT_DEVICE.test(name)
    ? limitName(`_${name}`, NODE_NAME_BYTE_LIMIT)
    : name;
}

function cleanName(input: string): string {
  return input
    .normalize("NFC")
    .replace(WINDOWS_FORBIDDEN, "-")
    .replace(MULTIPLE_SPACES, " ")
    .replace(TRAILING_DOTS_OR_SPACES, "")
    .trim() || "Untitled";
}

function limitName(value: string, byteLimit: number): string {
  let length = 0;
  let bytes = 0;
  let truncated = "";
  for (const { segment } of GRAPHEMES.segment(value)) {
    const segmentBytes = UTF8.encode(segment).length;
    if (length + segment.length > 180 || bytes + segmentBytes > byteLimit) break;
    truncated += segment;
    length += segment.length;
    bytes += segmentBytes;
  }
  return truncated.replace(TRAILING_DOTS_OR_SPACES, "") || "Untitled";
}

export function isDescendantPath(candidate: string, ancestor: string): boolean {
  const child = normalizeVaultPath(candidate);
  const parent = normalizeVaultPath(ancestor);
  return child !== parent && child.startsWith(`${parent}/`);
}
