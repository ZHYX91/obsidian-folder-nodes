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

const quoteMarker = / {0,3}>[ \t]?/u.source;
const quotePrefixPattern = new RegExp(`^(?:${quoteMarker})+`, "u");

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
): MergeLinkCheck {
  if (oldNote === newNote) return () => undefined;
  const checks: MergeLinkCheck[] = [];
  let fence: { mark: string; width: number; quoteDepth: number; listIndent: number } | null = null;
  let comment: LiteralBlock | null = null;
  let previousBlank = true;
  let indentedCode = false;
  let listIndents: number[] = [];
  let listQuoteDepth = 0;
  const lines = source.split(/\r\n|\r|\n/u);
  // A skipped literal line must also interrupt a multiline reference label.
  const referenceLines = Array<string>(lines.length).fill("");
  for (const [lineIndex, line] of lines.entries()) {
    const quotePrefix = quotePrefixPattern.exec(line)?.[0] ?? "";
    const quoteDepth = quotePrefix.split(">").length - 1;
    const fenceLine = expandTabs(line.slice(quotePrefix.length));
    if (fence !== null && quoteDepth < fence.quoteDepth) fence = null;
    if (fence !== null) {
      const boundPrefix = fence.quoteDepth === 0 ? "" : new RegExp(`^(?:${quoteMarker}){${fence.quoteDepth}}`, "u").exec(line)?.[0] ?? "";
      const content = expandTabs(line.slice(boundPrefix.length));
      const indentation = /^[ ]*/u.exec(content)?.[0].length ?? 0;
      if (content.trim() !== "" && indentation < fence.listIndent) fence = null;
      else {
        const close = new RegExp("^ {0,3}" + fence.mark + "{" + fence.width + ",}[ \\t]*$", "u");
        if (close.test(content.slice(fence.listIndent))) fence = null;
        continue;
      }
    }
    const blank = /^\s*$/u.test(fenceLine);
    const indentation = /^ */u.exec(fenceLine)?.[0].length ?? 0;
    const deeperQuote = quoteDepth > listQuoteDepth;
    if (quoteDepth !== listQuoteDepth) listIndents = [];
    listQuoteDepth = quoteDepth;
    const listCandidate = /^([ \t]*)(?:[-+*]|(\d{1,9})[.)])[ \t]+/u.exec(fenceLine);
    if (comment === null && listCandidate?.[2] !== undefined && !/^0*1$/u.test(listCandidate[2])
      && /^(?:\x60{3,}|~{3,})/u.test(fenceLine.slice(listCandidate[0].length))) {
      throw new Error("Cannot safely merge an ambiguous numbered-list fence");
    }
    const list = listCandidate?.[2] !== undefined && !/^0*1$/u.test(listCandidate[2]) && !previousBlank && listIndents.length === 0
      ? null : listCandidate;
    if (!blank) {
      while ((listIndents.at(-1) ?? 0) > indentation) listIndents.pop();
    }
    const parentListIndent = listIndents.at(-1) ?? 0;
    const listIndent = list === null ? parentListIndent : list[0].length;
    if (list !== null) {
      listIndents.push(listIndent);
      // A compact list opener can establish several continuation indents on
      // one line. Keep each level so later siblings and code retain their depth.
      const nestedMarker = / {0,3}(?:[-+*]|\d{1,9}[.)]) {1,4}(?! )/yu;
      nestedMarker.lastIndex = listIndent;
      while (nestedMarker.test(fenceLine)) listIndents.push(nestedMarker.lastIndex);
    }
    if (comment === null && indentation >= listIndent + 4 && (previousBlank || indentedCode)) {
      indentedCode = true;
      previousBlank = blank;
      continue;
    }
    if (!blank) indentedCode = false;
    previousBlank = blank;
    const listContent = fenceLine.slice(listIndent);
    if (comment === null && list !== null && /^(?:(?:[-+*]|\d+[.)])[ \t]+|>[ \t]*)+(?:\x60{3,}|~{3,})/u.test(listContent)) {
      throw new Error("Cannot safely merge a fence with mixed list and quote openers");
    }
    const opening = comment === null ? /^ {0,3}(\x60{3,}|~{3,})(.*)$/u.exec(listContent) : null;
    if (opening?.[1] != null && !(opening[1][0] === "\x60" && (opening[2] ?? "").includes("\x60"))) {
      fence = { mark: opening[1][0] ?? "~", width: opening[1].length, quoteDepth, listIndent };
      continue;
    }
    const masked = maskInlineLiterals(line, comment);
    comment = masked.comment;
    const visible = masked.text;
    const matches = /!?\[[^\]\r\n]*\]\(([^)\r\n]*)\)/gu;
    const covered = new Set<number>();
    for (const link of visible.matchAll(matches)) {
      if (link.index === undefined || link[1] === undefined) continue;
      covered.add(link.index + link[0].indexOf("]("));
      const content = link[1].trim();
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
      checks.push(assertMergeLinkTarget(path, oldNote, newNote, retiredNote, resolveLink, movingFiles,
        `${oldNote} body line ${lineIndex + 1} ${link[0]}`, "Markdown link"));
    }
    for (let index = visible.indexOf("]("); index >= 0; index = visible.indexOf("](", index + 2)) {
      if (!covered.has(index)) throw new Error("Cannot safely merge an unsupported Markdown link");
    }
    const containerText = expandTabs(visible.slice(quotePrefix.length)).slice(parentListIndent);
    const referenceText = stripReferenceContainers(containerText);
    // A reference cannot interrupt a plain paragraph. Recognize this only
    // after an unambiguous text line; a heading or fence can end a block.
    const afterPlainText = /^[\p{L}\p{N}][\p{L}\p{N} \t.,!?]*$/u.test(referenceLines[lineIndex - 1] ?? "");
    if (!afterPlainText || deeperQuote || list !== null || referenceText !== containerText && listCandidate === null) {
      referenceLines[lineIndex] = referenceText;
    } else if (!containerText.trimStart().startsWith("[")) {
      referenceLines[lineIndex] = containerText;
    }
    checks.push(assertMergeWikiLinksKeepDestinations(visible, oldNote, newNote, retiredNote, resolveLink, movingFiles, `${oldNote} body line ${lineIndex + 1}`));
    for (const attribute of visible.matchAll(/\b(?:href|src)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]*))/giu)) {
      const raw = attribute[1] ?? attribute[2] ?? attribute[3] ?? "";
      // HTML decodes references (including some without a semicolon) and
      // resolves local paths from the containing note. Only explicit absolute
      // destinations are proven stable here; never rewrite authored bytes.
      if (!absolute(raw)) throw new Error("Cannot safely merge a relative HTML link");
    }
  }
  assertReferenceDestinations(referenceLines);
  return (phase) => { for (const check of checks) check(phase); };
}

