export const SYSTEM_EMOJI_FONT = "system" as const;

export const EMOJI_FONT_FAMILIES = [
  "Segoe UI Emoji",
  "Apple Color Emoji",
  "Noto Color Emoji",
  "Twemoji Mozilla",
  "OpenMoji",
] as const;

export type EmojiFontFamily = typeof EMOJI_FONT_FAMILIES[number];
export type EmojiFontPreference = typeof SYSTEM_EMOJI_FONT | EmojiFontFamily;

const SYSTEM_EMOJI_FONT_FAMILIES: readonly EmojiFontFamily[] = [
  "Segoe UI Emoji",
  "Apple Color Emoji",
  "Noto Color Emoji",
];

export function isEmojiFontPreference(value: unknown): value is EmojiFontPreference {
  return value === SYSTEM_EMOJI_FONT || EMOJI_FONT_FAMILIES.some((family) => family === value);
}

export function configuredEmojiFontStack(preference: EmojiFontPreference): string | null {
  if (preference === SYSTEM_EMOJI_FONT) return null;
  const families = [preference, ...SYSTEM_EMOJI_FONT_FAMILIES.filter((family) => family !== preference)];
  return [...families.map((family) => `"${family}"`), "emoji"].join(", ");
}
