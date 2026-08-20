import type { NamingPart } from "./types";
import { sanitizeNodeName } from "./paths";

export interface NamingContext {
  selection: string;
  currentFile: string;
  currentNode: string;
  currentHeading: string;
  now: Date;
}

export function formatTimestamp(date: Date, format: string): string {
  const pad = (value: number) => value.toString().padStart(2, "0");
  const replacements: Record<string, string> = {
    "%Y": date.getFullYear().toString(),
    "%m": pad(date.getMonth() + 1),
    "%d": pad(date.getDate()),
    "%H": pad(date.getHours()),
    "%M": pad(date.getMinutes()),
    "%S": pad(date.getSeconds()),
  };
  return Object.entries(replacements).reduce(
    (result, [token, value]) => result.replaceAll(token, value),
    format,
  );
}

function resolvePart(part: NamingPart, context: NamingContext, timestampFormat: string): string {
  if (!part.enabled) return "";
  switch (part.source) {
    case "current-file": return context.currentFile;
    case "current-node": return context.currentNode;
    case "current-heading": return context.currentHeading;
    case "timestamp": return formatTimestamp(context.now, timestampFormat);
    case "custom": return part.customText;
  }
}

export function buildNodeName(
  context: NamingContext,
  prefix: NamingPart,
  suffix: NamingPart,
  timestampFormat: string,
): string {
  const before = resolvePart(prefix, context, timestampFormat).trim();
  const selected = context.selection.trim();
  const after = resolvePart(suffix, context, timestampFormat).trim();
  return sanitizeNodeName([
    before === "" ? "" : `${before}${prefix.separator}`,
    selected,
    after === "" ? "" : `${suffix.separator}${after}`,
  ].join(""));
}
