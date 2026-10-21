import { expect } from "vitest";
import { parseDocument } from "yaml";

/** Independent YAML oracle: never use the plugin's line parser to judge its writes. */
export function parseFrontmatterDocument(source: string): { data: unknown; tail: string } {
  const match = /^(?:\uFEFF)?---[ \t]*(?:\r\n|\n|\r)([\s\S]*?)^(?:---|\.\.\.)[ \t]*(?=\r\n|\n|\r|$)/m.exec(source);
  if (match === null || match.index !== 0) throw new Error("Missing test frontmatter boundaries");
  const document = parseDocument(match[1] ?? "");
  expect(document.errors).toEqual([]);
  return { data: document.toJS() as unknown, tail: source.slice(match[0].length) };
}

export function expectFrontmatterPropertyChanges(
  before: string,
  after: string,
  changes: Record<string, unknown>,
): void {
  const original = parseFrontmatterDocument(before);
  if (original.data === null || typeof original.data !== "object" || Array.isArray(original.data)) {
    throw new Error("Expected a mapping in the test's original frontmatter");
  }
  const result = parseFrontmatterDocument(after);
  expect(result.data).toEqual({ ...original.data, ...changes });
  expect(result.tail).toBe(original.tail);
}
