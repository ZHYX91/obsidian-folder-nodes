import { TFile } from "obsidian";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { VisualService } from "../../src/adapters/visual-service";
import { FakeObsidian } from "../helpers/fake-obsidian";

beforeEach(() => {
  vi.stubGlobal("CSS", {
    supports: (property: string, value?: string) => property === "color" && value === "#ff0000",
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Node Graph visual service boundary", () => {
  it("resolves own, inherited, disabled-inheritance, and fallback visuals", () => {
    const fixture = visualFixture();
    fixture.fake.frontmatters.set("Parent/Parent.md", { icon: "brain" });
    expect(fixture.visuals.resolve(fixture.fake.requireFolder("Parent"))).toEqual({
      accent: null, inheritedFrom: null, kind: "lucide", value: "brain",
    });
    expect(fixture.visuals.resolve(fixture.fake.requireFolder("Parent/Child"))).toEqual({
      accent: null, inheritedFrom: "Parent", kind: "lucide", value: "brain",
    });

    fixture.fake.addFolder("Assets");
    const image = fixture.fake.addFile("Assets/cover.png");
    fixture.fake.app.metadataCache.getFirstLinkpathDest = (link: string) => link === "Assets/cover.png" ? image : null;
    fixture.fake.app.vault.getResourcePath = (file: TFile) => `app://vault/${file.path}`;
    fixture.fake.frontmatters.set("Parent/Parent.md", { icon: "[[Assets/cover.png]]" });
    expect(fixture.visuals.resolve(fixture.fake.requireFolder("Parent"))).toEqual({
      accent: null, inheritedFrom: null, kind: "image", value: "app://vault/Assets/cover.png",
    });

    fixture.fake.frontmatters.set("Parent/Child/Child.md", { icon: "🧠" });
    expect(fixture.visuals.resolve(fixture.fake.requireFolder("Parent/Child"))).toEqual({
      accent: null, inheritedFrom: null, kind: "emoji", value: "🧠",
    });
    fixture.inherits.value = false;
    fixture.fake.frontmatters.set("Parent/Child/Child.md", {});
    expect(fixture.visuals.resolve(fixture.fake.requireFolder("Parent/Child"))).toEqual({
      accent: null, inheritedFrom: null, kind: "fallback", value: "folder",
    });
    expect(fixture.visuals.resolve(fixture.fake.requireFolder("Parent/Missing"))).toEqual({
      accent: null, inheritedFrom: null, kind: "fallback", value: "folder",
    });
  });

  it("normalizes editable candidates and rejects malformed or missing Node Notes", () => {
    const fixture = visualFixture();
    fixture.fake.frontmatters.set("Parent/Child/Child.md", { icon: [" brain ", "🧠"] });
    expect(fixture.visuals.candidates(fixture.fake.requireFolder("Parent/Child"))).toEqual(["brain", "🧠"]);
    fixture.fake.frontmatters.set("Parent/Child/Child.md", { icon: ["brain", 1] });
    expect(() => fixture.visuals.candidates(fixture.fake.requireFolder("Parent/Child"))).toThrow("Unsupported icon property shape");
    expect(() => fixture.visuals.candidates(fixture.fake.requireFolder("Parent/Missing"))).toThrow("Missing node note");
  });

  it("previews local candidates, inherited fallback, and resolved Vault images", () => {
    const fixture = visualFixture();
    expect(fixture.visuals.preview(fixture.fake.requireFolder("Parent/Child"), [])).toEqual({
      accent: null, inheritedFrom: null, kind: "fallback", value: "folder",
    });
    fixture.fake.frontmatters.set("Parent/Parent.md", { icon: "star" });
    expect(fixture.visuals.preview(fixture.fake.requireFolder("Parent/Child"), ["🧠"])).toEqual({
      accent: null, inheritedFrom: null, kind: "emoji", value: "🧠",
    });
    expect(fixture.visuals.preview(fixture.fake.requireFolder("Parent/Child"), [])).toEqual({
      accent: null, inheritedFrom: "Parent", kind: "lucide", value: "star",
    });

    fixture.fake.addFolder("Assets");
    const image = fixture.fake.addFile("Assets/cover.png");
    fixture.fake.app.metadataCache.getFirstLinkpathDest = (link: string) => link === "Assets/cover.png" ? image : null;
    fixture.fake.app.vault.getResourcePath = (file: TFile) => `app://vault/${file.path}`;
    expect(fixture.visuals.preview(fixture.fake.requireFolder("Parent/Child"), ["[[Assets/cover.png]]"])).toEqual({
      accent: null, inheritedFrom: null, kind: "image", value: "app://vault/Assets/cover.png",
    });
    fixture.fake.frontmatters.set("Parent/Parent.md", { icon: "[[Assets/cover.png]]" });
    expect(fixture.visuals.preview(fixture.fake.requireFolder("Parent/Child"), [])).toEqual({
      accent: null, inheritedFrom: "Parent", kind: "image", value: "app://vault/Assets/cover.png",
    });
    expect(fixture.visuals.preview(fixture.fake.requireFolder("Parent/Child"), ["[[Assets/missing.png]]"])).toEqual({
      accent: null, inheritedFrom: "Parent", kind: "image", value: "app://vault/Assets/cover.png",
    });

    fixture.inherits.value = false;
    expect(fixture.visuals.preview(fixture.fake.requireFolder("Parent/Child"), [])).toEqual({
      accent: null, inheritedFrom: null, kind: "fallback", value: "folder",
    });
  });

  it("reports diagnostics and persists or clears validated icon declarations", async () => {
    const fixture = visualFixture();
    const child = fixture.fake.requireFolder("Parent/Child");
    expect(fixture.visuals.diagnostics(["brain", "not-an-icon"])).toEqual({ extraColorCount: 0, unknownCount: 1 });
    expect(fixture.visuals.diagnostics(["brain", "#ff0000", "#ff0000"])).toEqual({ extraColorCount: 1, unknownCount: 0 });
    await expect(fixture.visuals.set(child, ["not-an-icon"])).rejects.toThrow("Unsupported icon value");
    await fixture.visuals.set(child, [" brain "]);
    expect(fixture.fake.frontmatters.get("Parent/Child/Child.md")?.icon).toBe("brain");
    await fixture.visuals.set(child, ["brain", "🧠"]);
    expect(fixture.fake.frontmatters.get("Parent/Child/Child.md")?.icon).toEqual(["brain", "🧠"]);
    await fixture.visuals.set(child, []);
    expect(fixture.fake.frontmatters.get("Parent/Child/Child.md")).not.toHaveProperty("icon");
    await expect(fixture.visuals.set(fixture.fake.requireFolder("Parent/Missing"), ["brain"]))
      .rejects.toThrow("Missing node note");
  });
});

function visualFixture() {
  const fake = new FakeObsidian("Test Vault");
  fake.addFolder("Parent");
  fake.addFolder("Parent/Child");
  fake.addFolder("Parent/Missing");
  const notes = new Map([
    ["Parent", fake.addFile("Parent/Parent.md")],
    ["Parent/Child", fake.addFile("Parent/Child/Child.md")],
  ]);
  const service = { getCanonicalFile: (path: string) => notes.get(path) ?? null };
  const inherits = { value: true };
  const visuals = new VisualService(fake.app, service, () => inherits.value);
  return { fake, inherits, notes, service, visuals };
}
