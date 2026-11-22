import MarkdownIt from "markdown-it";
import { FolderNodesError } from "./folder-nodes-error";

export interface SourcePosition {
  readonly line: number;
  readonly ch: number;
}

export type SelectionTableContext = "outside-table" | "single-cell" | "cross-cell" | "table-structure";

const tableParser = new MarkdownIt({ html: true });
tableParser.core.ruler.enableOnly(["normalize", "block"]);

export function classifySelectionTableContext(
  from: SourcePosition,
  to: SourcePosition,
  source: string,
): SelectionTableContext {
  if (!source.includes("|")) return "outside-table";
  const lines = source.split(/\r\n|[\r\n]/u);
  // A table's header must contain a pipe and there can be no blank line
  // between it and a selected cell. Skip parsing unrelated prose.
  let first = from.line;
  while (first > 0 && lines[first - 1]?.trim() !== "") first -= 1;
  if (!lines.slice(first, to.line + 1).some((line) => line.includes("|"))) return "outside-table";
  const table = tableParser.parse(source, {}).find((token) => token.type === "table_open"
    && token.map !== null && token.map[0] <= to.line && from.line < token.map[1]);
  if (table?.map) {
    if (from.line !== to.line) return "cross-cell";
    const row = lines[from.line] ?? "";
    if (from.line === table.map[0] + 1 || from.ch < tableContainerPrefixLength(row, from.line === table.map[0])) {
      return "table-structure";
    }
    return unescapedPipeIndices(row).some((index) => index >= from.ch && index < to.ch) ? "cross-cell" : "single-cell";
  }
  // Retain the existing cross-cell safeguard for an incomplete table whose
  // header and separator currently disagree on the number of cells.
  const getLine = (line: number): string => lines[line] ?? "";
  for (let line = from.line; line <= to.line; line += 1) {
    const pipes = unescapedPipeIndices(getLine(line));
    if (pipes.length > 0 && (from.line !== to.line || pipes.some((index) => index >= from.ch && index < to.ch))
      && isMarkdownTableLine(line, getLine)) return "cross-cell";
  }
  return "outside-table";
}

