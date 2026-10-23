import { describe, expect, it } from "vitest";
import { assertMergeLinksKeepDestinations } from "../../src/core/merge-link-safety";

const assertSafe = (source: string) => assertMergeLinksKeepDestinations(
  source, "A/A.md", "Deep/B/B.md", "A", "Deep/B", "A/A.md",
);

describe("Node merge link preflight", () => {
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
