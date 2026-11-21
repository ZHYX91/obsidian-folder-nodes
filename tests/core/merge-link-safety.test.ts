import { describe, expect, it, vi } from "vitest";
import { assertMergeLinksKeepDestinations } from "../../src/core/merge-link-safety";

import { scanMergeMarkdown } from "../../src/core/merge-markdown";

const assertSafe = (source: string) => assertMergeLinksKeepDestinations(
  source, "A/A.md", "Deep/B/B.md", "A/A.md",
);

describe("Node merge link preflight", () => {
  it.each(["[[A/A]]", "[[A/A.md]]", "[[A/A|Alias]]", "[[A/A#Heading]]", "![[A/A#^block]]", "[[#Heading]]", "[[A/A\\|Alias]]", "\\![[A/A]]"])(
    "rejects a WikiLink whose source note will be removed: %s", (source) => {
      expect(() => assertSafe(source)).toThrow("WikiLink to the removed Node Note: A/A.md body line 1");
    },
  );
  it("uses the host resolver for a basename target and leaves unrelated targets alone", () => {
    const identity = {};
    const resolve = (path: string) => ({ path: path === "A" ? "A/A.md" : "Other/Other.md", identity });
    expect(() => assertMergeLinksKeepDestinations("[[A|Alias]]", "A/sub.md", "Deep/B/sub.md", "A/A.md", resolve))
      .toThrow("removed Node Note: A/sub.md body line 1");
    expect(() => assertMergeLinksKeepDestinations("[[Other]]", "A/A.md", "Deep/B/B.md", "A/A.md", resolve))
      .not.toThrow();
  });
  it.each(["different-path", "same-path-replacement", "unresolved-old", "unresolved-new"])(
    "refuses an unproved destination in the new context: %s", (mode) => {
      const original = {};
      const replacement = {};
      const resolve = vi.fn((_path: string, from: string) => {
        if ((mode === "unresolved-old" && from === "A/A.md") || (mode === "unresolved-new" && from === "B/B.md")) return null;
        return { path: mode === "different-path" && from === "B/B.md" ? "B/Reference.md" : "A/Reference.md", identity: mode === "same-path-replacement" && from === "B/B.md" ? replacement : original };
      });
      expect(() => assertMergeLinksKeepDestinations("[[Reference#Heading|Alias]]", "A/A.md", "B/B.md", "A/A.md", resolve)).toThrow(/WikiLink target/u);
      expect(resolve).toHaveBeenCalledWith("Reference", "A/A.md");
      if (mode !== "unresolved-old") expect(resolve).toHaveBeenCalledWith("Reference", "B/B.md");
    },
  );
  it("keeps a host-resolved WikiLink independent of a new Markdown definition", () => {
    const identity = {};
    const resolve = () => ({ path: "Elsewhere/Guide.md", identity });
    for (const wiki of ["[[Guide]]", "![[Guide]]"]) {
      expect(() => assertMergeLinksKeepDestinations(wiki, "A/A.md", "B/B.md", "A/A.md", resolve, [], scanMergeMarkdown("[guide]: https://example.com"))).not.toThrow();
    }
  });
  it("rejects moving targets and future best-match competitors without rewriting", () => {
    const identity = {};
    const resolve = () => ({ path: "Elsewhere/Reference.md", identity });
    for (const source of ["[[Reference]]", "![[Sub/Reference#^block|Alias]]"]) {
      expect(() => assertMergeLinksKeepDestinations(source, "A/A.md", "B/B.md", "A/A.md", resolve,
        [{ from: "A/Sub/Reference.md", to: "B/Sub/Reference.md" }])).toThrow("Cannot prove");
    }
    expect(() => assertMergeLinksKeepDestinations("[[A/asset]]", "A/A.md", "B/B.md", "A/A.md",
      () => ({ path: "A/asset.md", identity }), [{ from: "A/asset.md", to: "B/asset.md" }])).toThrow("Cannot prove");
    expect(() => assertMergeLinksKeepDestinations("[[#Heading]] ![[#^block]]", "A/child.md", "B/child.md", "A/A.md", resolve)).not.toThrow();
  });
  it("preserves lowercase candidate matches beyond Unicode simple folding", () => {
    const fixed = { path: "Elsewhere/Target/İ.md", identity: {} };
    expect(() => assertMergeLinksKeepDestinations("[[Target/İ]]", "A/A.md", "Target/Target.md", "A/A.md",
      () => fixed, [{ from: "A/i\u0307.md", to: "Target/i\u0307.md" }])).toThrow("Cannot prove");
  });

  it.each([["Work/σ", "OtherWork/ς"], ["Ａ", "A"], ["XY", "X\u200bY"], ["Café", "Cafe"]])(
    "keeps a stable target when %s and the projected %s have distinct suffixes", (selector, candidate) => {
      const fixed = { path: "Fixed/" + selector + ".md", identity: {} };
      const check = assertMergeLinksKeepDestinations(`[[${selector}]]`, "A/A.md", "B/B.md", "A/A.md",
        () => fixed, [{ from: "A/" + candidate + ".md", to: "B/" + candidate + ".md" }]);
      expect(() => check("after")).not.toThrow();
    },
  );

  it("retains the original identity for final validation instead of resolving the old context again", () => {
    const original = {};
    let changed = false;
    const resolve = vi.fn((_path: string, from: string) => ({ path: "Other.md", identity: changed && from === "B/B.md" ? {} : original }));
    const validate = assertMergeLinksKeepDestinations("[[Other]]", "A/A.md", "B/B.md", "A/A.md", resolve);
    resolve.mockClear();
    validate("after");
    expect(resolve.mock.calls).toEqual([["Other", "B/B.md"]]);
    changed = true;
    expect(validate).toThrow("change a WikiLink target");
  });
  it.each(["Sub/../Reference", "Sub/./Reference", "Sub//Reference", "Reference/"])(
    "refuses an unproved noncanonical selector before projecting competitors: %s", (path) => {
      expect(() => assertMergeLinksKeepDestinations(`[[${path}]]`, "A/A.md", "B/B.md", "A/A.md",
        () => ({ path: "Fixed/Reference.md", identity: "fixed" }), [{ from: "A/Reference.md", to: "B/Reference.md" }])).toThrow("Cannot prove");
    },
  );
  it.each(["[[|Alias]]", "[[ ]]"])("does not treat an unproved empty selector as a child self-subpath: %s", (source) => {
    expect(() => assertMergeLinksKeepDestinations(source, "A/child.md", "B/child.md", "A/A.md")).toThrow("Cannot prove");
  });
  it("ignores literal WikiLinks in code, comments, and escaped openers", () => {
    expect(() => assertSafe([
      "~~~md", "[[A/A]]", "~~~", "`![[A/A]]`", "<!-- [[A/A]] -->", "%% [[A/A]] %%",
      "> ~~~md", "> [[A/A]]", "> ~~~", "\\[[A/A]]",
      "", "    [[A/A]]", "", "<pre>[[A/A]]</pre>", "<code>[[A/A]]</code>",
      "<!--", "2. ~~~", "[[A/A]]", "-->",
    ].join("\n"))).not.toThrow();
  });
  it("considers links after Obsidian literals and preserves Markdown definition destinations", () => {
    expect(() => assertSafe("%%\n~~~\n%%\n[[A/A]]")).toThrow("removed Node Note");
    expect(() => assertSafe("~~~\n%%\n~~~\n[[A/A]]")).toThrow("removed Node Note");
    expect(() => assertSafe("[ok]: https://example/%%open\n\n[[A/A]]")).toThrow("removed Node Note");
    expect(() => assertSafe("\\``[[A/A]]`")).not.toThrow();
    expect(() => assertSafe("\\`[[A/A]]`")).toThrow("removed Node Note");
  });
  it("checks rendered HTML destinations and Markdown links inside inline HTML code", () => {
    expect(() => assertSafe("<code>[go](local.md)</code>")).toThrow("Markdown link target");
    expect(() => assertSafe('<pre><a href="local.md">go</a></pre>')).toThrow("relative HTML link");
    expect(() => assertSafe('<pre><img src="local.png"></pre>')).toThrow("relative HTML link");
    expect(() => assertSafe("<pre>![photo](local.png)</pre>")).not.toThrow();
    expect(() => assertSafe("<code>`[go](local.md)`</code>")).not.toThrow();
    expect(() => assertSafe("<code-widget>[[A/A]]</code-widget>")).toThrow("removed Node Note");
    expect(() => assertSafe('[go](https://example.com/%% "<code>")\n\n[ref]: local.md')).toThrow("relative reference definition");
    expect(() => assertSafe('<pre><span title="</pre> %%">sample</span></pre>\n\n[go](local.md)')).toThrow("Markdown link target");
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
  it.each([
    [">  > ```", ">  > "],
    [">  > - ```", ">  >   "],
  ])("checks links after a spaced nested quote fence closes: %s", (opening, prefix) => {
    const fence = [opening, `${prefix}[literal](sibling.md) [[Target]]`, prefix + "```"].join("\n");
    expect(() => assertSafe(fence)).not.toThrow();
    expect(() => assertSafe(`${fence}\n${prefix}[open](sibling.md)`)).toThrow("Cannot prove a Markdown link target");
    expect(() => assertSafe(`${fence}\n${prefix}[[Target]]`)).toThrow("Cannot prove a WikiLink target");
  });
  it("rejects a cross-directory relative target before merging", () => {
    for (const link of ["[reference](../Reference.md)", "![image](../Image.png)"]) {
      const identity = {};
      const resolve = (_path: string, from: string) => ({ path: from === "A/A.md" ? "Reference.md" : "Deep/Reference.md", identity });
      expect(() => assertMergeLinksKeepDestinations(link, "A/A.md", "Deep/B/B.md", "A/A.md", resolve)).toThrow("change a Markdown link target");
    }
  });
  it.each(["&#46;&#46;/Reference.md", "&#x2e;&#x2e;/Reference.md", "..&sol;Reference.md", "&#35;section"])(
    "fails closed on entity-encoded relative destinations: %s", (destination) => {
      expect(() => assertSafe(`[reference](${destination})`)).toThrow("entity-encoded");
      expect(() => assertSafe(`![image](<${destination}>)`)).toThrow("entity-encoded");
      expect(() => assertSafe("`[reference](" + destination + ")`")).not.toThrow();
      expect(() => assertSafe(`[reference](https://example.com/${destination})`)).not.toThrow();
    },
  );
  it.each([
    ["A/A.md", "Deep/B/B.md", "asset.bin", "A/asset.bin", "Deep/B/asset.bin"],
    ["A/A.md", "Deep/B/B.md", "sub/pic.png", "A/sub/pic.png", "Deep/B/sub/pic.png"],
    ["A/sub/page.md", "Deep/B/sub/page.md", "../other.md", "A/other.md", "Deep/B/other.md"],
  ])("binds a moved relative target before and after relocation from %s", (oldNote, newNote, path, from, to) => {
    const identity = {};
    let moved = false;
    const resolve = (_path: string, source: string) => source === (moved ? newNote : oldNote) ? { path: moved ? to : from, identity } : null;
    const validate = assertMergeLinksKeepDestinations(`[asset](${path})`, oldNote, newNote, "A/A.md", resolve, [{ from, to }]);
    validate("before");
    moved = true;
    expect(() => validate("after")).not.toThrow();
  });

  it("requires a resolved file instead of treating a lexical relative path as proof", () => {
    expect(() => assertSafe("[asset](asset.bin)")).toThrow("Cannot prove a Markdown link target");
  });
  it.each(["../Reference.md", "&#46;&#46;/Reference.md", "&#x2e&#x2e/Reference.md", "..&sol;Reference.md", "child.md", "#section"])(
    "refuses unproved relative HTML destinations: %s", (destination) => {
      for (const token of [`<a href="${destination}">ref</a>`, `<img src='${destination}'>`, `<img src=${destination}>`]) {
        expect(() => assertSafe(token)).toThrow("relative HTML link");
        expect(() => assertSafe("`" + token + "`")).not.toThrow();
        expect(() => assertSafe("~~~html\n" + token + "\n~~~")).not.toThrow();
      }
      expect(() => assertSafe(`<a href="https://example.com/${destination}">ref</a>`)).not.toThrow();
      expect(() => assertSafe('<img src="/fixed/image.png">')).not.toThrow();
    },
  );
  it("does not mistake fenced, inline code, or comments for references", () => {
    const quote = String.fromCharCode(96);
    expect(() => assertSafe([
      "~~~", "[hidden](../Reference.md)", "~~~",
      quote + "[hidden](../Reference.md)" + quote,
      "<!-- [hidden](../Reference.md) -->",
      "%% [hidden](../Reference.md) %%",
    ].join("\n"))).not.toThrow();
  });
  it.each([
    "- [ref]: ../Reference.md",
    "2) [ref]: ../Reference.md",
    "A paragraph\n01. [ref]: ../Reference.md",
    "# Heading\n2. [ref]: ../Reference.md",
    "- paragraph\n- [ref]: ../Reference.md",
    "paragraph\n> [ref]: ../Reference.md",
    "~~~\ncode\n~~~\n2. [ref]: ../Reference.md",
    "- \t[ref]: ../Reference.md",
    "> - [ref]: ../Reference.md",
    "- > [ref]: ../Reference.md",
    "- - [ref]:\n    ../Reference.md",
    "- -\n      [ref]: ../Reference.md",
    "> paragraph\n-\n    [ref]: ../Reference.md",
    ">\n    > [ref]: ../Reference.md",
    "[ref]: https://example.com invalid trailing title\n\n[ref]: ../Reference.md",
    "10. A list item\n\n    [ref]: ../Reference.md",
  ])("checks reference definitions inside Markdown containers: %s", (source) => {
    expect(() => assertSafe(source)).toThrow("reference definition");
  });

  it.each([
    "- [ref]: https://example.com",
    "- [ref]: <https://example.com/a>",
    "- [ref]:\n  <https://example.com/a>",
    "- [multi\n  line]:\n  https://example.com/a",
    "A paragraph\n2. [ref]: ../Reference.md",
    "- paragraph\n  [ref]: ../Reference.md",
    "- - - example\n\n          [ref]: ../Reference.md",
    "- `[ref]: ../Reference.md`",
    "-     [ref]: ../Reference.md",
    "-\n\n    [ref]: ../Reference.md",
    "1)\n\n    - [ref]: ../Reference.md",
    "    - [ref]: ../Reference.md",
    "- ~~~\n  [ref]: ../Reference.md\n  ~~~",
  ])("allows external or literal reference text in lists: %s", (source) => {
    expect(() => assertSafe(source)).not.toThrow();
  });

  it.each([
    ["-\n  \n    [ref]: ../local.md", false],
    ["1.\n    \n      [ref]: ../local.md", false],
    ["1.\n  \n      [ref]: ../local.md", true],
    ["-\n  \n      [ref]: ../local.md", true],
    ["[guide]: https://example.com\n    [ref]: ../local.md", false],
    ["[guide]: https://example.com\n    > [ref]: ../local.md", true],
    ["[guide]: https://example.com\n    [GUIDE]: ../shadowed.md", true],
    ["[guide]: https://example.com\n    [ref]: https://example.com/other", true],
  ])("preserves the possible first definitions across differing CommonMark indentation interpretations: %j", (body, safe) => {
    if (safe) expect(() => assertSafe(body)).not.toThrow();
    else expect(() => assertSafe(body)).toThrow("relative reference definition");
  });

  it.each([
    ["[Guide   to\n  Straße]: https://one.example", "[guide TO STRASSE]: https://two.example", false],
    ["[Guide]: https://site.example/%%one%%", "[guide]: https://site.example/%%two%%", false],
    ["[Guide]: https://site.example/%%one%%", "[guide]: https://site.example/%%one%%", true],
    ["%%\n\n[guide]: ../hidden.md\n\n%%\n\n[guide]: https://site.example", "[guide]: https://site.example", true],
    ["[Guide]: https://site.example/`one`", "[guide]: https://site.example/`two`", false],
    ["[Guide]: https://one.example", "[guide]: ../unrelated.md", false],
    ["[Guide]: https://one.example", "[other]: ../unrelated.md", true],
    ["[guide]: https://one.example", "[GUIDE]: https://one.example\n[Guide]: https://shadowed.example", true],
    ["[guide]: https://one.example\n[Guide]: ../shadowed.md", "[GUIDE]: https://one.example", true],
    ["[guide]: https://one.example", "[guide]: https://one.example bad title\n\n[guide]: https://changed.example", false],
    ["[guide]: https://one.example", "[guide]: https://one.example \"valid title\"\n\n[guide]: https://shadowed.example", true],
    ["[Guide]: https://one.example", "`[guide]: https://two.example`", true],
  ])("checks normalized labels against the destination body: %s", (source, target, safe) => {
    const preflight = () => assertMergeLinksKeepDestinations(source, "A/A.md", "B/B.md", "A/A.md", undefined, [], scanMergeMarkdown(target));
    if (safe) expect(preflight).not.toThrow();
    else expect(preflight).toThrow("conflicting reference definitions");
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
