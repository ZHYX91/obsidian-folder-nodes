import type { NamingPart } from "./types";
import { sanitizeNodeName } from "./paths";

export interface NamingContext {
  selection: string;
  currentFile: string;
  currentNode: string;
  currentHeading: string;
  now: Date;
}

export type TimestampFormatter = (date: Date, format: string) => string;

const MOMENT_TOKENS = Object.freeze([
  "YYYY", "GGGG", "MMMM", "dddd", "MMM", "ddd", "SSS",
  "YY", "GG", "MM", "DD", "WW", "HH", "mm", "ss",
  "M", "D", "W", "Q", "H", "m", "s", "A", "a",
].sort((left, right) => right.length - left.length));

/** Validate the documented Obsidian/Moment date-time subset. */
export function isValidMomentTimestampFormat(format: string): boolean {
  if (format.trim() === "") return false;
  for (let index = 0; index < format.length;) {
    const character = format[index] ?? "";
    if (character === "[") {
      const closing = findBracketLiteralEnd(format, index);
      if (closing < 0) return false;
      index = closing + 1;
      continue;
    }
    if (character === "\\") {
      if (format[index + 1] === undefined) return false;
      index += 2;
      continue;
    }
    const token = MOMENT_TOKENS.find((candidate) => format.startsWith(candidate, index));
    if (token !== undefined) {
      index += token.length;
      continue;
    }
    if (/[A-Za-z]/u.test(character)) return false;
    index += 1;
  }
  return true;
}

export function formatTimestamp(date: Date, format: string, formatter: TimestampFormatter): string {
  if (!isValidMomentTimestampFormat(format)) throw new Error("Invalid Obsidian/Moment timestamp format");
  return formatter(date, format);
}

function resolvePart(part: NamingPart, context: NamingContext, formatter: TimestampFormatter): string {
  if (!part.enabled) return "";
  switch (part.source) {
    case "current-file": return context.currentFile;
    case "current-node": return context.currentNode;
    case "current-heading": return context.currentHeading;
    case "timestamp": return formatTimestamp(context.now, part.timestampFormat, formatter);
    case "custom": return part.customText;
  }
}

export function buildNodeName(
  context: NamingContext,
  prefix: NamingPart,
  suffix: NamingPart,
  formatter: TimestampFormatter,
): string {
  const before = resolvePart(prefix, context, formatter).trim();
  const selected = context.selection.trim();
  const after = resolvePart(suffix, context, formatter).trim();
  return sanitizeNodeName([
    before === "" ? "" : `${before}${prefix.separator}`,
    selected,
    after === "" ? "" : `${suffix.separator}${after}`,
  ].join(""));
}

function findBracketLiteralEnd(format: string, start: number): number {
  for (let index = start + 1; index < format.length; index += 1) {
    if (format[index] === "\\") {
      if (format[index + 1] === undefined) return -1;
      index += 1;
    } else if (format[index] === "]") return index;
  }
  return -1;
}
