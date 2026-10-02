import { describe, expect, it } from "vitest";

// @ts-expect-error The documentation checker is an executable ESM module.
import { assertSemanticAnchors, assertTechnicalParity } from "../../scripts/markdown-contract.mjs";

describe("bilingual Markdown contracts", () => {
  it("accepts equivalent emphasis and whitespace but rejects a missing version", () => {
    expect(() => assertSemanticAnchors("Obsidian **1.12.7 or later**", ["Obsidian 1.12.7 or later"], "README")).not.toThrow();
    expect(() => assertSemanticAnchors("Obsidian 1.13 or later", ["Obsidian 1.12.7 or later"], "README")).toThrow("semantic anchor");
  });

  it("accepts translated prose with equivalent technical content", () => {
    expect(() => assertTechnicalParity("- 中文 `rank=N` 1024 [说明](guide.zh-CN.md)", "- English `rank=N` 1024 [Help](guide.en.md)", "pair")).not.toThrow();
  });

  it.each([
    ["`rank=N`", "", "code"],
    ["- item", "item", "lists"],
    ["[Help](guide.md)", "[Help](other.md)", "links"],
    ["1024", "2048", "numbers"],
    ["```ts\nconst value = 1;\n```", "```ts\nconst value = 2;\n```", "fences"],
  ])("rejects missing or altered technical content", (source, translation, field) => {
    expect(() => assertTechnicalParity(source, translation, "pair")).toThrow(`technical ${field}`);
  });
});
