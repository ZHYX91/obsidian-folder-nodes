import { parseYaml, stringifyYaml } from "obsidian";
import { analyzeFolderNodesSource } from "../core/frontmatter";
import { assertMergeWikiLinksKeepDestinations, type MergeFileRelocation, type MergeLinkCheck, type MergeLinkResolver } from "../core/merge-link-safety";
import { FOLDER_NODES_PROPERTY, LEGACY_FOLDER_NODES_PROPERTIES, resolveFolderNodesProperties } from "../core/properties";

export const STRUCTURAL_PROPERTIES = new Set([FOLDER_NODES_PROPERTY, ...LEGACY_FOLDER_NODES_PROPERTIES]);

export function deepEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) return Array.isArray(left) && Array.isArray(right) && left.length === right.length && left.every((value, index) => deepEqual(value, right[index]));
  if (typeof left !== "object" || left === null || typeof right !== "object" || right === null) return false;
  const leftEntries = Object.entries(left as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
  const rightEntries = Object.entries(right as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
  return leftEntries.length === rightEntries.length && leftEntries.every(([key, value], index) => {
    const peer = rightEntries[index];
    return peer !== undefined && key === peer[0] && deepEqual(value, peer[1]);
  });
}

interface ParsedMergeFrontmatter {
  readonly bom: string;
  readonly closingBoundary: number;
  readonly eol: string;
  readonly frontmatter: Record<string, unknown>;
  readonly hasFrontmatter: boolean;
  readonly lines: string[];
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
  return parseMergeFrontmatter(source, path).frontmatter;
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
  targetSource: string,
  sourceProperties: Readonly<Record<string, unknown>>,
  targetPath: string,
): string {
  const parsed = parseMergeFrontmatter(targetSource, targetPath);
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
  if (!parsed.hasFrontmatter) {
    return `${parsed.bom}---${parsed.eol}${rendered}${parsed.eol}---${parsed.eol}${targetSource.slice(parsed.bom.length)}`;
  }
  const lines = [...parsed.lines];
  lines.splice(parsed.closingBoundary, 0, ...rendered.split(parsed.eol));
  const candidate = `${parsed.bom}${lines.join(parsed.eol)}`;
  const expected = Object.fromEntries([...Object.entries(parsed.frontmatter), ...additions]);
  try {
    if (deepEqual(readMergeFrontmatter(candidate, targetPath), expected)) return candidate;
  } catch { /* Flow-style mappings cannot accept appended block-style fields. */ }
  const normalized = stringifyYaml(expected).trimEnd().replaceAll("\r\n", "\n").replaceAll("\n", parsed.eol);
  const body = parsed.lines.slice(parsed.closingBoundary + 1).join(parsed.eol);
  const fallback = `${parsed.bom}---${parsed.eol}${normalized}${parsed.eol}---${parsed.eol}${body}`;
  if (!deepEqual(readMergeFrontmatter(fallback, targetPath), expected)) {
    throw new Error(`Cannot safely serialize merge properties: ${targetPath}`);
  }
  return fallback;
}

function parseMergeFrontmatter(source: string, path: string): ParsedMergeFrontmatter {
  const bom = source.startsWith("\uFEFF") ? "\uFEFF" : "";
  const body = source.slice(bom.length);
  const eol = body.includes("\r\n") ? "\r\n" : "\n";
  const lines = body.split(/\r\n|\n/u);
  if (!/^---\s*$/u.test(lines[0] ?? "")) {
    return { bom, closingBoundary: -1, eol, frontmatter: {}, hasFrontmatter: false, lines };
  }
  const relativeEnd = lines.slice(1).findIndex((line) => /^---\s*$/u.test(line));
  if (relativeEnd < 0) throw new Error(`Cannot merge malformed frontmatter: ${path}`);
  const closingBoundary = relativeEnd + 1;
  const yaml = lines.slice(1, closingBoundary).join("\n");
  let parsed: unknown;
  try {
    parsed = yaml.trim() === "" ? {} : parseYaml(yaml);
  } catch (error) {
    throw new Error(`Cannot merge malformed frontmatter: ${path}`, { cause: error });
  }
  if (parsed === null || parsed === undefined) parsed = {};
  if (typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`Cannot merge non-object frontmatter: ${path}`);
  }
  return {
    bom,
    closingBoundary,
    eol,
    frontmatter: parsed as Record<string, unknown>,
    hasFrontmatter: true,
    lines,
  };
}

export function stripMergeFrontmatter(source: string, path: string): string {
  const parsed = parseMergeFrontmatter(source, path);
  if (!parsed.hasFrontmatter) return source.slice(parsed.bom.length).replaceAll("\r\n", "\n");
  return parsed.lines.slice(parsed.closingBoundary + 1).join("\n");
}
