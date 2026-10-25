import { describe, expect, it } from "vitest";
import { assertMergeLinksKeepDestinations } from "../../src/core/merge-link-safety";

const assertSafe = (source: string) => assertMergeLinksKeepDestinations(
  source, "A/A.md", "Deep/B/B.md", "A", "Deep/B", "A/A.md",
);

describe("Node merge link preflight", () => {
  it.each(["[[A/A]]", "[[A/A.md]]", "[[A/A|Alias]]", "[[A/A#Heading]]", "![[A/A#^block]]", "[[#Heading]]", "[[A/A\\|Alias]]", "\\![[A/A]]"])(
    "rejects a WikiLink whose source note will be removed: %s", (source) => {
      expect(() => assertSafe(source)).toThrow("WikiLink to the removed Node Note: A/A.md body line 1");
    },
  );
  it("uses the host resolver for a basename target and leaves unrelated targets alone", () => {
    const resolve = (path: string) => path === "A" ? "A/A.md" : "Other/Other.md";
    expect(() => assertMergeLinksKeepDestinations("[[A|Alias]]", "A/sub.md", "Deep/B/sub.md", "A", "Deep/B", "A/A.md", resolve))
      .toThrow("removed Node Note: A/sub.md body line 1");
    expect(() => assertMergeLinksKeepDestinations("[[Other]]", "A/A.md", "Deep/B/B.md", "A", "Deep/B", "A/A.md", resolve))
      .not.toThrow();
  });
  it("ignores literal WikiLinks in code, comments, and escaped openers", () => {
    expect(() => assertSafe([
      "~~~md", "[[A/A]]", "~~~", "`![[A/A]]`", "<!-- [[A/A]] -->", "%% [[A/A]] %%",
      "> ~~~md", "> [[A/A]]", "> ~~~", "\\[[A/A]]",
      "", "    [[A/A]]", "", "<pre>[[A/A]]</pre>", "<code>[[A/A]]</code>",
      "<!--", "2. ~~~", "[[A/A]]", "-->",
    ].join("\n"))).not.toThrow();
  });
  it("ends a quoted code fence when its quote ends and still checks list continuations", () => {
    expect(() => assertSafe("> ~~~\n> example\n\n[[A/A]]")).toThrow("removed Node Note");
    expect(() => assertSafe("- Item\n\n    [[A/A]]")).toThrow("removed Node Note");
    expect(() => assertSafe("<pre>example</pre> [[A/A]]")).toThrow("removed Node Note");
    expect(() => assertSafe("<PRE>example</PRE > [[A/A]]")).toThrow("removed Node Note");
    expect(() => assertSafe("\\<pre>[[A/A]]</pre>")).toThrow("removed Node Note");
    expect(() => assertSafe("~~~\n> example\n~~~\n[[A/A]]")).toThrow("removed Node Note");
    expect(() => assertSafe("> ~~~\n> > ~~~\n> [[A/A]]\n> ~~~")).not.toThrow();
    expect(() => assertSafe("- ~~~\n  [[A/A]]\n  ~~~")).not.toThrow();
    expect(() => assertSafe("- Example\n\n  ~~~\n  literal\n- Actual link\n  [[A/A]]")).toThrow("removed Node Note");
    expect(() => assertSafe("> - Example\n>\n>   ~~~\n>   literal\n> - Actual link\n>   [[A/A]]")).toThrow("removed Node Note");
    expect(() => assertSafe("Paragraph\n2. ~~~\n   [[A/A]]")).toThrow("numbered-list fence");
    expect(() => assertSafe("- Item\n  Continuing paragraph\n  2. ~~~\n     [[A/A]]")).toThrow("numbered-list fence");
    expect(() => assertSafe("1234567890. ~~~\n            [[A/A]]")).toThrow("removed Node Note");
    expect(() => assertSafe("- > ~~~\n  > literal\n  > ~~~\n[[A/A]]")).toThrow("mixed list and quote");
    expect(() => assertSafe("- - ~~~\n    literal\n    ~~~\n  [[A/A]]")).toThrow("mixed list and quote");
  });
  it("rejects a cross-directory relative target before merging", () => {
    expect(() => assertSafe("[reference](../Reference.md)")).toThrow("change a relative link target");
    expect(() => assertSafe("![image](../Image.png)")).toThrow("change a relative link target");
  });
  it("allows references to child files moved to equivalent relative paths", () => {
    expect(() => assertSafe("[asset](asset.bin) ![image](sub/pic.png)")).not.toThrow();
    expect(() => assertMergeLinksKeepDestinations(
      "[sibling](../other.md)", "A/sub/page.md", "Deep/B/sub/page.md", "A", "Deep/B", "A/A.md",
    )).not.toThrow();
  });
  it("does not mistake fenced, inline code, or comments for references", () => {
    const quote = String.fromCharCode(96);
    expect(() => assertSafe([
      "~~~", "[hidden](../Reference.md)", "~~~",
      quote + "[hidden](../Reference.md)" + quote,
      "<!-- [hidden](../Reference.md) -->",
      "%% [hidden](../Reference.md) %%",
    ].join("\n"))).not.toThrow();
  });
  it("fails closed on ambiguous reference and hyperlink syntax", () => {
    expect(() => assertSafe("[ref]: ../Reference.md")).toThrow("reference definition");
    expect(() => assertSafe("[[../Reference]]")).toThrow("relative WikiLink");
    expect(() => assertSafe('<a href="../Reference.md">a</a>')).toThrow("relative HTML link");
    expect(() => assertSafe("[link](../Some%20File.md)")).toThrow("ambiguous");
  });

  it.each([
    "[ref]\n\n[ref]:\n  ../Reference.md",
    "[ref]\r\n\r\n[ref]:\r\n  <../Reference.md>",
    "[ref]:\n  ../Reference.md \"title\"",
  ])("refuses a reference definition whose destination starts on the next line: %s", (source) => {
    expect(() => assertSafe(source)).toThrow("reference definition");
  });
});
