import type { NodeVisual, VisualKind } from "./types";

const IMAGE_LINK = /^!?\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]$/u;
const IMAGE_EXTENSION = /\.(?:avif|bmp|gif|jpe?g|png|svg|webp)$/iu;
const EMOJI = /\p{Extended_Pictographic}/u;

export interface VisualParseOptions {
  iconIds: ReadonlySet<string>;
  isColor: (value: string) => boolean;
}

export interface ParsedVisual {
  kind: Exclude<VisualKind, "fallback">;
  value: string;
}

export function visualCandidates(raw: unknown): string[] {
  if (typeof raw === "string") return raw.trim() === "" ? [] : [raw.trim()];
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((value) => typeof value === "string" && value.trim() !== "" ? [value.trim()] : []);
}

export function parseVisualCandidate(value: string, options: VisualParseOptions): ParsedVisual | null {
  const candidate = value.trim();
  const explicitLucide = candidate.startsWith("lucide:") ? candidate.slice(7).trim() : null;
  if (explicitLucide !== null) return options.iconIds.has(explicitLucide) ? { kind: "lucide", value: explicitLucide } : null;
  const explicitColor = candidate.startsWith("color:") ? candidate.slice(6).trim() : null;
  if (explicitColor !== null) return options.isColor(explicitColor) ? { kind: "color", value: explicitColor } : null;
  const image = IMAGE_LINK.exec(candidate)?.[1]?.trim();
  if (image !== undefined && IMAGE_EXTENSION.test(image)) return { kind: "image", value: image };
  if (EMOJI.test(candidate)) return { kind: "emoji", value: candidate };
  if (options.iconIds.has(candidate)) return { kind: "lucide", value: candidate };
  if (options.isColor(candidate)) return { kind: "color", value: candidate };
  return null;
}

export function firstValidVisual(raw: unknown, options: VisualParseOptions): ParsedVisual | null {
  for (const candidate of visualCandidates(raw)) {
    const parsed = parseVisualCandidate(candidate, options);
    if (parsed !== null) return parsed;
  }
  return null;
}

export function fallbackVisual(): NodeVisual {
  return { kind: "fallback", value: "folder", inheritedFrom: null };
}