function expandTabs(line: string): string {
  let addedColumns = 0;
  return line.replace(/\t/gu, (_tab, offset: number) => {
    const width = 4 - (offset + addedColumns) % 4;
    addedColumns += width - 1;
    return " ".repeat(width);
  });
}

function stripReferenceContainers(line: string): string {
  const container = / {0,3}(?:> ?|(?:[-+*]|\d{1,9}[.)]) {1,4}(?! ))/yu;
  let offset = 0;
  while (container.test(line)) offset = container.lastIndex;
  return line.slice(offset);
}

function assertReferenceDestinations(lines: readonly string[]): void {
  // Labels may contain escaped punctuation and nonblank line breaks. A
  // destination may follow on the next line or be enclosed in angle brackets.
  const definitions = /^ {0,3}\[(?:\\[^\n]|[^[\]\\\n]|\n(?![ \t]*(?:\n|$))){1,999}\]:[ \t]*(?:\n[ \t]*)?(?:<([^<>\n]*)>|(\S+))/gmu;
  for (const match of lines.join("\n").matchAll(definitions)) {
    if (!external(match[1] ?? match[2] ?? "")) {
      throw new Error("Cannot safely merge a relative reference definition");
    }
  }
}

/** Accepts visible prose or a parsed Text/List property value, without YAML escaping. */
export function assertMergeWikiLinksKeepDestinations(
  source: string, oldNote: string, newNote: string, retiredNote: string,
  resolveLink: MergeLinkResolver,
  movingFiles: readonly MergeFileRelocation[] = [],
  location = oldNote,
): MergeLinkCheck {
  const checks: MergeLinkCheck[] = [];
  for (const wiki of source.matchAll(/!?\[\[([^\]\r\n]+)\]\]/gu)) {
    let escapes = 0;
    const opener = wiki.index + wiki[0].indexOf("[[");
    for (let index = opener - 1; index >= 0 && source[index] === "\\"; index -= 1) escapes += 1;
    if (escapes % 2 !== 0) continue;
    const path = ((wiki[1] ?? "").split(/#|\\?\|/u, 1)[0] ?? "").trim();
    if (path === "." || path === ".." || path.startsWith("./") || path.startsWith("../")) {
      throw new Error("Cannot safely merge a relative WikiLink");
    }
    if ((path === "" && !(wiki[1] ?? "").trim().startsWith("#"))
      || /[%\\]|\/{2,}|\/$|(?:^|\/)\.{1,2}(?:\/|$)/u.test(path)) {
      throw new Error(`Cannot prove a WikiLink target survives merge: ${location} ${wiki[0]}`);
    }
    checks.push(assertMergeLinkTarget(path, oldNote, newNote, retiredNote, resolveLink, movingFiles,
      `${location} ${wiki[0]}`, "WikiLink"));
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
  } else if (movingFiles.some(({ from, to }) => selectorMatches(path, from) || selectorMatches(path, to))) {
    throw new Error(`Cannot prove a ${kind} target survives merge: ${location}`);
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

function selectorMatches(selector: string, path: string): boolean {
  const key = selector.replace(/^\/+|\.md$/giu, "").normalize("NFC").toLocaleLowerCase();
  const candidate = path.replace(/\.md$/iu, "").normalize("NFC").toLocaleLowerCase();
  return candidate === key || candidate.endsWith("/" + key);
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

type LiteralBlock = "html" | "obsidian" | "pre" | "code";

function maskInlineLiterals(line: string, initial: LiteralBlock | null) {
  const chars = line.split("");
  let cursor = 0;
  let comment = initial;
  while (cursor < line.length) {
    if (comment !== null) {
      const ending = comment === "html" ? /-->/u : comment === "obsidian" ? /%%/u : new RegExp(`</${comment}\\s*>`, "iu");
      const end = ending.exec(line.slice(cursor));
      const stop = end === null ? line.length : cursor + end.index + end[0].length;
      for (let i = cursor; i < stop; i += 1) chars[i] = " ";
      if (end !== null) comment = null;
      cursor = stop;
      continue;
    }
    let escapes = 0;
    for (let i = cursor - 1; i >= 0 && line[i] === "\\"; i -= 1) escapes += 1;
    const escaped = escapes % 2 !== 0;
    const rawCode = escaped ? null : /^<(pre|code)\b[^>]*>/iu.exec(line.slice(cursor));
    if (rawCode !== null) {
      comment = rawCode[1]!.toLowerCase() as "pre" | "code";
      for (let i = cursor; i < cursor + rawCode[0].length; i += 1) chars[i] = " ";
      cursor += rawCode[0].length;
      continue;
    }
    if (!escaped && (line.startsWith("<!--", cursor) || line.startsWith("%%", cursor))) {
      const isHtml = line.startsWith("<!--", cursor);
      comment = isHtml ? "html" : "obsidian";
      const openingLength = isHtml ? 4 : 2;
      for (let i = cursor; i < cursor + openingLength; i += 1) chars[i] = " ";
      cursor += openingLength;
      continue;
    }
    if (line[cursor] === "\x60") {
      if (escaped) { cursor += 1; continue; }
      let width = 1;
      while (line[cursor + width] === "\x60") width += 1;
      let close = -1;
      for (let i = cursor + width; i < line.length;) {
        if (line[i] !== "\x60") { i += 1; continue; }
        let length = 1;
        while (line[i + length] === "\x60") length += 1;
        if (length === width) { close = i + length; break; }
        i += length;
      }
      if (close >= 0) {
        for (let i = cursor; i < close; i += 1) chars[i] = " ";
        cursor = close;
        continue;
      }
      cursor += width;
      continue;
    }
    cursor += 1;
  }
  return { text: chars.join(""), comment };
}
