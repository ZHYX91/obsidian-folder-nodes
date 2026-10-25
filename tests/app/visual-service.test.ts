import { TFile, TFolder } from "obsidian";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { VisualService } from "../../src/adapters/visual-service";
import { NodeService } from "../../src/adapters/node-service";
import { DEFAULT_SETTINGS } from "../../src/shared/settings";
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
  it("keeps Root icon editing available", async () => {
    const fixture = visualFixture();
    const rootNote = fixture.fake.addFile("Test Vault.md", "Root body");
    await fixture.visuals.set(fixture.fake.root, ["⭐"]);
    expect(fixture.fake.frontmatters.get(rootNote.path)?.icon).toBe("⭐");
    expect(fixture.fake.contents.get(rootNote.path)).toContain("Root body");
  });
  it.each(["note", "folder", "rename", "unload", "icon"])("rejects a stale picker after %s changes", async (change) => {
    const fixture = visualFixture();
    const folder = fixture.fake.requireFolder("Parent/Child");
    const note = fixture.fake.requireFile("Parent/Child/Child.md");
    const edit = fixture.visuals.beginEdit(folder);
    if (change === "note") fixture.fake.files.set(note.path, Object.assign(new TFile(), note));
    if (change === "folder") fixture.fake.files.set(folder.path, Object.assign(new TFolder(), folder));
    if (change === "rename") await fixture.fake.app.fileManager.renameFile(folder, "Parent/Renamed");
    if (change === "unload") fixture.service.dispose();
    if (change === "icon") await fixture.fake.app.vault.modify(note, "---\nicon: star\n---\nOther edit");
    const before = new Map(fixture.fake.contents);
    await expect(edit.save(["🧠"])).rejects.toThrow();
    expect(fixture.fake.contents).toEqual(before);
  });

  it.each(["unload", "replacement", "icon"])("rechecks %s inside a delayed mutation callback", async (change) => {
    const fixture = visualFixture();
    const folder = fixture.fake.requireFolder("Parent/Child");
    const note = fixture.fake.requireFile("Parent/Child/Child.md");
    let resume!: () => void;
    const pending = new Promise<void>((resolve) => { resume = resolve; });
    const original = fixture.fake.app.fileManager.processFrontMatter.bind(fixture.fake.app.fileManager);
    const write = vi.spyOn(fixture.fake.app.fileManager, "processFrontMatter").mockImplementation(async (file, update) => {
      await pending;
      await original(file, update);
    });
    const saving = fixture.visuals.beginEdit(folder).save([]);
    await vi.waitFor(() => expect(write).toHaveBeenCalledOnce());
    if (change === "unload") fixture.service.dispose();
    if (change === "replacement") fixture.fake.files.set(note.path, Object.assign(new TFile(), note));
    if (change === "icon") await fixture.fake.app.vault.modify(note, "---\nicon: star\n---\nConcurrent body");
    const before = new Map(fixture.fake.contents);
    const rejection = expect(saving).rejects.toThrow();
    resume();
    await rejection;
    expect(fixture.fake.contents).toEqual(before);
  });

  it("preserves unrelated property changes and lets a new service write after the old one unloads", async () => {
    const fixture = visualFixture();
    const folder = fixture.fake.requireFolder("Parent/Child");
    const note = fixture.fake.requireFile("Parent/Child/Child.md");
    const edit = fixture.visuals.beginEdit(folder);
    await fixture.fake.app.vault.modify(note, "---\ntitle: Keep me\n---\nBody");
    await edit.save(["🧠"]);
    expect(fixture.fake.frontmatters.get(note.path)).toEqual({ title: "Keep me", icon: "🧠" });
    fixture.service.dispose();
    await expect(fixture.visuals.set(folder, ["⭐"])).rejects.toThrow("unloaded");
    const next = new VisualService(fixture.fake.app, new NodeService(fixture.fake.app, () => structuredClone(DEFAULT_SETTINGS)), () => false);
    await next.set(folder, ["⭐"]);
    expect(fixture.fake.frontmatters.get(note.path)?.icon).toBe("⭐");
    expect(fixture.fake.contents.get(note.path)).toContain("Body");
  });
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
  const service = new NodeService(fake.app, () => structuredClone(DEFAULT_SETTINGS));
  const inherits = { value: true };
  const visuals = new VisualService(fake.app, service, () => inherits.value);
  return { fake, inherits, notes, service, visuals };
}
