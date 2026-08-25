import { describe, expect, it } from "vitest";
import {
  editableVisualCandidates,
  parseVisualCandidate,
  parseVisualDeclaration,
  resolveVisualDeclaration,
  visualCandidates,
} from "../../src/core/visual";

const options = { iconIds: new Set(["folder-tree", "brain"]), isColor: (value: string) => value === "#ff0000" };

describe("node visual", () => {
  it("uses color as a foreground accent for glyph and Lucide bases", () => {
    expect(resolveVisualDeclaration(["unknown", "brain", "color:#ff0000"], {
      ...options,
      resolveImage: () => null,
    })).toEqual({ kind: "lucide", value: "brain", accent: "#ff0000" });
    expect(resolveVisualDeclaration(["A", "color:#ff0000"], {
      ...options,
      resolveImage: () => null,
    })).toEqual({ kind: "glyph", value: "A", accent: "#ff0000" });
  });
  it("preserves emoji and image pixels and treats color only as their fallback", () => {
    expect(resolveVisualDeclaration(["🧠", "color:#ff0000"], {
      ...options,
      resolveImage: () => null,
    })).toEqual({ kind: "emoji", value: "🧠", accent: null });
    expect(resolveVisualDeclaration(["[[Assets/cover.png]]", "color:#ff0000"], {
      ...options,
      resolveImage: () => "app://vault/Assets/cover.png",
    })).toEqual({ kind: "image", value: "app://vault/Assets/cover.png", accent: null });
    expect(resolveVisualDeclaration(["[[Assets/missing.png]]", "color:#ff0000"], {
      ...options,
      resolveImage: () => null,
    })).toEqual({ kind: "color", value: "#ff0000", accent: null });
  });
  it("supports emoji, one grapheme glyphs, images, and explicit Lucide icons", () => {
    expect(parseVisualCandidate("🧠", options)?.kind).toBe("emoji");
    expect(parseVisualCandidate("文", options)).toEqual({ kind: "glyph", value: "文" });
    expect(parseVisualCandidate("AB", options)).toBeNull();
    expect(parseVisualCandidate("[[Assets/cover.png]]", options)).toEqual({ kind: "image", value: "Assets/cover.png" });
    expect(parseVisualCandidate("lucide:folder-tree", options)?.kind).toBe("lucide");
    expect(parseVisualCandidate("color:#ff0000", options)).toBeNull();
  });
  it("continues within the local list when an image cannot be resolved", () => {
    expect(resolveVisualDeclaration(["[[Assets/missing.svg]]", "lucide:brain"], {
      ...options,
      resolveImage: () => null,
    })).toEqual({ kind: "lucide", value: "brain", accent: null });
  });
  it("uses a standalone color as a circular swatch and reports extra colors without dropping them", () => {
    expect(resolveVisualDeclaration(["color:#ff0000"], { ...options, resolveImage: () => null }))
      .toEqual({ kind: "color", value: "#ff0000", accent: null });
    expect(parseVisualDeclaration(["brain", "color:#ff0000", "#ff0000", "unknown"], options)).toEqual({
      bases: [{ kind: "lucide", value: "brain" }],
      accent: "#ff0000",
      extraColors: ["#ff0000"],
      unknown: ["unknown"],
    });
  });
  it("ignores non-string candidates", () => {
    expect(visualCandidates([null, 1, " brain "])).toEqual(["brain"]);
    expect(editableVisualCandidates([null, "brain"])).toBeNull();
    expect(editableVisualCandidates({ source: "icon.svg" })).toBeNull();
    expect(editableVisualCandidates([" brain ", "color:#ff0000"])).toEqual(["brain", "color:#ff0000"]);
  });
});
