import {
  canonicalFolderNodesEntries,
  FOLDER_NODES_PROPERTY,
  folderNodesPropertyWriteIsSafe,
  LEGACY_CHILDREN_SORT_PROPERTY,
  LEGACY_FOLDER_NODES_PROPERTIES,
  LEGACY_HIDDEN_PROPERTY,
  LEGACY_SIBLING_RANK_PROPERTY,
  resolveFolderNodesProperties,
  type FolderNodesPropertyIssue,
  type FolderNodesTokenKey,
} from "./properties";

const FRONTMATTER_BOUNDARY = /^---\s*$/u;
const KNOWN_PROPERTIES = [FOLDER_NODES_PROPERTY, ...LEGACY_FOLDER_NODES_PROPERTIES] as const;

interface SourceRange {
  readonly end: number;
  readonly start: number;
}

interface ParsedSource {
  readonly bom: string;
  readonly closingBoundary: number;
  readonly eol: string;
  readonly frontmatter: Record<string, unknown>;
  readonly hasFrontmatter: boolean;
  readonly issues: FolderNodesPropertyIssue[];
  readonly lines: string[];
  readonly ranges: ReadonlyMap<string, SourceRange>;
}

export interface FolderNodesSourceAnalysis {
  readonly frontmatter: Readonly<Record<string, unknown>>;
  readonly hasFrontmatter: boolean;
  readonly issues: readonly FolderNodesPropertyIssue[];
}

export interface FolderNodesFrontmatterPatch {
  readonly hidden?: boolean | null;
  readonly migrateLegacy?: boolean;
  readonly order?: "manual" | null;
  readonly rank?: number | null;
}

export function analyzeFolderNodesSource(source: string): FolderNodesSourceAnalysis {
  const parsed = parseSource(source);
  return {
    frontmatter: parsed.frontmatter,
    hasFrontmatter: parsed.hasFrontmatter,
    issues: parsed.issues,
  };
}

export function patchFolderNodesFrontmatter(source: string, patch: FolderNodesFrontmatterPatch): string {
  const parsed = parseSource(source);
  if (parsed.issues.length > 0) throw new Error(parsed.issues[0]?.message ?? "Ambiguous Folder Nodes properties");
  const current = resolveFolderNodesProperties(parsed.frontmatter, parsed.issues);
  const canonicalIssue = current.issues.find(({ code }) =>
    code === "canonical-type" || code === "duplicate-key" || code === "invalid-value" || code === "malformed-token");
  if (canonicalIssue !== undefined) throw new Error(canonicalIssue.message);
  const touched = tokenKeysInPatch(patch);
  const fields = patch.migrateLegacy === true ? (["order", "rank", "hidden"] as const) : touched;
  for (const field of fields) {
    if (!folderNodesPropertyWriteIsSafe(current, field)) {
      throw new Error(current.issues.find((issue) => issue.field === "all" || issue.field === field)?.message
        ?? `Cannot safely update ${field}`);
    }
  }

  const canonicalOnly = resolveFolderNodesProperties(
    current.canonicalPresent ? { [FOLDER_NODES_PROPERTY]: current.canonicalEntries } : {},
  );
  const values = patch.migrateLegacy === true
    ? { hidden: current.hidden, order: current.order, rank: current.rank }
    : { hidden: canonicalOnly.hidden, order: canonicalOnly.order, rank: canonicalOnly.rank };
  if (Object.prototype.hasOwnProperty.call(patch, "order")) values.order = patch.order ?? null;
  if (Object.prototype.hasOwnProperty.call(patch, "rank")) values.rank = patch.rank ?? null;
  if (Object.prototype.hasOwnProperty.call(patch, "hidden")) values.hidden = patch.hidden === true;
  const nextEntries = canonicalFolderNodesEntries(values, current.unknownEntries);
  const legacyToRemove = new Set<string>();
  if (patch.migrateLegacy === true) {
    for (const property of LEGACY_FOLDER_NODES_PROPERTIES) legacyToRemove.add(property);
  } else {
    for (const field of touched) legacyToRemove.add(legacyPropertyFor(field));
  }
  return patchParsedSource(parsed, nextEntries, legacyToRemove);
}

export function patchFrontmatterScalar(source: string, key: string, value: string | number | boolean | null): string {
  const parsed = parseGenericSource(source, key);
  if (parsed.issues.length > 0) throw new Error(parsed.issues[0]?.message ?? `Cannot safely update ${key}`);
  const range = parsed.ranges.get(key);
  if (!parsed.hasFrontmatter) {
    if (value === null) return source;
    const rendered = `${key}: ${renderScalar(value)}`;
    return `${parsed.bom}---${parsed.eol}${rendered}${parsed.eol}---${parsed.eol}${source.slice(parsed.bom.length)}`;
  }
  const rendered = value === null ? [] : [`${key}: ${renderScalar(value)}`];
  const insertion = range?.start ?? parsed.closingBoundary;
  return rebuildSource(parsed, range === undefined ? [] : [range], insertion, rendered);
}

