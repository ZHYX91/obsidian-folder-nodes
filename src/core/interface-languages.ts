/** Interface language choices: independent of document and node content. */
export const INTERFACE_LOCALE_LABELS = {
  "zh-CN": "简体中文",
  "en": "English",
  "zh-TW": "繁體中文",
  "ja": "日本語",
  "ko": "한국어",
  "de": "Deutsch",
  "fr": "Français",
  "es": "Español",
  "pt-BR": "Português (Brasil)",
  "ru": "Русский",
  "vi": "Tiếng Việt",
  "ar": "العربية"
} as const;
export type AvailableInterfaceLocale = keyof typeof INTERFACE_LOCALE_LABELS;
export const AVAILABLE_INTERFACE_LOCALES = Object.keys(INTERFACE_LOCALE_LABELS) as AvailableInterfaceLocale[];
export function isInterfaceLanguage(value: unknown): value is AvailableInterfaceLocale | "auto" {
  return value === "auto" || (typeof value === "string" && Object.hasOwn(INTERFACE_LOCALE_LABELS, value));
}
export function languageOptions(auto: string): Record<string, string> {
  return { auto, ...INTERFACE_LOCALE_LABELS };
}
