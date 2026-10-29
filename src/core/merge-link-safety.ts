export interface MergeWikiLinkTarget {
  readonly path: string;
  readonly identity: unknown;
}

export interface MergeFileRelocation {
  readonly from: string;
  readonly to: string;
}

export type MergeWikiLinkResolver = (path: string, sourcePath: string) => MergeWikiLinkTarget | null;
export type MergeLinkCheck = () => void;

/**
 * Reject location-sensitive link syntax before a Node merge moves any files.
 * A relative link is safe unchanged only if its referenced child moves with
 * the source folder to the exact path it will resolve to from the new note.
 * This is intentionally a fail-closed guard, not an unproved Markdown rewrite.
 */
export function assertMergeLinksKeepDestinations(
  source: string, oldNote: string, newNote: string,
  sourceFolder: string, targetFolder: string, retiredNote: string,
  resolveWikiLink: MergeWikiLinkResolver = () => null,
  movingFiles: readonly MergeFileRelocation[] = [],
): MergeLinkCheck {
  if (oldNote === newNote) return () => undefined;
  const wikiChecks: MergeLinkCheck[] = [];
  let fence: { mark: string; width: number; quoteDepth: number; listIndent: number } | null = null;
  let comment: LiteralBlock | null = null;
  let previousBlank = true;
  let indentedCode = false;
  let listIndents: number[] = [];
  let listQuoteDepth = 0;
  for (const [lineIndex, line] of source.split(/\r\n|\r|\n/u).entries()) {
    const quotePrefix = /^ {0,3}(?:>[ \t]?)+/u.exec(line)?.[0] ?? "";
    const quoteDepth = quotePrefix.split(">").length - 1;
    const fenceLine = line.slice(quotePrefix.length);
    if (fence !== null && quoteDepth < fence.quoteDepth) fence = null;
    if (fence !== null) {
      const boundPrefix = fence.quoteDepth === 0 ? "" : new RegExp(`^ {0,3}(?:>[ \\t]?){${fence.quoteDepth}}`, "u").exec(line)?.[0] ?? "";
      const content = line.slice(boundPrefix.length).replaceAll("\t", "    ");
      const indentation = /^[ ]*/u.exec(content)?.[0].length ?? 0;
      if (content.trim() !== "" && indentation < fence.listIndent) fence = null;
      else {
        const close = new RegExp("^ {0,3}" + fence.mark + "{" + fence.width + ",}[ \\t]*$", "u");
        if (close.test(content.slice(fence.listIndent))) fence = null;
        continue;
      }
    }
    const blank = /^\s*$/u.test(fenceLine);
    const indentation = /^[ \t]*/u.exec(fenceLine)?.[0].replaceAll("\t", "    ").length ?? 0;
    if (quoteDepth !== listQuoteDepth) listIndents = [];
    listQuoteDepth = quoteDepth;
    const listCandidate = /^([ \t]*)(?:[-+*]|(\d{1,9})[.)])[ \t]+/u.exec(fenceLine);
    if (comment === null && listCandidate?.[2] !== undefined && listCandidate[2] !== "1"
      && /^(?:\x60{3,}|~{3,})/u.test(fenceLine.slice(listCandidate[0].length))) {
      throw new Error("Cannot safely merge an ambiguous numbered-list fence");
    }
    const list = listCandidate?.[2] !== undefined && listCandidate[2] !== "1" && !previousBlank && listIndents.length === 0
      ? null : listCandidate;
    if (!blank) {
      while ((listIndents.at(-1) ?? 0) > indentation) listIndents.pop();
      if (list !== null) listIndents.push(list[0].replaceAll("\t", "    ").length);
    }
    const listIndent = listIndents.at(-1) ?? 0;
    if (comment === null && indentation >= listIndent + 4 && (previousBlank || indentedCode)) {
      indentedCode = true;
      previousBlank = blank;
      continue;
    }
    if (!blank) indentedCode = false;
    previousBlank = blank;
    const listContent = fenceLine.replaceAll("\t", "    ").slice(listIndent);
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
      if (raw === "" || absolute(raw)) continue;
      if (/[%\\()\s]/u.test(raw)) throw new Error("Cannot safely merge an ambiguous relative Markdown link");
      if (raw.startsWith("#") || raw.includes("?")) throw new Error("Cannot safely merge a relative anchor or query");
      const path = raw.split("#", 1)[0] ?? "";
      const before = resolve(oldNote, path);
      if (before === retiredNote) throw new Error("Cannot merge a link to the removed Node Note");
      const moved = before.startsWith(sourceFolder + "/")
        ? targetFolder + before.slice(sourceFolder.length) : before;
      if (moved !== resolve(newNote, path)) {
        throw new Error("Merge would change a relative link target: " + raw);
      }
    }
    for (let index = visible.indexOf("]("); index >= 0; index = visible.indexOf("](", index + 2)) {
      if (!covered.has(index)) throw new Error("Cannot safely merge an unsupported Markdown link");
    }
    // An empty first line can continue its destination on the next line.
    // Refuse that unsupported form at the opener, before any merge effects.
    const definition = /^ {0,3}\[[^\]\r\n]+\]:[ \t]*(\S*)/u.exec(visible);
    if (definition?.[1] != null && !absolute(definition[1])) {
      throw new Error("Cannot safely merge a relative reference definition");
    }
    wikiChecks.push(assertMergeWikiLinksKeepDestinations(visible, oldNote, newNote, retiredNote, resolveWikiLink, movingFiles, `${oldNote} body line ${lineIndex + 1}`));
    if (/\b(?:href|src)\s*=\s*["']?\.{1,2}\//iu.test(visible)) {
      throw new Error("Cannot safely merge a relative HTML link");
    }
  }
  return () => { for (const check of wikiChecks) check(); };
}

