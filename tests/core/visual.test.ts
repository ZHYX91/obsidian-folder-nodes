import { describe, expect, it } from "vitest";
import { firstValidVisual, parseVisualCandidate, visualCandidates } from "../../src/core/visual";

const options = { iconIds: new Set(["folder-tree", "brain"]), isColor: (value: string) => value === "#ff0000" };

describe("node visual", () => {
  it("parses list declarations in priority order", () => {
    expect(firstValidVisual(["unknown", "brain", "#ff0000"], options)).toEqual({ kind: "lucide", value: "brain" });
  });
  it("supports emoji, images, explicit lucide, and explicit colors", () => {
    expect(parseVisualCandidate("🧠", options)?.kind).toBe("emoji");
    expect(parseVisualCandidate("[[Assets/cover.png]]", options)).toEqual({ kind: "image", value: "Assets/cover.png" });
    expect(parseVisualCandidate("lucide:folder-tree", options)?.kind).toBe("lucide");
    expect(parseVisualCandidate("color:#ff0000", options)?.kind).toBe("color");
  });
  it("ignores non-string candidates", () => {
    expect(visualCandidates([null, 1, " brain "])).toEqual(["brain"]);
  });
});
