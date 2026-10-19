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
  const structure = inspectTopLevelStructure(lines, closingBoundary);
  if (structure === null) {
    issues.push({ code: "source-ambiguous", field: "all", message: "Unsupported top-level frontmatter structure; use a block mapping" });
    return { bom, closingBoundary, eol, frontmatter: {}, hasFrontmatter, issues, lines, ranges: new Map() };
  }
  const occurrences = new Map<string, SourceRange[]>();
  const frontmatter: Record<string, unknown> = {};
  for (let index = 1; index < closingBoundary; index += 1) {
    const line = lines[index] ?? "";
    if (!structure.mappingLines.has(index)) continue;
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
    const range = { start: index, end: structure.valueEnds.get(index) ?? continuationEnd(lines, index, closingBoundary) };
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

/**
 * Only insert top-level properties into block mappings. Flow roots, sequences,
 * explicit mapping keys, and scalar documents cannot be patched line-by-line.
 * Reject indented roots because the source patchers own column-zero keys. Track
 * multiline quoted/flow values so their nested keys never become root properties.
 */
function inspectTopLevelStructure(lines: readonly string[], closingBoundary: number): {
  readonly mappingLines: ReadonlySet<number>;
  readonly valueEnds: ReadonlyMap<number, number>;
} | null {
  const mappingLines = new Set<number>();
  const valueEnds = new Map<number, number>();
  let flow: { readonly stack: string[]; quote: "'" | '"' | null; scalarStart: boolean; quotedScalarEnd: boolean; start: number } | null = null;
  for (let index = 1; index < closingBoundary; index += 1) {
    const line = lines[index] ?? "";
    if (flow !== null) {
      if (!scanFlowCollection(line, flow)) return null;
      if (flow.stack.length === 0 && flow.quote === null) {
        valueEnds.set(flow.start, index + 1);
        flow = null;
      }
      continue;
    }
    if (/^\s*(?:#.*)?$/u.test(line)) continue;
    if (/^\s/u.test(line)) {
      if (mappingLines.size === 0) return null;
      continue;
    }
    const separator = blockMappingSeparator(line);
    if (separator === null) return null;
    mappingLines.add(index);
    const value = line.slice(separator + 1).trimStart();
    const collection = /^(?:[&!]\S+\s+)*[[{]/u.exec(value);
    if (collection === null && !/^["']/u.test(value)) continue;
    flow = { stack: [], quote: null, scalarStart: true, quotedScalarEnd: false, start: index };
    if (!scanFlowCollection(value.slice(collection === null ? 0 : collection[0].length - 1), flow)) return null;
    if (flow.stack.length === 0 && flow.quote === null) {
      valueEnds.set(index, index + 1);
      flow = null;
    }
  }
  return flow === null ? { mappingLines, valueEnds } : null;
}

function blockMappingSeparator(line: string): number | null {
  let quote: "'" | '"' | null = null;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (quote === '"') {
      if (character === "\\") { index += 1; continue; }
      if (character === quote) quote = null;
      continue;
    }
    if (quote === "'") {
      if (character === "'" && line[index + 1] === "'") { index += 1; continue; }
      if (character === quote) quote = null;
      continue;
    }
    if (index === 0 && (character === "'" || character === '"')) { quote = character; continue; }
    if (character !== ":" || (line[index + 1] !== undefined && !/\s/u.test(line[index + 1]!))) continue;
    const key = line.slice(0, index).trim();
    if (key === "" || /^[-?](?:\s|$)/u.test(key) || key.startsWith("[") || key.startsWith("]") || /^[{}:,#&*!|>]/u.test(key)) return null;
    return index;
  }
  return null;
}

function scanFlowCollection(source: string, state: { readonly stack: string[]; quote: "'" | '"' | null; scalarStart: boolean; quotedScalarEnd: boolean }): boolean {
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (state.quote === '"') {
      if (character === "\\") { index += 1; continue; }
      if (character === state.quote) {
        state.quote = null;
        state.quotedScalarEnd = true;
        if (state.stack.length === 0) return /^\s*(?:#.*)?$/u.test(source.slice(index + 1));
      }
      continue;
    }
    if (state.quote === "'") {
      if (character === "'" && source[index + 1] === "'") { index += 1; continue; }
      if (character === state.quote) {
        state.quote = null;
        state.quotedScalarEnd = true;
        if (state.stack.length === 0) return /^\s*(?:#.*)?$/u.test(source.slice(index + 1));
      }
      continue;
    }
    if (state.scalarStart && (character === "'" || character === '"')) {
      state.quote = character;
      state.scalarStart = false;
      state.quotedScalarEnd = false;
      continue;
    }
    if (character === "#" && (index === 0 || /\s/u.test(source[index - 1] ?? ""))) break;
    if (character === "{" || character === "[") {
      state.stack.push(character);
      state.scalarStart = true;
      state.quotedScalarEnd = false;
    }
    else if (character === "}" || character === "]") {
      if (state.stack.pop() !== (character === "}" ? "{" : "[")) return false;
      if (state.stack.length === 0) return /^\s*(?:#.*)?$/u.test(source.slice(index + 1));
      state.scalarStart = false;
      state.quotedScalarEnd = false;
    }
    // A colon inside a plain token (http:'quote) is literal. Quoted keys allow
    // adjacent JSON-style values; plain keys require separation after the colon.
    else if (character === "," || (character === ":" && (state.quotedScalarEnd
      || source[index + 1] === undefined || /[\s[\]{},]/u.test(source[index + 1]!)))) {
      state.scalarStart = true;
      state.quotedScalarEnd = false;
    }
    else if (!/\s/u.test(character ?? "")) {
      state.quotedScalarEnd = false;
      if (state.scalarStart && (character === "&" || character === "!")) {
        while (index + 1 < source.length && !/[\s[\]{},]/u.test(source[index + 1]!)) index += 1;
      } else state.scalarStart = false;
    }
  }
  return true;
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
  const after = stripYamlComment(valueAfterColon(lines[start] ?? "")).trim();
  let index = start + 1;
  let hasContent = after === "" || /^[|>]/u.test(after);
  while (index < closingBoundary) {
    const line = lines[index] ?? "";
    if (line === "" || /^\s/u.test(line)) {
      if (!/^\s*(?:#.*)?$/u.test(line)) hasContent = true;
      index += 1;
    }
    else break;
  }
  return hasContent ? index : start + 1;
}

function splitFlowList(value: string): string[] | null {
  const parts: string[] = [];
  let quote: "\"" | "'" | null = null;
  let escaped = false;
  let scalarStart = true;
  let start = 0;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (escaped) { escaped = false; continue; }
    if (character === "\\" && quote === "\"") { escaped = true; continue; }
    if (quote !== null) {
      if (quote === "'" && character === "'" && value[index + 1] === "'") { index += 1; continue; }
      if (character === quote) quote = null;
      continue;
    }
    if (scalarStart && (character === "\"" || character === "'")) { quote = character; scalarStart = false; continue; }
    if (character !== ",") {
      if (!/\s/u.test(character ?? "")) scalarStart = false;
      continue;
    }
    parts.push(value.slice(start, index).trim());
    start = index + 1;
    scalarStart = true;
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
  let scalarStart = true;
  const flow = /^[[{]/u.test(value.trimStart());
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (escaped) { escaped = false; continue; }
    if (character === "\\" && quote === "\"") { escaped = true; continue; }
    if (quote !== null) {
      if (quote === "'" && character === "'" && value[index + 1] === "'") { index += 1; continue; }
      if (character === quote) quote = null;
      continue;
    }
    // Quotes inside a plain scalar (future=Bob's) are literal characters.
    if (scalarStart && (character === "\"" || character === "'")) { quote = character; scalarStart = false; continue; }
    if (character === "#" && (index === 0 || /\s/u.test(value[index - 1] ?? ""))) return value.slice(0, index);
    if (flow && (character === "[" || character === "{" || character === ",")) scalarStart = true;
    else if (!/\s/u.test(character ?? "")) scalarStart = false;
  }
  return value;
}

function valueAfterColon(line: string): string {
  const index = line.indexOf(":");
  return index < 0 ? "" : line.slice(index + 1);
}

function quotedKnownKey(line: string, keys: readonly string[]): string | null {
  if (line[0] !== '"' && line[0] !== "'") return null;
  const separator = blockMappingSeparator(line);
  if (separator === null) return null;
  const raw = line.slice(0, separator).trimEnd();
  const key = raw.startsWith("'")
    ? raw.slice(1, -1).replaceAll("''", "'")
    : decodeDoubleQuotedKey(raw);
  return key !== null && keys.includes(key) ? key : null;
}

/** Compare YAML key identities before allowing a source-preserving write. */
function decodeDoubleQuotedKey(raw: string): string | null {
  if (!raw.endsWith('"')) return null;
  const escapes: Readonly<Record<string, string>> = {
    "0": "\0", a: "\x07", b: "\b", t: "\t", n: "\n", v: "\v", f: "\f", r: "\r",
    e: "\x1b", " ": " ", '"': '"', "/": "/", "\\": "\\",
    N: "\u0085", _: "\u00a0", L: "\u2028", P: "\u2029",
  };
  let result = "";
  for (let index = 1; index < raw.length - 1; index += 1) {
    const character = raw[index] ?? "";
    if (character !== "\\") { result += character; continue; }
    const escape = raw[index + 1] ?? "";
    const width = escape === "x" ? 2 : escape === "u" ? 4 : escape === "U" ? 8 : 0;
    if (width > 0) {
      const digits = raw.slice(index + 2, index + 2 + width);
      if (digits.length !== width || !/^[\da-f]+$/iu.test(digits)) return null;
      const codePoint = Number.parseInt(digits, 16);
      if (codePoint > 0x10ffff || (codePoint >= 0xd800 && codePoint <= 0xdfff)) return null;
      result += String.fromCodePoint(codePoint);
      index += width + 1;
    } else {
      const value = escapes[escape];
      if (value === undefined) return null;
      result += value;
      index += 1;
    }
  }
  return result;
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