export function createNodeDocument(alias: string | null, body: string): string {
  if (alias === null || alias.trim() === "") return body;
  return `---\naliases:\n  - ${JSON.stringify(alias.trim())}\n---\n${body}`;
}

function patchParsedSource(parsed: ParsedSource, entries: readonly string[], legacyToRemove: ReadonlySet<string>): string {
  if (!parsed.hasFrontmatter) {
    if (entries.length === 0) return `${parsed.bom}${parsed.lines.join(parsed.eol)}`;
    const rendered = renderFolderNodes(entries, parsed.eol);
    return `${parsed.bom}---${parsed.eol}${rendered}${parsed.eol}---${parsed.eol}${parsed.lines.join(parsed.eol)}`;
  }
  const ranges = [
    parsed.ranges.get(FOLDER_NODES_PROPERTY),
    ...[...legacyToRemove].map((key) => parsed.ranges.get(key)),
  ].filter((range): range is SourceRange => range !== undefined);
  const insertion = ranges.reduce((minimum, range) => Math.min(minimum, range.start), parsed.closingBoundary);
  const rendered = entries.length === 0 ? [] : renderFolderNodes(entries, parsed.eol).split(parsed.eol);
  return rebuildSource(parsed, ranges, insertion, rendered);
}

function rebuildSource(parsed: ParsedSource, removedRanges: readonly SourceRange[], insertion: number, rendered: readonly string[]): string {
  const removed = new Set<number>();
  for (const range of removedRanges) for (let index = range.start; index < range.end; index += 1) removed.add(index);
  const lines: string[] = [];
  for (let index = 0; index < parsed.lines.length; index += 1) {
    if (index === insertion) lines.push(...rendered);
    if (!removed.has(index)) lines.push(parsed.lines[index] ?? "");
  }
  if (insertion === parsed.lines.length) lines.push(...rendered);
  return `${parsed.bom}${lines.join(parsed.eol)}`;
}

function parseSource(source: string): ParsedSource {
  return parseKnownSource(source, KNOWN_PROPERTIES);
}

function parseGenericSource(source: string, key: string): ParsedSource {
  return parseKnownSource(source, [key]);
}

function parseKnownSource(source: string, keys: readonly string[]): ParsedSource {
  const bom = source.startsWith("\uFEFF") ? "\uFEFF" : "";
  const body = source.slice(bom.length);
  const eol = body.includes("\r\n") ? "\r\n" : "\n";
  const lines = body.split(/\r\n|\n/u);
  const hasFrontmatter = FRONTMATTER_BOUNDARY.test(lines[0] ?? "");
  const issues: FolderNodesPropertyIssue[] = [];
  if (!hasFrontmatter) {
    return { bom, closingBoundary: -1, eol, frontmatter: {}, hasFrontmatter, issues, lines, ranges: new Map() };
  }
  const relativeEnd = lines.slice(1).findIndex((line) => FRONTMATTER_BOUNDARY.test(line));
  if (relativeEnd < 0) {
    issues.push({ code: "source-ambiguous", field: "all", message: "Cannot update malformed frontmatter without a closing boundary" });
    return { bom, closingBoundary: -1, eol, frontmatter: {}, hasFrontmatter, issues, lines, ranges: new Map() };
  }
  const closingBoundary = relativeEnd + 1;
  const occurrences = new Map<string, SourceRange[]>();
  const frontmatter: Record<string, unknown> = {};
  for (let index = 1; index < closingBoundary; index += 1) {
    const line = lines[index] ?? "";
    if (/^\s/u.test(line)) continue;
    const quoted = quotedKnownKey(line, keys);
    if (quoted !== null) {
      issues.push({
        code: "source-ambiguous",
        field: "all",
        message: `Quoted Folder Nodes property keys require manual review: ${quoted}`,
      });
      continue;
    }
    const key = keys.find((candidate) => new RegExp(`^${escapePattern(candidate)}\\s*:`, "u").test(line));
    if (key === undefined) continue;
    const range = { start: index, end: continuationEnd(lines, index, closingBoundary) };
    const existing = occurrences.get(key) ?? [];
    existing.push(range);
    occurrences.set(key, existing);
    frontmatter[key] = key === FOLDER_NODES_PROPERTY
      ? parseFolderNodesValue(lines, range)
      : parseYamlScalar(valueAfterColon(line));
    index = range.end - 1;
  }
  const ranges = new Map<string, SourceRange>();
  for (const [key, candidates] of occurrences) {
    if (candidates.length > 1) {
      issues.push({
        code: "source-ambiguous",
        field: "all",
        message: `Duplicate Folder Nodes property key requires manual review: ${key}`,
      });
    }
    const candidate = candidates[0];
    if (candidate !== undefined) ranges.set(key, candidate);
  }
  return { bom, closingBoundary, eol, frontmatter, hasFrontmatter, issues, lines, ranges };
}

