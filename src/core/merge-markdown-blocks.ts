import MarkdownIt from "markdown-it";

// The block parser owns container continuations and the first definition of each
// label. The inline lexer supplies source ranges for code spans and actual HTML.
export const mergeMarkdownOptions = { html: true, maxNesting: 100 };
export type SpanKind = "code" | "tag" | "comment" | "pre" | "codeTag" | "endPre" | "endCode";
export interface Span { readonly from: number; readonly to: number; readonly kind: SpanKind; readonly htmlTargets?: readonly string[] }
interface Scan { readonly spans: Span[]; readonly htmlBlock: boolean; readonly source: string; readonly lastDirect: number }

// The Markdown lexer already validated this as a whole HTML tag. Consume every
// attribute with its value so text inside an unrelated quoted value stays literal.
function htmlLinkTargets(tag: string): string[] {
  const targets: string[] = [];
  const attributes = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/gu;
  for (const match of tag.slice(tag.search(/[\s/>]/u)).matchAll(attributes)) {
    if (/^(?:href|src)$/iu.test(match[1]!)) targets.push(match[2] ?? match[3] ?? match[4] ?? "");
  }
  return targets;
}

function markdownParser(): MarkdownIt {
  const md = new MarkdownIt("commonmark", mergeMarkdownOptions);
  md.core.ruler.enableOnly(["normalize", "block"]);
  // A successful definition emits no token. Record where that existing rule
  // ended so an immediately following indented code block can be checked.
  const block = md.block.ruler;
  block.disable("reference");
  const otherRules = new Set(block.getRules(""));
  block.enable("reference");
  const reference = block.getRules("").find((rule) => !otherRules.has(rule))!;
  block.at("reference", (state, start, end, silent) => {
    const matched = reference(state, start, end, silent);
    if (matched && !silent) (state.env as { definitionEnds?: Set<number> }).definitionEnds?.add(state.line);
    return matched;
  });
  const ruler = md.inline.ruler;
  // Use the registered lexer to record raw ranges. Text and escape keep the
  // usual precedence; the guard needs only literal tokens, not rendered inline links.
  ruler.enableOnly(["text", "escape", "backticks", "html_inline", "link", "image"]);
  const rules = ruler.getRules("");
  ruler.push("merge_literal_positions", (state, silent) => {
    const from = state.pos;
    const before = state.tokens.length;
    const scan = state.env as Scan;
    const marker = state.src[from];
    if (scan.htmlBlock && marker === "`") return false;
    if ((marker === "[" || marker === "!") && (scan.htmlBlock || from >= scan.lastDirect)) return false;
    if (!rules.some((rule) => rule(state, silent))) return false;
    if (!silent && state.src === scan.source && state.tokens.length > before) {
      const token = state.tokens[state.tokens.length - 1]!;
      let kind: SpanKind | undefined;
      if (token.type === "code_inline") kind = "code";
      if (token.type === "html_inline") {
        if (token.content.startsWith("<!--")) kind = "comment";
        else if (/^<pre(?=[\s/>])/iu.test(token.content)) kind = "pre";
        else if (/^<code(?=[\s/>])/iu.test(token.content)) kind = "codeTag";
        else if (/^<\/pre\s*>$/iu.test(token.content)) kind = "endPre";
        else if (/^<\/code\s*>$/iu.test(token.content)) kind = "endCode";
        else kind = "tag";
      }
      if (kind !== undefined) {
        const htmlTargets = token.type === "html_inline" && /^<\/?[a-z]/iu.test(token.content)
          ? htmlLinkTargets(token.content) : undefined;
        scan.spans.push({ from, to: state.pos, kind, ...(htmlTargets === undefined ? {} : { htmlTargets }) });
      }
      if (token.type === "link_close" || token.type === "image") {
        // Mark the destination and title as a unit. A percent pair or an HTML
        // spelling inside them cannot start a literal that consumes later prose.
        const image = token.type === "image";
        const labelEnd = state.md.helpers.parseLinkLabel(state, from + (image ? 1 : 0), !image);
        if (labelEnd >= 0 && state.src[labelEnd + 1] === "(") scan.spans.push({ from: labelEnd + 1, to: state.pos, kind: "tag" });
      }
    }
    return true;
  });
  ruler.enableOnly("merge_literal_positions");
  md.inline.ruler2.enableOnly([]);
  return md;
}
let parser: MarkdownIt | undefined;

