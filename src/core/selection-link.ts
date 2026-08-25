export interface SourcePosition {
  readonly line: number;
  readonly ch: number;
}

export type SelectionTableContext = "outside-table" | "single-cell" | "cross-cell";

export function classifySelectionTableContext(
  from: SourcePosition,
  to: SourcePosition,
  getLine: (line: number) => string,
): SelectionTableContext {
  const tableLines: { line: number; pipes: number[] }[] = [];
  for (let line = from.line; line <= to.line; line += 1) {
    const source = getLine(line);
    const pipes = unescapedPipeIndices(source);
    if (pipes.length > 0 && isMarkdownTableLine(line, getLine)) tableLines.push({ line, pipes });
  }
  if (tableLines.length === 0) return "outside-table";
  if (from.line !== to.line) return "cross-cell";
  const pipes = tableLines[0]?.pipes ?? [];
  return pipes.some((index) => index >= from.ch && index < to.ch) ? "cross-cell" : "single-cell";
}

export function buildSelectionWikiLink(target: string, label: string, context: SelectionTableContext): string {
  if (context === "cross-cell") throw new Error("A cross-cell selection cannot be converted into one link");
  const normalizedLabel = label.trim().replace(/\s+/gu, " ");
  const escapedLabel = normalizedLabel.replace(/\|/gu, "\\|").replace(/\]/gu, "\\]");
  const separator = context === "single-cell" ? "\\|" : "|";
  return `[[${target}${separator}${escapedLabel}]]`;
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
  return tableDelimiterInDirection(line, -1, getLine) || tableDelimiterInDirection(line + 1, 1, getLine);
}

function tableDelimiterInDirection(start: number, direction: -1 | 1, getLine: (line: number) => string): boolean {
  const maximumScan = 512;
  let count = 0;
  for (let line = start; count < maximumScan && line >= 0; count += 1, line += direction) {
    const source = safeGetLine(line, getLine);
    if (source === null || unescapedPipeIndices(source).length === 0) return false;
    if (isTableDelimiterRow(source)) return true;
  }
  return count === maximumScan;
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
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/u.test(cell));
}
