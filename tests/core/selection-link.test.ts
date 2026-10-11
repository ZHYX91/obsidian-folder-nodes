import { describe, expect, it } from "vitest";
import { classifySelectionTableContext, prepareSelectionLink } from "../../src/core/selection-link";

describe("selection link safety", () => {
  it("escapes the wiki-link separator inside one Markdown table cell", () => {
    const lines = ["| before | selected text | after |", "| --- | --- | --- |"];
    const line = lines[0] ?? "";
    const from = { line: 0, ch: line.indexOf("selected") };
    const to = { line: 0, ch: line.indexOf(" text") + 5 };
    const context = classifySelectionTableContext(from, to, (lineNumber) => lines[lineNumber] ?? "");
    expect(context).toBe("single-cell");
    expect(prepareSelectionLink("[[Node/Node|selected text]]", "selected text", context)).toBe("[[Node/Node\\|selected text]]");
  });

  it("keeps the ordinary wiki-link separator outside tables", () => {
    const line = "selected text";
    const context = classifySelectionTableContext({ line: 0, ch: 0 }, { line: 0, ch: line.length }, () => line);
    expect(context).toBe("outside-table");
    expect(prepareSelectionLink("[[Node/Node|selected text]]", line, context)).toBe("[[Node/Node|selected text]]");
  });

  it("fails closed for selections crossing a cell boundary or table row", () => {
    const lines = ["| one | two |", "| --- | --- |", "| three | four |"];
    expect(classifySelectionTableContext(
      { line: 0, ch: 2 },
      { line: 0, ch: 10 },
      (lineNumber) => lines[lineNumber] ?? "",
    )).toBe("cross-cell");
    expect(classifySelectionTableContext(
      { line: 0, ch: 2 },
      { line: 2, ch: 4 },
      (lineNumber) => lines[lineNumber] ?? "",
    )).toBe("cross-cell");
    expect(() => prepareSelectionLink("[[Node/Node|one | two]]", "one | two", "cross-cell")).toThrow("cross-cell");
  });

  it("does not mistake an escaped pipe inside a cell for a boundary", () => {
    const lines = ["| one | two |", "| --- | --- |", "| one \\| literal | two |"];
    const line = lines[2] ?? "";
    expect(classifySelectionTableContext(
      { line: 2, ch: line.indexOf("one") },
      { line: 2, ch: line.indexOf("literal") + "literal".length },
      (lineNumber) => lines[lineNumber] ?? "",
    )).toBe("single-cell");
  });

  it("does not treat an ordinary prose pipe as a table", () => {
    const line = "Use a | b as ordinary prose.";
    expect(classifySelectionTableContext(
      { line: 0, ch: line.indexOf("a") },
      { line: 0, ch: line.indexOf("prose") + "prose".length },
      (lineNumber) => lineNumber === 0 ? line : "",
    )).toBe("outside-table");
  });

  it("preserves ordinary WikiLink display punctuation and an omitted alias", () => {
    const label = "one [two] \\ three | four";
    expect(prepareSelectionLink(`[[Node/Node|${label}]]`, label, "outside-table")).toBe(`[[Node/Node|${label}]]`);
    expect(prepareSelectionLink("[[Node]]", "Node", "outside-table")).toBe("[[Node]]");
  });

  it.each(["one [[two", "one ]] two", "one [two]"])("rejects unrepresentable WikiLink label %s", (label) => {
    expect(() => prepareSelectionLink(`[[Node|${label}]]`, label, "outside-table")).toThrow(expect.objectContaining({ code: "selection_wikilink_label_unsafe" }));
  });

  it("escapes a literal Markdown label once and encodes only bare destination parentheses", () => {
    const label = "[one] \\ *two* _three_ | &copy; `four`";
    expect(prepareSelectionLink(`[${label}](Parent/space%20and%28encoded%29(odd.md)`, label, "outside-table"))
      .toBe("[\\[one\\] \\\\ \\*two\\* \\_three\\_ \\| \\&copy\\; \\`four\\`](Parent/space%20and%28encoded%29%28odd.md)");
  });

  it("escapes table pipes idempotently by backslash parity, including after emoji", () => {
    const link = "[[Node|😀 one \\| two \\\\| three]]";
    const label = "😀 one \\| two \\\\| three";
    const prepared = prepareSelectionLink(link, label, "single-cell");
    expect(prepared).toBe("[[Node\\|😀 one \\| two \\\\\\| three]]");
    expect(prepareSelectionLink(prepared, label, "single-cell")).toBe(prepared);
    const markdown = prepareSelectionLink("[one | two](Node.md)", "one | two", "single-cell");
    expect(markdown).toBe("[one \\| two](Node.md)");
  });
});