export interface MergeMarkdownReferences {
  readonly references: ReadonlyMap<string, ReadonlySet<string>>;
  readonly alwaysDefined: ReadonlySet<string>;
  readonly inline: readonly string[];
}

export interface MergeMarkdownBlocks extends MergeMarkdownReferences {
  readonly rawHtml: Uint8Array;
  readonly code: Map<number, number>;
  readonly ambiguousFence: string | null;
  readonly content: Uint8Array;
  readonly headings: Set<number>;
  readonly literals: Map<number, Span[]>;
}

// Project parser offsets from container-free inline text back to the authored
// lines. Only leading container markup/indentation and trailing whitespace change.
function addLiteralSpans(md: MarkdownIt, text: string, lines: readonly string[], start: number, end: number,
  htmlBlock: boolean, literals: Map<number, Span[]>): void {
  const lastDirect = text.lastIndexOf("](");
  if (!/[`<]/u.test(text) && !(lastDirect >= 0 && text.includes("%%"))) return;
  const scan: Scan = { spans: [], htmlBlock, source: text, lastDirect };
  md.inline.parse(text, md, scan, []);
  // An unterminated block HTML comment extends to its parser-reported block end.
  const opening = text.trimStart();
  if (htmlBlock && opening.startsWith("<!--") && !scan.spans.some((span) => span.kind === "comment" && span.from === text.length - opening.length)) {
    scan.spans.unshift({ from: text.length - opening.length, to: text.length, kind: "comment" });
  }
  let spanIndex = 0;
  let offset = 0;
  for (const [row, part] of text.split("\n").entries()) {
    const lineIndex = start + row;
    if (lineIndex >= end || spanIndex >= scan.spans.length) break;
    const last = offset + part.length;
    const raw = lines[lineIndex]!;
    const trimmed = part.trimStart();
    const column = raw.indexOf(trimmed);
    const ambiguous = column < 0 || (trimmed !== "" && raw.lastIndexOf(trimmed) !== column);
    let spans = literals.get(lineIndex);
    for (; spanIndex < scan.spans.length; spanIndex += 1) {
      const span = scan.spans[spanIndex]!;
      if (span.from > last) break;
      if (Math.max(offset, span.from) < Math.min(last, span.to)) {
        if (ambiguous) {
          throw new Error("Cannot safely locate a Markdown literal in its source line");
        }
        const shift = column - (part.length - trimmed.length) - offset;
        spans ??= [];
        spans.push({ from: Math.max(0, shift + Math.max(offset, span.from)), to: shift + Math.min(last, span.to),
          kind: span.from < offset && (span.kind === "pre" || span.kind === "codeTag") ? "tag" : span.kind,
          ...(span.htmlTargets === undefined ? {} : { htmlTargets: span.from < offset ? [] : span.htmlTargets }) });
        literals.set(lineIndex, spans);
      }
      if (span.to > last) break;
    }
    offset = last + 1;
  }
}

export function parseMergeMarkdownBlocks(source: string, lines: readonly string[]): MergeMarkdownBlocks {
  parser ??= markdownParser();
  const content = new Uint8Array(lines.length);
  const rawHtml = new Uint8Array(lines.length);
  let alternative: string[] | undefined;
  const headings = new Set<number>();
  const inline: string[] = [];
  const literals = new Map<number, Span[]>();
  const env = { references: Object.create(null) as Record<string, { href: string }>, definitionEnds: new Set<number>() };
  const code = new Map<number, number>();
  let ambiguousFence: string | null = null;
  let listStart = -1;
  let mixedStart = -1;
  let numberedStart = -1;
  const tokens = parser.parse(source, env);
  const emptyItems = new Map<number, number>();
  for (const [index, token] of tokens.entries()) {
    if (token.map === null) continue;
    const [start, end] = token.map;
    // Reference definitions are consumed by the parser. Only leaf content can
    // open a literal region: percent pairs in a definition URL belong to the URL.
    if (token.nesting === 0) content.fill(1, start, end);
    if (token.type === "heading_open" && token.tag === "h2" && token.level === 0) headings.add(start);
    if (token.type === "html_block") rawHtml.fill(1, start, end);
    if (token.type === "inline" && token.content.includes("[") && token.content.includes("]")) inline.push(token.content);
    if (token.type === "inline" || token.type === "html_block") {
      addLiteralSpans(parser, token.content, lines, start, end, token.type === "html_block", literals);
    }
    // At its configured nesting limit markdown-it can skip an entire block.
    if (token.nesting === 1 && token.level + 1 >= mergeMarkdownOptions.maxNesting) {
      throw new Error("Cannot verify merge links beyond the Markdown parser's nesting limit");
    }
    if (token.type === "blockquote_open" || token.type === "list_item_open") {
      if (listStart === start) mixedStart = start;
      if (token.type === "list_item_open") {
        listStart = start;
        if (token.info !== "" && Number(token.info) !== 1) numberedStart = start;
      }
    }
    if (token.type === "list_item_open" && tokens[index + 1]?.type === "list_item_close") emptyItems.set(end, start);
    if (token.type === "code_block" || token.type === "fence") {
      code.set(start, end);
      if (token.type === "code_block" && token.content.includes("]:")) {
        const previous = lines[start - 1] ?? "";
        const item = emptyItems.get(start);
        // cmark may continue an empty item through an indented blank where
        // markdown-it ends it. Ask the parser whether that indentation belongs
        // to this item, then evaluate its contents with the item held open.
        if (item !== undefined && /^[ \t]+$/u.test(previous)) {
          const prefix = lines.slice(item, start);
          prefix[prefix.length - 1] += "probe";
          const owner = parser.parse(prefix.join("\n"), {}).filter((entry) => entry.type === "list_item_open").pop();
          if (owner?.map?.[1] === prefix.length) {
            alternative ??= lines.slice();
            alternative[item] += " probe";
          }
        } else if (env.definitionEnds.has(start) && token.content.trimStart().startsWith("[")) {
          // cmark also accepts indented definitions immediately following a
          // consumed definition. Only the uninterrupted definition prefix can continue it.
          alternative ??= lines.slice();
          for (let i = start; i < end && lines[i]!.trim() !== ""; i += 1) alternative[i] = lines[i]!.trimStart();
        }
      }
      if (token.type === "fence" && (mixedStart === start || numberedStart === start)) {
        ambiguousFence ??= mixedStart === start ? "a fence with mixed list and quote openers" : "an ambiguous numbered-list fence";
      }
    } else if (token.type === "inline") {
      // Preserve the existing host guard for a fence-like numbered marker that
      // did not interrupt an open paragraph. The parser supplies its container-free text.
      if (/^ *(?!0*1[.)])\d{1,9}[.)][ \t]+(?:`{3,}|~{3,})/mu.test(token.content)) {
        ambiguousFence ??= "an ambiguous numbered-list fence";
      }
    }
  }
  const references = new Map<string, Set<string>>();
  for (const [label, { href }] of Object.entries(env.references)) references.set(label, new Set([href]));
  const alwaysDefined = new Set(references.keys());
  if (alternative !== undefined) {
    // Resolve the entire alternative spelling so a shadowed later definition
    // cannot displace the same first definition in the original document.
    const other = { references: Object.create(null) as Record<string, { href: string }> };
    parser.parse(alternative.join("\n"), other);
    for (const label of alwaysDefined) if (other.references[label] === undefined) alwaysDefined.delete(label);
    for (const [label, { href }] of Object.entries(other.references)) {
      const destinations = references.get(label);
      if (destinations === undefined) references.set(label, new Set([href]));
      else destinations.add(href);
    }
  }
  return { references, alwaysDefined, inline, code, ambiguousFence, content, headings, literals, rawHtml };
}
