export interface NodeGraphCardWidthRecord {
  readonly id: string;
  readonly label: string;
  readonly parentId: string | null;
}

export const NODE_GRAPH_CARD_WIDTH_COMPACT = 144;
export const NODE_GRAPH_CARD_WIDTH_REGULAR = 180;
export const NODE_GRAPH_CARD_WIDTH_WIDE = 220;

const CARD_CHROME_WIDTH = 80;
const NARROW_GLYPH_WIDTH = 7;
const WIDE_GLYPH_WIDTH = 14;
const GRAPHEME_SEGMENTER = new Intl.Segmenter(undefined, { granularity: "grapheme" });

export function nodeGraphSiblingCardWidths(
  records: readonly NodeGraphCardWidthRecord[],
): ReadonlyMap<string, number> {
  const ids = new Set<string>();
  const groups = new Map<string, NodeGraphCardWidthRecord[]>();
  for (const record of records) {
    if (ids.has(record.id)) throw new Error(`Duplicate Node Graph card id: ${record.id}`);
    ids.add(record.id);
    const groupId = record.parentId ?? `\u0000root\u0000${record.id}`;
    const siblings = groups.get(groupId) ?? [];
    siblings.push(record);
    groups.set(groupId, siblings);
  }

  const widths = new Map<string, number>();
  for (const siblings of groups.values()) {
    let required = CARD_CHROME_WIDTH;
    for (const { label } of siblings) required = Math.max(required, requiredCardWidth(label));
    const width = snappedCardWidth(required);
    for (const { id } of siblings) widths.set(id, width);
  }
  return widths;
}

export function nodeGraphCardWidthForLabels(labels: readonly string[]): number {
  let required = CARD_CHROME_WIDTH;
  for (const label of labels) required = Math.max(required, requiredCardWidth(label));
  return snappedCardWidth(required);
}

function requiredCardWidth(label: string): number {
  return CARD_CHROME_WIDTH + estimatedLabelWidth(label);
}

function snappedCardWidth(required: number): number {
  if (required <= NODE_GRAPH_CARD_WIDTH_COMPACT) return NODE_GRAPH_CARD_WIDTH_COMPACT;
  if (required <= NODE_GRAPH_CARD_WIDTH_REGULAR) return NODE_GRAPH_CARD_WIDTH_REGULAR;
  return NODE_GRAPH_CARD_WIDTH_WIDE;
}

export function fitNodeGraphCardLabel(
  label: string,
  maxWidth: number,
  measure: (text: string) => number,
): string {
  if (maxWidth <= 0) return "";
  if (measure(label) <= maxWidth) return label;
  const ellipsis = "…";
  if (measure(ellipsis) > maxWidth) return "";
  const graphemes = Array.from(GRAPHEME_SEGMENTER.segment(label), ({ segment }) => segment);
  let low = 0;
  let high = graphemes.length;
  while (low < high) {
    const candidate = Math.ceil((low + high) / 2);
    if (measure(`${graphemes.slice(0, candidate).join("")}${ellipsis}`) <= maxWidth) low = candidate;
    else high = candidate - 1;
  }
  return `${graphemes.slice(0, low).join("")}${ellipsis}`;
}

function estimatedLabelWidth(label: string): number {
  let width = 0;
  for (const { segment } of GRAPHEME_SEGMENTER.segment(label.trim())) {
    const codePoints = [...segment]
      .map((symbol) => symbol.codePointAt(0))
      .filter((codePoint): codePoint is number => codePoint !== undefined && !isZeroWidth(codePoint));
    if (codePoints.length === 0) continue;
    if (/^\s+$/u.test(segment)) width += 4;
    else width += codePoints.some(isWide) ? WIDE_GLYPH_WIDTH : NARROW_GLYPH_WIDTH;
  }
  return width;
}

function isZeroWidth(codePoint: number): boolean {
  return codePoint === 0x200d
    || (codePoint >= 0x0300 && codePoint <= 0x036f)
    || (codePoint >= 0xfe00 && codePoint <= 0xfe0f)
    || (codePoint >= 0xe0100 && codePoint <= 0xe01ef);
}

function isWide(codePoint: number): boolean {
  return codePoint >= 0x1100 && (
    codePoint <= 0x115f
    || codePoint === 0x2329
    || codePoint === 0x232a
    || (codePoint >= 0x2e80 && codePoint <= 0xa4cf)
    || (codePoint >= 0xac00 && codePoint <= 0xd7a3)
    || (codePoint >= 0xf900 && codePoint <= 0xfaff)
    || (codePoint >= 0xfe10 && codePoint <= 0xfe6f)
    || (codePoint >= 0xff00 && codePoint <= 0xff60)
    || (codePoint >= 0xffe0 && codePoint <= 0xffe6)
    || (codePoint >= 0x1f000 && codePoint <= 0x1faff)
    || (codePoint >= 0x20000 && codePoint <= 0x3fffd)
  );
}
