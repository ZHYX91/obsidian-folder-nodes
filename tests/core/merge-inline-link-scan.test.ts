import { describe, expect, it, vi } from "vitest";
import { assertMergeLinksKeepDestinations, assertMergeWikiLinksKeepDestinations } from "../../src/core/merge-link-safety";

const oldNote = "A/child.md";
const newNote = "B/child.md";
const retiredNote = "A/A.md";

describe("Node merge inline Markdown label boundaries", () => {
  it("finds the next real link after a long unmatched label and closing brackets", () => {
    const resolve = vi.fn((path: string, _sourcePath: string) => ({ path, identity: path }));
    const source = "[a".repeat(8192) + "]".repeat(1024) + "[asset](image.png)";
    const check = assertMergeLinksKeepDestinations(source, oldNote, newNote, retiredNote, resolve);
    check("after");
    expect(resolve.mock.calls).toEqual([["image.png", oldNote], ["image.png", newNote], ["image.png", newNote]]);
  });

  it.each([
    ["an unclosed destination", "[".repeat(16384) + "]("],
    ["a nested destination marker in an external link", "[outer](https://example.test/[inner]()"],
    ["an orphan destination before a valid link", "](orphan) [asset](https://example.test)"],
  ])("rejects %s", (_case, source) => {
    expect(() => assertMergeLinksKeepDestinations(source, oldNote, newNote, retiredNote))
      .toThrow("Cannot safely merge an unsupported Markdown link");
  });

  it("keeps the complete source spelling and line for a nested image label", () => {
    expect(() => assertMergeLinksKeepDestinations("Intro\n!![outer[inner](gone)", oldNote, newNote, retiredNote))
      .toThrow("A/child.md body line 2 ![outer[inner](gone)");
  });

  it("finds complete WikiLinks after unmatched, empty, and escaped labels in a property value", () => {
    const resolve = vi.fn((path: string, _sourcePath: string) => ({ path, identity: path }));
    const source = "[".repeat(16384) + "\r[[incomplete]\n[[]] \\[[escaped]] ![[asset|alias]]";
    const check = assertMergeWikiLinksKeepDestinations(source, oldNote, newNote, retiredNote, resolve);
    check("after");
    expect(resolve.mock.calls).toEqual([["asset", oldNote], ["asset", newNote], ["asset", newNote]]);
  });
});
