/** Complete translated interface catalogs. English and Simplified Chinese live in i18n.ts. */
import { zhTW } from "./locales/zh-TW";
import { ja } from "./locales/ja";
import { ko } from "./locales/ko";
import { de } from "./locales/de";
import { fr } from "./locales/fr";
import { es } from "./locales/es";
import { ptBR } from "./locales/pt-BR";
import { ru } from "./locales/ru";
import { vi } from "./locales/vi";
import { ar } from "./locales/ar";

export const LANGUAGE_OVERRIDES: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  "zh-TW": zhTW,
  "ja": ja,
  "ko": ko,
  "de": de,
  "fr": fr,
  "es": es,
  "pt-BR": ptBR,
  "ru": ru,
  "vi": vi,
  "ar": ar,
};
