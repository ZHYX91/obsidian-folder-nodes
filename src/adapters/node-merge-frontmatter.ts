import { parseYaml, stringifyYaml } from "obsidian";
import { analyzeFolderNodesSource } from "../core/frontmatter";
import { assertMergeWikiLinksKeepDestinations, type MergeFileRelocation, type MergeLinkCheck, type MergeLinkResolver } from "../core/merge-link-safety";
import { FOLDER_NODES_PROPERTY, LEGACY_FOLDER_NODES_PROPERTIES, resolveFolderNodesProperties } from "../core/properties";

export const STRUCTURAL_PROPERTIES = new Set([FOLDER_NODES_PROPERTY, ...LEGACY_FOLDER_NODES_PROPERTIES]);

export function deepEqual(left: unknown, right: unknown, compared = new WeakMap<object, WeakSet<object>>()): boolean {
  if (Object.is(left, right)) return true;
  if (typeof left !== "object" || left === null || typeof right !== "object" || right === null) return false;
  const kind = Object.prototype.toString.call(left);
  if (kind !== Object.prototype.toString.call(right)) return false;
  // Host YAML loaders may return tagged values such as Date, Set or binary.
  // Their enumerable properties do not establish their value (Dates have none).
  if (kind === "[object Date]") return Date.prototype.getTime.call(left) === Date.prototype.getTime.call(right);
  if (kind === "[object Set]") {
    const a = left as ReadonlySet<unknown>, b = right as ReadonlySet<unknown>;
    return a.size === b.size && [...a].every((key) => b.has(key));
  }
  if (ArrayBuffer.isView(left) && ArrayBuffer.isView(right)) {
    const a = new Uint8Array(left.buffer, left.byteOffset, left.byteLength);
    const b = new Uint8Array(right.buffer, right.byteOffset, right.byteLength);
    return a.length === b.length && a.every((value, i) => value === b[i]);
  }
  // Unrecognized native values and independently parsed object-valued set
  // keys cannot be proven equal. Refuse to discard either representation.
  if (kind !== "[object Object]" && !Array.isArray(left)) return false;
  const peers = compared.get(left);
  if (peers?.has(right)) return true;
  if (peers === undefined) compared.set(left, new WeakSet([right]));
  else peers.add(right);
  if (Array.isArray(left) && Array.isArray(right)) {
    return left.length === right.length && left.every((value, index) => deepEqual(value, right[index], compared));
  }
  const other = right as Record<string, unknown>;
  const entries = Object.entries(left);
  return entries.length === Object.keys(other).length && entries.every(([key, value]) =>
    Object.prototype.hasOwnProperty.call(other, key) && deepEqual(value, other[key], compared));
}

export interface MergeDocument {
  readonly source: string;
  readonly body: string;
  readonly bom: string;
  readonly closingOffset: number | null;
  readonly eol: string;
  readonly frontmatter: Record<string, unknown>;
}

export function readOrderingProperties(source: string, path: string, field: "order" | "rank", operation: "merge" | "node"): ReturnType<typeof resolveFolderNodesProperties> {
  const analysis = analyzeFolderNodesSource(source);
  const frontmatter = readMergeFrontmatter(source, path);
  const structural = Object.keys(frontmatter).some((key) => STRUCTURAL_PROPERTIES.has(key));
  const properties = resolveFolderNodesProperties(frontmatter, structural ? analysis.issues : []);
  const issue = properties.issues.find((entry) => entry.field === "all" || entry.field === field);
  if (issue !== undefined) throw new Error(`Cannot prove ${operation} ordering for ${path}: ${issue.message}`);
  return properties;
}

export function readMergeFrontmatter(source: string, path: string): Record<string, unknown> {
  return readMergeDocument(source, path).frontmatter;
}

export function assertMergePropertyLinks(
  properties: Readonly<Record<string, unknown>>, sourcePath: string, targetPath: string, retiredNote: string,
  resolveLink: MergeLinkResolver,
  movingFiles: readonly MergeFileRelocation[],
  existingTarget: Readonly<Record<string, unknown>> = {},
): MergeLinkCheck {
  const checks: MergeLinkCheck[] = [];
  for (const [key, value] of Object.entries(properties)) {
    if (STRUCTURAL_PROPERTIES.has(key) || Object.prototype.hasOwnProperty.call(existingTarget, key)) continue;
    const values = Array.isArray(value) ? value as unknown[] : [value];
    for (const entry of values) {
      if (typeof entry === "string") {
        checks.push(assertMergeWikiLinksKeepDestinations(entry, sourcePath, targetPath, retiredNote, resolveLink, movingFiles, `${sourcePath} property ${key}`));
      }
    }
  }
  return (phase) => { for (const check of checks) check(phase); };
}

