import MarkdownIt from "markdown-it";
import {
  mergeMarkdownOptions, parseMergeMarkdownBlocks, type MergeMarkdownBlocks,
  type MergeMarkdownReferences, type Span, type SpanKind,
} from "./merge-markdown-blocks";

type CustomLiteral = "obsidian" | "pre" | "code";

function collectUnparsedHtml(line: string, targets: string[]): void {
  // Raw HTML blocks go to the browser verbatim, which may recover malformed
  // tags the Markdown lexer did not recognize. Retain the conservative check there.
  for (const match of line.matchAll(/\b(?:href|src)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]*))/giu)) {
    targets.push(match[1] ?? match[2] ?? match[3] ?? "");
  }
}

function projectLiterals(lines: readonly string[], blocks: MergeMarkdownBlocks, original: MergeMarkdownBlocks, projected?: readonly string[]) {
  const visible = Array<string>(lines.length).fill("");
  const htmlTargets: string[] = [];
  const markdown = lines.slice();
  let comment: CustomLiteral | null = null;
  for (let i = 0; i < lines.length; i += 1) {
    const end = blocks.code.get(i);
    if (comment === null && end !== undefined) { i = end - 1; continue; }
    const line = lines[i]!;
    const syntax = projected?.[i] === line ? blocks : original;
    if (comment === null && !syntax.content[i]) continue;
    const spans = syntax.literals.get(i) ?? [];
    if (comment === null && spans.length === 0 && !line.includes("%%")) {
      visible[i] = line;
      if (syntax.rawHtml[i]) collectUnparsedHtml(line, htmlTargets);
      continue;
    }
    const unparsed = syntax.rawHtml[i] && /\b(?:href|src)\s*=/iu.test(line) ? line.split("") : null;
    const visitHtml = (span: Span) => {
      if (span.htmlTargets === undefined) return;
      for (const target of span.htmlTargets) htmlTargets.push(target);
      unparsed?.fill(" ", span.from, span.to);
    };
    const chars = line.split("");
    let projection: string[] | undefined;
    let firstCustom = -1;
    const mask = (from: number, to: number, custom: boolean) => {
      chars.fill(" ", from, to);
      unparsed?.fill(" ", from, to);
      if (custom) {
        if (projection === undefined) { projection = line.split(""); firstCustom = from; }
        projection.fill(" ", from, to);
      }
    };
    let cursor = 0;
    let spanIndex = 0;
    let escaped = false;
    while (cursor < line.length) {
      if (comment !== null) {
        if (comment === "obsidian") {
          const ending = line.indexOf("%%", cursor);
          const stop = ending < 0 ? line.length : ending + 2;
          mask(cursor, stop, true);
          if (ending >= 0) comment = null;
          cursor = stop;
        } else {
          const closeKind: SpanKind = comment === "pre" ? "endPre" : "endCode";
          let endIndex = spanIndex;
          while (endIndex < spans.length && spans[endIndex]!.kind !== closeKind) endIndex += 1;
          const ending = spans[endIndex];
          const stop = ending?.to ?? line.length;
          // Raw HTML blocks still contain active HTML attributes. In an inline
          // HTML element CommonMark additionally parses Markdown links and code spans.
          if (syntax.rawHtml[i]) chars.fill(" ", cursor, stop);
          else for (let p = cursor; p + 1 < stop; p += 1) {
            if (line.startsWith("[[", p)) { chars.fill(" ", p, p + 2); p += 1; }
          }
          while (spanIndex < spans.length && spans[spanIndex]!.from < stop) {
            const inner = spans[spanIndex++]!;
            visitHtml(inner);
            if (inner.kind === "code" || inner.kind === "comment") mask(inner.from, inner.to, false);
            else for (let p = Math.max(cursor, inner.from); p < Math.min(stop, inner.to); p += 1) chars[p] = line[p]!;
          }
          if (ending !== undefined) comment = null;
          cursor = stop;
        }
        continue;
      }
      while (spanIndex < spans.length && spans[spanIndex]!.from < cursor) spanIndex += 1;
      const span = spans[spanIndex];
      if (span !== undefined && span.from === cursor) {
        visitHtml(span);
        if (span.kind === "pre" || span.kind === "codeTag") {
          comment = span.kind === "pre" ? "pre" : "code";
          mask(cursor, span.to, false);
        } else if (span.kind === "code" || span.kind === "comment") mask(cursor, span.to, false);
        cursor = span.to;
        spanIndex += 1;
        escaped = false;
      } else if (!escaped && line.startsWith("%%", cursor)) {
        comment = "obsidian";
        mask(cursor, cursor + 2, true);
        cursor += 2;
      } else {
        escaped = line[cursor] === "\\" && !escaped;
        cursor += 1;
      }
    }
    visible[i] = chars.join("");
    if (unparsed !== null) collectUnparsedHtml(unparsed.join(""), htmlTargets);
    // A leading inline tag still occupies a position in a paragraph. Spaces
    // alone could turn its real suffix into an indented code block.
    if (projection !== undefined) {
      if (projection.some((character) => character.trim() !== "")) projection[firstCustom] = "x";
      markdown[i] = projection.join("");
    }
  }
  return { visible, markdown, comment, htmlTargets };
}

