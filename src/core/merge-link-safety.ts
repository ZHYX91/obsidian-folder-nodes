import { isSameVaultName } from "./paths";
import { assertNoNewReferenceBindings, mergeWikiLinks, scanMergeMarkdown } from "./merge-markdown";
import type { MergeMarkdownReferences } from "./merge-markdown-blocks";

export interface MergeLinkTarget {
  readonly path: string;
  readonly identity: unknown;
}

export interface MergeFileRelocation {
  readonly from: string;
  readonly to: string;
}

export type MergeLinkResolver = (path: string, sourcePath: string) => MergeLinkTarget | null;
export type MergeLinkCheck = (phase: "before" | "after") => void;

/**
 * Reject location-sensitive link syntax before a Node merge moves any files.
 * Bind Markdown and WikiLinks to their actual host-resolved file identities.
 * A moving Markdown target also needs an exact relative relocation and a
 * second host resolution after the files have moved.
 * This is intentionally a fail-closed guard, not an unproved Markdown rewrite.
 */
export function assertMergeLinksKeepDestinations(
  source: string, oldNote: string, newNote: string,
  retiredNote: string,
  resolveLink: MergeLinkResolver = () => null,
  movingFiles: readonly MergeFileRelocation[] = [],
  targetMarkdown?: MergeMarkdownReferences,
): MergeLinkCheck {
  if (oldNote === newNote) return () => undefined;
  const checks: MergeLinkCheck[] = [];
  const sourceMarkdown = scanMergeMarkdown(source, (visible, lineIndex) => {
    const covered = new Set<number>();
    // All openings before the next ] share that label boundary. If it cannot
    // start a destination, retrying those openings only rescans the same text.
    for (let cursor = 0; cursor < visible.length;) {
      const open = visible.indexOf("[", cursor);
      if (open < 0) break;
      const close = visible.indexOf("]", open + 1);
      if (close < 0) break;
      cursor = close + 1;
      if (visible[cursor] !== "(") continue;
      const end = visible.indexOf(")", cursor + 1);
      if (end < 0) break;
      const content = visible.slice(cursor + 1, end).trim();
      covered.add(close);
      cursor = end + 1;
      const raw = content.startsWith("<") && content.endsWith(">") ? content.slice(1, -1) : content;
      if (external(raw)) continue;
      // Markdown decodes character references in destinations before resolving
      // them. Do not prove relocation safety against the undecoded spelling.
      if (/&(?:#[xX][0-9A-Fa-f]+|#[0-9]+|[A-Za-z][A-Za-z0-9]+);/u.test(raw)) {
        throw new Error("Cannot safely merge an entity-encoded relative Markdown link");
      }
      if (/[%\\()\s]/u.test(raw)) throw new Error("Cannot safely merge an ambiguous relative Markdown link");
      if (raw.includes("?")) throw new Error("Cannot safely merge a relative query");
      const path = raw.split("#", 1)[0] ?? "";
      const start = visible[open - 1] === "!" ? open - 1 : open;
      checks.push(assertMergeLinkTarget(path, oldNote, newNote, retiredNote, resolveLink, movingFiles,
        `${oldNote} body line ${lineIndex + 1} ${visible.slice(start, cursor)}`, "Markdown link"));
    }
    for (let index = visible.indexOf("]("); index >= 0; index = visible.indexOf("](", index + 2)) {
      if (!covered.has(index)) throw new Error("Cannot safely merge an unsupported Markdown link");
    }
    checks.push(assertMergeWikiLinksKeepDestinations(visible, oldNote, newNote, retiredNote, resolveLink, movingFiles, `${oldNote} body line ${lineIndex + 1}`));
  });
  for (const target of sourceMarkdown.htmlTargets) {
    if (!absolute(target)) throw new Error("Cannot safely merge a relative HTML link");
  }
  const definitions = sourceMarkdown.references;
  for (const candidates of definitions.values()) {
    for (const destination of candidates) if (!external(destination)) throw new Error("Cannot safely merge a relative reference definition");
  }
  if (targetMarkdown !== undefined) {
    // The destination note appears first in the merged document. Its first
    // definition of a normalized label would shadow the source definition.
    for (const [label, earlier] of targetMarkdown.references) {
      const incoming = definitions.get(label);
      if (incoming !== undefined && (earlier.size !== 1 || [...incoming].some((destination) => !earlier.has(destination)))) {
        throw new Error("Cannot merge conflicting reference definitions");
      }
    }
    assertNoNewReferenceBindings(sourceMarkdown, targetMarkdown);
    assertNoNewReferenceBindings(targetMarkdown, sourceMarkdown);
  }
  return (phase) => { for (const check of checks) check(phase); };
}

/** Accepts visible prose or a parsed Text/List property value, without YAML escaping. */
export function assertMergeWikiLinksKeepDestinations(
  source: string, oldNote: string, newNote: string, retiredNote: string,
  resolveLink: MergeLinkResolver,
  movingFiles: readonly MergeFileRelocation[] = [],
  location = oldNote,
): MergeLinkCheck {
  const checks: MergeLinkCheck[] = [];
  for (const { raw, label } of mergeWikiLinks(source)) {
    const path = (label.split(/#|\\?\|/u, 1)[0] ?? "").trim();
    if (path === "." || path === ".." || path.startsWith("./") || path.startsWith("../")) {
      throw new Error("Cannot safely merge a relative WikiLink");
    }
    if ((path === "" && !label.trim().startsWith("#"))
      || /[%\\]|\/{2,}|\/$|(?:^|\/)\.{1,2}(?:\/|$)/u.test(path)) {
      throw new Error(`Cannot prove a WikiLink target survives merge: ${location} ${raw}`);
    }
    checks.push(assertMergeLinkTarget(path, oldNote, newNote, retiredNote, resolveLink, movingFiles,
      `${location} ${raw}`, "WikiLink"));
  }
  // Retain original identities; never re-resolve old contexts after moving.
  return (phase) => { for (const check of checks) check(phase); };
}

function assertMergeLinkTarget(
  path: string, oldNote: string, newNote: string, retiredNote: string,
  resolveLink: MergeLinkResolver, movingFiles: readonly MergeFileRelocation[],
  location: string, kind: "Markdown link" | "WikiLink",
): MergeLinkCheck {
  const destination = path === "" ? { path: oldNote, identity: null } : resolveLink(path, oldNote);
  if (destination?.path === retiredNote || path.replace(/^\/+|\.md$/giu, "") === retiredNote.replace(/\.md$/iu, "")) {
    throw new Error(`Cannot merge a ${kind} to the removed Node Note: ${location}`);
  }
  // A child self-subpath moves with that child. The retired note's self-link
  // has already been rejected above, including Markdown's empty destination.
  if (path === "") return () => undefined;
  if (destination === null) throw new Error(`Cannot prove a ${kind} target survives merge: ${location}`);
  const relocation = movingFiles.find(({ from }) => from === destination.path);
  if (relocation !== undefined) {
    // Lexical paths only prove the relocation of a bound real target. They
    // never substitute for host resolution of vault-root or best-match links.
    if (kind !== "Markdown link" || resolve(oldNote, path) !== destination.path || resolve(newNote, path) !== relocation.to) {
      throw new Error(`Cannot prove a ${kind} target survives merge: ${location}`);
    }
  } else if (movingFiles.length > 0) {
    const selector = path.replace(/^\/+|\.md$/giu, "").normalize("NFC").split("/");
    if (movingFiles.some(({ from, to }) => selectorMatches(selector, from) || selectorMatches(selector, to))) {
      throw new Error(`Cannot prove a ${kind} target survives merge: ${location}`);
    }
  }
  const check: MergeLinkCheck = (phase) => {
    const next = resolveLink(path, relocation !== undefined && phase === "before" ? oldNote : newNote);
    const expectedPath = relocation !== undefined && phase === "after" ? relocation.to : destination.path;
    if (next === null || next.path !== expectedPath || next.identity !== destination.identity) {
      throw new Error(`Merge would change a ${kind} target: ${location}`);
    }
  };
  check("before");
  return check;
}

function selectorMatches(selector: readonly string[], path: string): boolean {
  const components = path.replace(/\.md$/iu, "").normalize("NFC").split("/");
  const offset = components.length - selector.length;
  if (offset < 0) return false;
  return selector.every((name, index) => {
    const candidate = components[offset + index];
    // Retain lowercase collisions under both default and host-locale rules.
    // These are possible competitors; only the host resolver binds a file.
    return candidate !== undefined && (isSameVaultName(name, candidate)
      || name.toLowerCase() === candidate.toLowerCase()
      || name.toLocaleLowerCase() === candidate.toLocaleLowerCase());
  });
}

function absolute(path: string): boolean {
  return path.startsWith("/") || external(path);
}

function external(path: string): boolean {
  return path.startsWith("//") || /^[A-Za-z][A-Za-z0-9+.-]*:/u.test(path);
}

function resolve(filePath: string, relative: string): string {
  const result = relative.startsWith("/") ? [] : filePath.split("/").slice(0, -1);
  for (const part of relative.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") {
      if (result.length === 0) throw new Error("Merge link escapes the Vault root");
      result.pop();
    } else result.push(part);
  }
  return result.join("/");
}
