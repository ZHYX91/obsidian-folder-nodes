import { describe, expect, it } from "vitest";
import { renderVisual } from "../../src/presentation/render-visual";

describe("visual rendering semantics", () => {
  it("marks CJK glyphs and emoji separately for font and size tuning", () => {
    const container = document.createElement("span");

    renderVisual(container, { kind: "glyph", value: "想", accent: null, inheritedFrom: null }, "Node icon");
    expect(container.classList.contains("is-glyph")).toBe(true);
    expect(container.classList.contains("is-cjk-glyph")).toBe(true);
    expect(container.querySelector(".folder-nodes-visual-glyph")?.textContent).toBe("想");

    renderVisual(container, { kind: "emoji", value: "📓", accent: null, inheritedFrom: null }, "Node icon");
    expect(container.classList.contains("is-emoji")).toBe(true);
    expect(container.classList.contains("is-cjk-glyph")).toBe(false);
    expect(container.querySelector(".folder-nodes-visual-emoji")?.textContent).toBe("📓");
  });

  it("keeps foreground accent metadata and renders lone colors as swatches", () => {
    const container = document.createElement("span");

    renderVisual(container, { kind: "glyph", value: "A", accent: "#4caf50", inheritedFrom: null }, "Node icon");
    expect(container.classList.contains("has-accent")).toBe(true);
    expect(container.style.getPropertyValue("--folder-nodes-visual-accent")).toBe("#4caf50");
    expect(container.querySelector(".folder-nodes-visual-glyph")?.textContent).toBe("A");

    renderVisual(container, { kind: "color", value: "#4caf50", accent: null, inheritedFrom: null }, "Node color");
    expect(container.classList.contains("is-color")).toBe(true);
    expect(container.classList.contains("has-accent")).toBe(false);
    expect((container.querySelector(".folder-nodes-visual-color") as HTMLElement | null)?.style.backgroundColor).toBe("#4caf50");
  });

  it("keeps the current-node icon inside a dedicated left handle", () => {
    const current = document.createElement("button");
    current.className = "folder-nodes-current";
    const container = document.createElement("span");
    container.className = "folder-nodes-current-visual";
    current.append(container);

    renderVisual(container, { kind: "emoji", value: "📓", accent: null, inheritedFrom: null }, "Current node");

    expect(current.style.overflow).toBe("hidden");
    expect(container.style.flex).toBe("0 0 40px");
    expect(container.style.width).toBe("40px");
    expect(container.style.overflow).toBe("hidden");
    expect(container.style.borderInlineEnd).toBe("1px solid var(--background-modifier-border)");
    expect(container.style.getPropertyValue("border-start-start-radius")).toBe("var(--radius-s)");
    expect(container.querySelector<HTMLElement>(".folder-nodes-visual-emoji")?.style.fontSize).toBe("20px");
  });
});