function scan(source: string) {
  const lines = source.split(/\r\n|\r|\n/u);
  const normalized = lines.join("\n");
  const original = parseMergeMarkdownBlocks(normalized, lines);
  let blocks = original;
  let projection = projectLiterals(lines, blocks, original);
  const markdown = projection.markdown.join("\n");
  if (markdown !== normalized) {
    blocks = parseMergeMarkdownBlocks(markdown, projection.markdown);
    projection = projectLiterals(lines, blocks, original, projection.markdown);
    if (projection.markdown.join("\n") !== markdown) throw new Error("Cannot safely merge overlapping Markdown code and literal blocks");
  }
  if (blocks.ambiguousFence !== null) throw new Error(`Cannot safely merge ${blocks.ambiguousFence}`);
  return { blocks, visible: projection.visible, comment: projection.comment, htmlTargets: projection.htmlTargets };
}

export function scanMergeMarkdown(source: string, checkLine?: (visible: string, lineIndex: number) => void) {
  const { blocks, visible, htmlTargets } = scan(source);
  if (checkLine) visible.forEach(checkLine);
  return { references: blocks.references, alwaysDefined: blocks.alwaysDefined, inline: blocks.inline, htmlTargets };
}

/** Host WikiLink spelling is shared by relocation checks and Markdown reference analysis. */
export function* mergeWikiLinks(source: string) {
  // Consume even an incomplete label: every nested [[ would meet the same
  // closing bracket or line end. Only complete, nonempty labels are links.
  for (const wiki of source.matchAll(/!?\[\[([^\]\r\n]*)(\]\])?/gu)) {
    const label = wiki[1];
    if (!label || !wiki[2]) continue;
    let escapes = 0;
    const opener = wiki.index + wiki[0].indexOf("[[");
    for (let index = opener - 1; index >= 0 && source[index] === "\\"; index -= 1) escapes += 1;
    if (escapes % 2 !== 0) continue;
    yield { raw: wiki[0], label, index: wiki.index, opener, end: wiki.index + wiki[0].length };
  }
}

let referenceParser: MarkdownIt | undefined;

/** Only an actual rendered link or image may report the new label. Code spans,
 * comments, explicit destinations and unrelated bracket text keep their syntax. */
export function assertNoNewReferenceBindings(note: MergeMarkdownReferences, other: MergeMarkdownReferences): void {
  if (note.inline.length === 0 || other.references.size === 0) return;
  const added = [...other.references.keys()].filter((label) => !note.alwaysDefined.has(label));
  if (added.length === 0) return;
  // Markdown source replaces NUL with U+FFFD. This marker can only reach a
  // token through one of the supplied definition entries, never an authored URL.
  const marker = "\u0000";
  const references = Object.create(null) as Record<string, { href: string; title: string }>;
  for (const label of note.references.keys()) references[label] = { href: "", title: "" };
  for (const label of added) references[label] = { href: marker, title: "" };
  if (referenceParser === undefined) {
    referenceParser = new MarkdownIt("commonmark", mergeMarkdownOptions);
    referenceParser.inline.ruler.before("link", "obsidian_wiki", (state, silent) => {
      const env = state.env as { source: string; wiki: ReadonlyMap<number, number> };
      const end = state.src === env.source ? env.wiki.get(state.pos) : undefined;
      if (end === undefined) return false;
      if (!silent) state.pending += state.src.slice(state.pos, end);
      state.pos = end;
      return true;
    });
  }
  for (const text of note.inline) {
    const wiki = new Map<number, number>();
    if (text.includes("[[")) for (const link of mergeWikiLinks(text)) {
      wiki.set(link.index, link.end);
      wiki.set(link.opener, link.end);
    }
    const tokens = referenceParser.parseInline(text, { references, source: text, wiki })[0]?.children ?? [];
    if (tokens.some((token) => token.attrGet("href") === marker || token.attrGet("src") === marker)) {
      throw new Error("Cannot merge notes that would activate a reference link or image");
    }
  }
}

/** The same separator checked here is used by the Vault write. A top-level H2
 * followed by a blank line starts a fresh block unless an Obsidian literal remains open. */
export function prepareMergeAppend(targetBody: string, sourceBody: string, name: string, eol: string):
  { suffix: string; target: MergeMarkdownReferences } | null {
  if (!/\S/u.test(sourceBody)) return null;
  const separator = `${eol}${eol}## Merged from ${name}${eol}${eol}`;
  const { blocks, visible, comment } = scan(targetBody + separator);
  const heading = visible.length - 3;
  if (comment !== null || !blocks.headings.has(heading) || !visible[heading]?.startsWith("## ")) {
    throw new Error("Cannot append a node body inside a Markdown literal or container");
  }
  return { suffix: separator + sourceBody, target: blocks };
}