export function prepareSelectionLink(generated: string, label: string, context: SelectionTableContext): string {
  if (context === "cross-cell") throw new Error("A cross-cell selection cannot be converted into one link");
  if (context === "table-structure") throw new Error("Table syntax cannot be converted into a link");
  let link = generated;
  if (generated.startsWith("[[") && generated.endsWith("]]")) {
    // Obsidian's WikiLink renderer treats display text literally. Backslashes
    // cannot protect its opening/closing delimiters, including a trailing ].
    if (label.includes("[[") || label.includes("]]") || label.endsWith("]")) {
      throw new FolderNodesError("selection_wikilink_label_unsafe", {}, "The selected text cannot be represented safely as a WikiLink");
    }
  } else {
    // FileManager supplies the path and raw alias. Escape the original label
    // once, independently of path encoding; never regenerate a relative path.
    const prefix = `[${label}](`;
    if (!generated.startsWith(prefix) || !generated.endsWith(")")) throw new Error("Unsupported generated selection link");
    const target = generated.slice(prefix.length, -1).replaceAll("(", "%28").replaceAll(")", "%29");
    const escapedLabel = label.replace(/[!"#$%&'()*+,\-./:;<=>?@[\]\\^_`{|}~]/gu, "\\$&");
    link = `[${escapedLabel}](${target})`;
  }
  if (context === "single-cell") {
    const pipes = new Set(unescapedPipeIndices(link));
    link = link.split("").map((character, index) => pipes.has(index) ? "\\|" : character).join("");
  }
  return link;
}

/** Obsidian can recalculate the column widths when its native cell editor applies a link. */
export function matchesTableLinkWriteback(expected: string, actual: string, selectionLine: number): boolean {
  if (expected === actual) return true;
  // Keep every physical line ending in the comparison, even inside the table.
  const expectedParts = expected.split(/(\r\n|\r|\n)/u);
  const actualParts = actual.split(/(\r\n|\r|\n)/u);
  if (expectedParts.length !== actualParts.length) return false;
  const rowAt = (parts: readonly string[], line: number) => fullPipeRow(parts[line * 2] ?? "");
  const selected = rowAt(expectedParts, selectionLine);
  if (selected === null) return false;

  let first = selectionLine;
  let last = selectionLine;
  while (rowAt(expectedParts, first - 1)?.prefix === selected.prefix) first -= 1;
  while (rowAt(expectedParts, last + 1)?.prefix === selected.prefix) last += 1;
  const delimiter = first + 1;
  const alignments = delimiterAlignments(rowAt(expectedParts, delimiter)?.cells ?? []);
  if (delimiter > last || delimiter === selectionLine || alignments === null) return false;

  for (let index = 0; index < expectedParts.length; index += 1) {
    const line = index / 2;
    if (index % 2 !== 0 || line < first || line > last) {
      if (expectedParts[index] !== actualParts[index]) return false;
      continue;
    }
    const before = rowAt(expectedParts, line);
    const after = rowAt(actualParts, line);
    if (before?.prefix !== selected.prefix || after?.prefix !== selected.prefix
      || before.cells.length !== alignments.length || after.cells.length !== before.cells.length) return false;
    if (line === delimiter) {
      const actualAlignments = delimiterAlignments(after.cells);
      if (actualAlignments === null || alignments.some((alignment, i) => alignment !== actualAlignments[i])) return false;
    } else {
      // A second delimiter-shaped row makes the table boundary ambiguous.
      if (line > delimiter && delimiterAlignments(before.cells) !== null) return false;
      if (before.cells.some((cell, i) => cell !== after.cells[i])) return false;
    }
  }
  return true;
}

function fullPipeRow(line: string): { prefix: string; cells: string[] } | null {
  const quote = tableQuotePrefix(line);
  const indent = /^[ \t]*/u.exec(line.slice(quote.length))?.[0] ?? "";
  const prefix = quote + indent;
  const body = line.slice(prefix.length);
  const pipes = unescapedPipeIndices(body);
  const last = pipes.at(-1);
  // Limit the padding exception to fully delimited rows. An omitted outer
  // separator would make cell padding indistinguishable from other Markdown.
  if (pipes.length < 2 || pipes[0] !== 0 || last === undefined || !/^[ \t]*$/u.test(body.slice(last + 1))) return null;
  const cells = pipes.slice(1).map((pipe, i) => body.slice(pipes[i]! + 1, pipe).replace(/^[ \t]+|[ \t]+$/gu, ""));
  return { prefix, cells };
}

function delimiterAlignments(cells: readonly string[]): string[] | null {
  return cells.length > 0 && cells.every((cell) => /^:?-+:?$/u.test(cell))
    ? cells.map((cell) => cell.replace(/-+/u, "-")) : null;
}

function unescapedPipeIndices(line: string): number[] {
  const result: number[] = [];
  for (let index = 0; index < line.length; index += 1) {
    if (line[index] !== "|") continue;
    let backslashes = 0;
    for (let cursor = index - 1; cursor >= 0 && line[cursor] === "\\"; cursor -= 1) backslashes += 1;
    if (backslashes % 2 === 0) result.push(index);
  }
  return result;
}

function isMarkdownTableLine(line: number, getLine: (line: number) => string): boolean {
  const quoteDepth = tableQuotePrefix(getLine(line)).split(">").length - 1;
  return tableDelimiterInDirection(line, -1, quoteDepth, getLine) || tableDelimiterInDirection(line + 1, 1, quoteDepth, getLine);
}

function tableDelimiterInDirection(start: number, direction: -1 | 1, quoteDepth: number, getLine: (line: number) => string): boolean {
  const maximumScan = 512;
  let count = 0;
  for (let line = start; count < maximumScan && line >= 0; count += 1, line += direction) {
    const source = safeGetLine(line, getLine);
    if (source === null || unescapedPipeIndices(source).length === 0) return false;
    const prefix = tableQuotePrefix(source);
    if (prefix.split(">").length - 1 !== quoteDepth) return false;
    if (isTableDelimiterRow(source.slice(prefix.length))) return true;
  }
  return count === maximumScan;
}

function tableQuotePrefix(line: string): string {
  return /^(?: {0,3}>[ \t]?)+/u.exec(line)?.[0] ?? "";
}

function tableContainerPrefixLength(line: string, header: boolean): number {
  // A list can start on the header itself. On subsequent rows only the
  // surrounding quote markers can precede the cells.
  const marker = header ? /^[ \t]*(?:>[ \t]?|(?:[-+*]|[0-9]{1,9}[.)])[ \t]+)/u : /^[ \t]*>[ \t]?/u;
  let length = 0;
  for (let prefix = marker.exec(line); prefix !== null; prefix = marker.exec(line.slice(length))) {
    length += prefix[0].length;
  }
  return length;
}

function safeGetLine(line: number, getLine: (line: number) => string): string | null {
  try {
    return getLine(line);
  } catch {
    return null;
  }
}

function isTableDelimiterRow(line: string): boolean {
  const trimmed = line.trim();
  const pipes = unescapedPipeIndices(trimmed);
  if (pipes.length === 0) return false;
  const cells: string[] = [];
  let start = 0;
  for (const pipe of pipes) {
    cells.push(trimmed.slice(start, pipe).trim());
    start = pipe + 1;
  }
  cells.push(trimmed.slice(start).trim());
  if (cells[0] === "") cells.shift();
  if (cells.at(-1) === "") cells.pop();
  return delimiterAlignments(cells) !== null;
}