/** Accepts visible prose or a parsed Text/List property value, without YAML escaping. */
export function assertMergeWikiLinksKeepDestinations(
  source: string, oldNote: string, newNote: string, retiredNote: string,
  resolveWikiLink: MergeWikiLinkResolver,
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
    const destination = path === "" ? { path: oldNote, identity: null } : resolveWikiLink(path, oldNote);
    if (destination?.path === retiredNote || path.replace(/\.md$/iu, "") === retiredNote.replace(/\.md$/iu, "")) {
      throw new Error(`Cannot merge a WikiLink to the removed Node Note: ${location} ${wiki[0]}`);
    }
    // A subpath-only link in a moving child remains that child's self-link.
    // Nonempty selectors are host best-match queries. Do not pretend the
    // pre-move resolver can prove how a relocated competitor will resolve.
    if (path === "") {
      if (!(wiki[1] ?? "").trim().startsWith("#")) throw new Error(`Cannot prove a WikiLink target survives merge: ${location} ${wiki[0]}`);
      continue;
    }
    if (destination === null || /[%\\]|\/{2,}|\/$|(?:^|\/)\.{1,2}(?:\/|$)/u.test(path)
      || movingFiles.some(({ from, to }) => destination.path === from || wikiSelectorMatches(path, from) || wikiSelectorMatches(path, to))) {
      throw new Error(`Cannot prove a WikiLink target survives merge: ${location} ${wiki[0]}`);
    }
    const check = () => {
      const next = resolveWikiLink(path, newNote);
      if (next === null || next.path !== destination.path || next.identity !== destination.identity) {
        throw new Error(`Merge would change a WikiLink target: ${location} ${wiki[0]}`);
      }
    };
    check();
    checks.push(check);
  }
  // Retain original identities; never re-resolve old contexts after moving.
  return () => { for (const check of checks) check(); };
}

function wikiSelectorMatches(selector: string, path: string): boolean {
  const key = selector.replace(/^\/+|\.md$/giu, "").normalize("NFC").toLocaleLowerCase();
  const candidate = path.replace(/\.md$/iu, "").normalize("NFC").toLocaleLowerCase();
  return candidate === key || candidate.endsWith("/" + key);
}

function absolute(path: string): boolean {
  return path.startsWith("/") || /^[A-Za-z][A-Za-z0-9+.-]*:/u.test(path);
}

function resolve(filePath: string, relative: string): string {
  const result = filePath.split("/").slice(0, -1);
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
