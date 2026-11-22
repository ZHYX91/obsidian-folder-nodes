import { describe, expect, it } from "vitest";
import { classifySelectionTableContext, prepareSelectionLink } from "../../src/core/selection-link";

describe("selection link safety", () => {
  it("escapes the wiki-link separator inside one Markdown table cell", () => {
    const lines = ["| before | selected text | after |", "| --- | --- | --- |"];
    const line = lines[0] ?? "";
    const from = { line: 0, ch: line.indexOf("selected") };
    const to = { line: 0, ch: line.indexOf(" text") + 5 };
    const context = classifySelectionTableContext(from, to, lines.join("\n"));
    expect(context).toBe("single-cell");
    expect(prepareSelectionLink("[[Node/Node|selected text]]", "selected text", context)).toBe("[[Node/Node\\|selected text]]");
  });

  it("keeps the ordinary wiki-link separator outside tables", () => {
    const line = "selected text";
    const context = classifySelectionTableContext({ line: 0, ch: 0 }, { line: 0, ch: line.length }, line);
    expect(context).toBe("outside-table");
    expect(prepareSelectionLink("[[Node/Node|selected text]]", line, context)).toBe("[[Node/Node|selected text]]");
  });

  it("fails closed for selections crossing a cell boundary or table row", () => {
    const lines = ["| one | two |", "| --- | --- |", "| three | four |"];
    expect(classifySelectionTableContext(
      { line: 0, ch: 2 },
      { line: 0, ch: 10 },
      lines.join("\n"),
    )).toBe("cross-cell");
    expect(classifySelectionTableContext(
      { line: 0, ch: 2 },
      { line: 2, ch: 4 },
      lines.join("\n"),
    )).toBe("cross-cell");
    expect(() => prepareSelectionLink("[[Node/Node|one | two]]", "one | two", "cross-cell")).toThrow("cross-cell");
  });

  it("distinguishes table alignment syntax from dash-only header and data cells", () => {
    const lines = ["| --- | --- |", "| :--- | ---: |", "| --- | --- |"];
    const classify = (line: number) => classifySelectionTableContext(
      { line, ch: 3 }, { line, ch: 5 }, lines.join("\n"),
    );
    expect(classify(0)).toBe("single-cell");
    expect(classify(1)).toBe("table-structure");
    expect(classify(2)).toBe("single-cell");
    expect(() => prepareSelectionLink("[[Node]]", "---", "table-structure")).toThrow("Table syntax");
  });

  it.each([
    ["| Name |", ":---:"],
    ["> | Name |", "> ---"],
    ["| Name |", "| --- |"],
    ["A | B", ":--- | ---:"],
  ])("protects the parsed separator after %s with %s", (header, separator) => {
    const body = header.startsWith(">") ? "> body" : "body";
    const source = [header, separator, body].join("\n");
    const ch = separator.indexOf("-");
    expect(classifySelectionTableContext({ line: 1, ch }, { line: 1, ch: ch + 1 }, source)).toBe("table-structure");
    const data = body.indexOf("body");
    expect(classifySelectionTableContext({ line: 2, ch: data }, { line: 2, ch: data + 1 }, source)).toBe("single-cell");
    const content = header.indexOf("Name") >= 0 ? header.indexOf("Name") : header.indexOf("A");
    expect(classifySelectionTableContext({ line: 0, ch: content }, { line: 0, ch: content + 1 }, source)).toBe("single-cell");
  });

  it.each([
    ["- A | B", "  --- | ---", 0],
    ["1. > A | B", "   > --- | ---", 3],
  ])("protects the list and quote markers before a parsed table (%s)", (header, separator, marker) => {
    const source = [header, separator].join("\n");
    const content = header.indexOf("A");
    const classify = (ch: number) => classifySelectionTableContext({ line: 0, ch }, { line: 0, ch: ch + 1 }, source);
    expect(classify(marker)).toBe("table-structure");
    expect(classify(content)).toBe("single-cell");
  });

  it.each([
    [["A | B", "| --- |"], 1],
    [["A | B", "--- | --- | ---"], 1],
    [["A | B", ":---:"], 1],
    [["Name", "| --- |"], 1],
    [["    | Name |", "    | --- |"], 1],
    [["~~~markdown", "| Name |", "| --- |", "~~~"], 2],
    [["> A | B", "> | --- |"], 0],
  ] as const)("keeps unmatched or literal table syntax editable (%j)", (lines, line) => {
    const ch = Math.max(0, lines[line]!.indexOf("-"));
    expect(classifySelectionTableContext({ line, ch }, { line, ch: ch + 1 }, lines.join("\n"))).toBe("outside-table");
  });

  it("does not mistake an escaped pipe inside a cell for a boundary", () => {
    const lines = ["| one | two |", "| --- | --- |", "| one \\| literal | two |"];
    const line = lines[2] ?? "";
    expect(classifySelectionTableContext(
      { line: 2, ch: line.indexOf("one") },
      { line: 2, ch: line.indexOf("literal") + "literal".length },
      lines.join("\n"),
    )).toBe("single-cell");
  });

  it("does not treat an ordinary prose pipe as a table", () => {
    const line = "Use a | b as ordinary prose.";
    expect(classifySelectionTableContext(
      { line: 0, ch: line.indexOf("a") },
      { line: 0, ch: line.indexOf("prose") + "prose".length },
      line,
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