export function mergeFrontmatterProperties(
  parsed: MergeDocument,
  sourceProperties: Readonly<Record<string, unknown>>,
  targetPath: string,
): string {
  const targetSource = parsed.source;
  const additions: Array<readonly [string, unknown]> = [];
  for (const [key, value] of Object.entries(sourceProperties)) {
    if (STRUCTURAL_PROPERTIES.has(key)) continue;
    if (Object.prototype.hasOwnProperty.call(parsed.frontmatter, key)) {
      if (!deepEqual(parsed.frontmatter[key], value)) throw new Error(`Merge property conflict: ${key}`);
      continue;
    }
    additions.push([key, value]);
  }
  if (additions.length === 0) return targetSource;
  const serialized = stringifyYaml(Object.fromEntries(additions)).replaceAll("\r\n", "\n");
  const rendered = (serialized.endsWith("\n") ? serialized.slice(0, -1) : serialized)
    .replaceAll("\n", parsed.eol);
  const closingAndBody = parsed.closingOffset === null ? "" : targetSource.slice(parsed.closingOffset);
  const candidate = parsed.closingOffset === null
    ? `${parsed.bom}---${parsed.eol}${rendered}${parsed.eol}---${parsed.eol}${parsed.body}`
    : targetSource.slice(0, parsed.closingOffset) + rendered + parsed.eol + closingAndBody;
  const expected = Object.fromEntries([...Object.entries(parsed.frontmatter), ...additions]);
  try {
    if (deepEqual(readMergeFrontmatter(candidate, targetPath), expected)) return candidate;
  } catch { /* Flow-style mappings cannot accept appended block-style fields. */ }
  if (parsed.closingOffset === null) throw new Error(`Cannot safely serialize merge properties: ${targetPath}`);
  const normalized = stringifyYaml(expected).trimEnd().replaceAll("\r\n", "\n").replaceAll("\n", parsed.eol);
  const fallback = `${parsed.bom}---${parsed.eol}${normalized}${parsed.eol}${closingAndBody}`;
  if (!deepEqual(readMergeFrontmatter(fallback, targetPath), expected)) {
    throw new Error(`Cannot safely serialize merge properties: ${targetPath}`);
  }
  return fallback;
}

/** Parse only the YAML header. Keep the authored body and its line endings as an exact slice. */
export function readMergeDocument(source: string, path: string): MergeDocument {
  const bom = source.startsWith("\uFEFF") ? "\uFEFF" : "";
  const breaks = /\r\n|\r|\n/gu;
  const firstBreak = breaks.exec(source);
  const eol = firstBreak?.[0] ?? "\n";
  const base = { source, bom, eol };
  const firstLine = source.slice(bom.length, firstBreak?.index ?? source.length);
  if (!/^---\s*$/u.test(firstLine)) return { ...base, closingOffset: null, body: source.slice(bom.length), frontmatter: {} };
  const yamlStart = firstBreak === null ? source.length : breaks.lastIndex;
  let lineStart = yamlStart;
  while (lineStart < source.length) {
    const nextBreak = breaks.exec(source);
    const end = nextBreak?.index ?? source.length;
    if (/^---\s*$/u.test(source.slice(lineStart, end))) {
      const yaml = source.slice(yamlStart, lineStart).replace(/\r\n?/gu, "\n");
      let parsed: unknown;
      try { parsed = yaml.trim() === "" ? {} : parseYaml(yaml); }
      catch (error) { throw new Error(`Cannot merge malformed frontmatter: ${path}`, { cause: error }); }
      if (parsed == null) parsed = {};
      if (Object.prototype.toString.call(parsed) !== "[object Object]") throw new Error(`Cannot merge non-object frontmatter: ${path}`);
      return { ...base, closingOffset: lineStart, body: source.slice(nextBreak === null ? end : breaks.lastIndex), frontmatter: parsed as Record<string, unknown> };
    }
    if (nextBreak === null) break;
    lineStart = breaks.lastIndex;
  }
  throw new Error(`Cannot merge malformed frontmatter: ${path}`);
}
