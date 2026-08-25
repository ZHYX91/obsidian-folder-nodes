import type { NodeVisual, VisualKind } from "./types";

const IMAGE_LINK = /^!?\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]$/u;
const IMAGE_EXTENSION = /\.(?:avif|bmp|gif|jpe?g|png|svg|webp)$/iu;
const EMOJI = /\p{Extended_Pictographic}|\p{Regional_Indicator}/u;
const VISIBLE_GRAPHEME_BASE = /[^\p{White_Space}\p{Cc}\p{Cf}\p{Mn}\p{Me}]/u;
const GRAPHEME_SEGMENTER = new Intl.Segmenter(undefined, { granularity: "grapheme" });

export interface VisualParseOptions {
  iconIds: ReadonlySet<string>;
  isColor: (value: string) => boolean;
}

export interface ParsedVisual {
  kind: Exclude<VisualKind, "fallback" | "color">;
  value: string;
}

export interface ParsedVisualDeclaration {
  bases: ParsedVisual[];
  accent: string | null;
  extraColors: string[];
  unknown: string[];
}

export interface ResolvedVisualDeclaration {
  kind: Exclude<VisualKind, "fallback">;
  value: string;
  accent: string | null;
}

export interface VisualResolveOptions extends VisualParseOptions {
  resolveImage: (linkPath: string) => string | null;
}

export function visualCandidates(raw: unknown): string[] {
  if (typeof raw === "string") return raw.trim() === "" ? [] : [raw.trim()];
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((value) => typeof value === "string" && value.trim() !== "" ? [value.trim()] : []);
}

export function editableVisualCandidates(raw: unknown): string[] | null {
  if (raw === null || raw === undefined) return [];
  if (typeof raw === "string") return raw.trim() === "" ? [] : [raw.trim()];
  if (!Array.isArray(raw) || !raw.every((value) => typeof value === "string")) return null;
  return raw.map((value) => value.trim()).filter((value) => value !== "");
}

function isVisibleGrapheme(candidate: string): boolean {
  const graphemes = Array.from(GRAPHEME_SEGMENTER.segment(candidate), (part) => part.segment);
  return graphemes.length === 1 && VISIBLE_GRAPHEME_BASE.test(graphemes[0] ?? "");
}

export function parseVisualCandidate(value: string, options: VisualParseOptions): ParsedVisual | null {
  const candidate = value.trim();
  const explicitLucide = candidate.startsWith("lucide:") ? candidate.slice(7).trim() : null;
  if (explicitLucide !== null) return options.iconIds.has(explicitLucide) ? { kind: "lucide", value: explicitLucide } : null;
  if (candidate.startsWith("color:")) return null;
  const image = IMAGE_LINK.exec(candidate)?.[1]?.trim();
  if (image !== undefined && IMAGE_EXTENSION.test(image)) return { kind: "image", value: image };
  if (isVisibleGrapheme(candidate)) return { kind: EMOJI.test(candidate) ? "emoji" : "glyph", value: candidate };
  if (options.iconIds.has(candidate)) return { kind: "lucide", value: candidate };
  return null;
}

function parseColorCandidate(value: string, options: VisualParseOptions): string | null {
  const candidate = value.trim();
  const explicit = candidate.startsWith("color:") ? candidate.slice(6).trim() : candidate;
  return options.isColor(explicit) ? explicit : null;
}

export function parseVisualDeclaration(raw: unknown, options: VisualParseOptions): ParsedVisualDeclaration {
  const bases: ParsedVisual[] = [];
  const colors: string[] = [];
  const unknown: string[] = [];

  for (const candidate of visualCandidates(raw)) {
    const color = parseColorCandidate(candidate, options);
    if (color !== null) {
      colors.push(color);
      continue;
    }
    const parsed = parseVisualCandidate(candidate, options);
    if (parsed === null) unknown.push(candidate);
    else bases.push(parsed);
  }

  return {
    bases,
    accent: colors[0] ?? null,
    extraColors: colors.slice(1),
    unknown,
  };
}

export function resolveVisualDeclaration(raw: unknown, options: VisualResolveOptions): ResolvedVisualDeclaration | null {
  const declaration = parseVisualDeclaration(raw, options);
  for (const base of declaration.bases) {
    const value = base.kind === "image" ? options.resolveImage(base.value) : base.value;
    if (value !== null) {
      const accent = base.kind === "glyph" || base.kind === "lucide" ? declaration.accent : null;
      return { ...base, value, accent };
    }
  }
  if (declaration.accent !== null) return { kind: "color", value: declaration.accent, accent: null };
  return null;
}

export function fallbackVisual(): NodeVisual {
  return { kind: "fallback", value: "folder", accent: null, inheritedFrom: null };
}
