import { describe, expect, it } from "vitest";
import { Window } from "happy-dom";

import { RuntimeStyles } from "../../src/ui/runtime-styles";

const CSS = ".folder-nodes-test { color: red; }";

function testDocument(): Document {
  return new Window().document as unknown as Document;
}

describe("RuntimeStyles", () => {
  it("owns exactly one versioned stylesheet and removes it on unload", () => {
    const target = testDocument();
    const styles = new RuntimeStyles(CSS);
    const initialSheets = target.adoptedStyleSheets.length;

    expect(styles.install(target)).toBe(true);
    expect(styles.install(target)).toBe(false);

    expect(target.adoptedStyleSheets).toHaveLength(initialSheets + 1);
    expect(target.adoptedStyleSheets.at(-1)?.cssRules[0]?.cssText).toMatch(
      /--folder-nodes-runtime-style: "fnv1a-[0-9a-f]{8}"/u,
    );
    expect(target.adoptedStyleSheets.at(-1)?.cssRules[1]?.cssText).toContain(
      ".folder-nodes-test",
    );

    styles.removeAll();
    expect(target.adoptedStyleSheets).toHaveLength(initialSheets);
  });

  it("restores its stylesheet when the host removes it", () => {
    const target = testDocument();
    const styles = new RuntimeStyles(CSS);
    expect(styles.install(target)).toBe(true);
    const owned = target.adoptedStyleSheets.at(-1);
    target.adoptedStyleSheets = target.adoptedStyleSheets.filter((sheet) => sheet !== owned);

    expect(styles.install(target)).toBe(true);
    expect(target.adoptedStyleSheets.at(-1)).toBe(owned);
  });

  it("owns independent stylesheets for every workspace document", () => {
    const first = testDocument();
    const second = testDocument();
    const styles = new RuntimeStyles(CSS);

    expect(styles.install(first)).toBe(true);
    expect(styles.install(second)).toBe(true);
    expect(first.adoptedStyleSheets).toHaveLength(1);
    expect(second.adoptedStyleSheets).toHaveLength(1);

    styles.removeAll();
    expect(first.adoptedStyleSheets).toHaveLength(0);
    expect(second.adoptedStyleSheets).toHaveLength(0);
  });

  it("moves its existing stylesheet to the end after a CSS lifecycle event", () => {
    const target = testDocument();
    const styles = new RuntimeStyles(CSS);
    styles.install(target);
    const owned = target.adoptedStyleSheets.at(-1);
    const theme = new target.defaultView!.CSSStyleSheet();
    target.adoptedStyleSheets = [...target.adoptedStyleSheets, theme];

    expect(styles.install(target)).toBe(false);
    expect(target.adoptedStyleSheets.at(-1)).toBe(owned);
  });

  it("rejects an empty authoritative stylesheet", () => {
    expect(() => new RuntimeStyles("  \n")).toThrow("must not be empty");
  });
});
