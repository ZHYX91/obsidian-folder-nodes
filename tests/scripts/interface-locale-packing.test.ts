import path from "node:path";
import { runInNewContext } from "node:vm";

import esbuild from "esbuild";
import { expect, it } from "vitest";

// @ts-expect-error The executable build helper is plain ESM.
import { packInterfaceLocales } from "../../scripts/pack-interface-locales.mjs";
import { LANGUAGE_OVERRIDES } from "../../src/ui/locale-overrides";

it("packs one key table and round-trips the full localized catalogs", async () => {
  const file = path.resolve("src/ui/locale-overrides.ts");
  const packed = await packInterfaceLocales(file);
  const compiled = await esbuild.transform(packed.contents, { format: "cjs" });
  const module: { exports: { LANGUAGE_OVERRIDES?: typeof LANGUAGE_OVERRIDES } } = { exports: {} };
  runInNewContext(compiled.code, { module, exports: module.exports });
  const dictionaries = module.exports.LANGUAGE_OVERRIDES!;
  expect(Object.keys(dictionaries)).toEqual(Object.keys(LANGUAGE_OVERRIDES));
  for (const [locale, messages] of Object.entries(LANGUAGE_OVERRIDES)) {
    expect(Object.fromEntries(Object.entries(dictionaries[locale]!))).toEqual(messages);
    expect(dictionaries[locale]).toBe(dictionaries[locale]);
  }
  expect(packed.contents.match(/"nodeGraphReparentPreview"/gu)).toHaveLength(1);
});