function parseFolderNodesValue(lines: readonly string[], range: SourceRange): unknown {
  const first = stripYamlComment(valueAfterColon(lines[range.start] ?? "")).trim();
  if (first !== "") {
    if (!first.startsWith("[") || !first.endsWith("]")) return parseYamlScalar(first);
    const inner = first.slice(1, -1).trim();
    if (inner === "") return [];
    const items = splitFlowList(inner);
    return items === null ? first : items.map((item) => parseYamlScalar(item));
  }
  const values: unknown[] = [];
  for (let index = range.start + 1; index < range.end; index += 1) {
    const line = lines[index] ?? "";
    if (/^\s*(?:#.*)?$/u.test(line)) continue;
    const match = /^\s+-\s+(.+)$/u.exec(line);
    if (match === null) return { unsupported: true };
    values.push(parseYamlScalar(match[1] ?? ""));
  }
  return values;
}

function continuationEnd(lines: readonly string[], start: number, closingBoundary: number): number {
  const after = valueAfterColon(lines[start] ?? "");
  if (stripYamlComment(after).trim() !== "") return start + 1;
  let index = start + 1;
  while (index < closingBoundary) {
    const line = lines[index] ?? "";
    if (line === "" || /^\s/u.test(line)) index += 1;
    else break;
  }
  return index;
}

function splitFlowList(value: string): string[] | null {
  const parts: string[] = [];
  let quote: "\"" | "'" | null = null;
  let escaped = false;
  let start = 0;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (escaped) { escaped = false; continue; }
    if (character === "\\" && quote === "\"") { escaped = true; continue; }
    if (quote !== null) {
      if (character === quote) quote = null;
      continue;
    }
    if (character === "\"" || character === "'") { quote = character; continue; }
    if (character !== ",") continue;
    parts.push(value.slice(start, index).trim());
    start = index + 1;
  }
  if (quote !== null) return null;
  parts.push(value.slice(start).trim());
  return parts.some((part) => part === "") ? null : parts;
}

function parseYamlScalar(raw: string): unknown {
  const value = stripYamlComment(raw).trim();
  if (value.startsWith("\"") && value.endsWith("\"")) {
    try { return JSON.parse(value) as unknown; } catch { return value; }
  }
  if (value.startsWith("'") && value.endsWith("'")) return value.slice(1, -1).replaceAll("''", "'");
  if (value === "true") return true;
  if (value === "false") return false;
  if (value === "null" || value === "~") return null;
  if (/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/u.test(value)) return Number(value);
  return value;
}

function stripYamlComment(value: string): string {
  let quote: "\"" | "'" | null = null;
  let escaped = false;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (escaped) { escaped = false; continue; }
    if (character === "\\" && quote === "\"") { escaped = true; continue; }
    if (quote !== null) {
      if (character === quote) quote = null;
      continue;
    }
    if (character === "\"" || character === "'") { quote = character; continue; }
    if (character === "#" && (index === 0 || /\s/u.test(value[index - 1] ?? ""))) return value.slice(0, index);
  }
  return value;
}

function valueAfterColon(line: string): string {
  const index = line.indexOf(":");
  return index < 0 ? "" : line.slice(index + 1);
}

function quotedKnownKey(line: string, keys: readonly string[]): string | null {
  const match = /^(?:"([^"]+)"|'([^']+)')\s*:/u.exec(line);
  const key = match?.[1] ?? match?.[2] ?? null;
  return key !== null && keys.includes(key) ? key : null;
}

function tokenKeysInPatch(patch: FolderNodesFrontmatterPatch): FolderNodesTokenKey[] {
  const keys: FolderNodesTokenKey[] = [];
  if (Object.prototype.hasOwnProperty.call(patch, "order")) keys.push("order");
  if (Object.prototype.hasOwnProperty.call(patch, "rank")) keys.push("rank");
  if (Object.prototype.hasOwnProperty.call(patch, "hidden")) keys.push("hidden");
  return keys;
}

function legacyPropertyFor(field: FolderNodesTokenKey): string {
  if (field === "order") return LEGACY_CHILDREN_SORT_PROPERTY;
  if (field === "rank") return LEGACY_SIBLING_RANK_PROPERTY;
  return LEGACY_HIDDEN_PROPERTY;
}

function renderFolderNodes(entries: readonly string[], eol: string): string {
  return [FOLDER_NODES_PROPERTY + ":", ...entries.map((entry) => `  - ${renderListItem(entry)}`)].join(eol);
}

function renderListItem(value: string): string {
  return /^[a-z][a-z0-9-]*=[A-Za-z0-9._/-]+$/u.test(value) ? value : JSON.stringify(value);
}

function renderScalar(value: string | number | boolean): string {
  return typeof value === "string" ? JSON.stringify(value) : String(value);
}

function escapePattern(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
