import { describe, expect, it } from "vitest";
import { buildNodeName, formatTimestamp } from "../../src/core/naming";
import type { NamingPart } from "../../src/core/types";

const disabled: NamingPart = { enabled: false, source: "custom", separator: "_", customText: "" };
describe("selection naming", () => {
  it("formats deterministic timestamps", () => {
    expect(formatTimestamp(new Date(2026, 7, 21, 1, 2, 3), "%Y%m%d-%H%M%S")).toBe("20260821-010203");
  });
  it("applies configurable prefix, suffix, and separators", () => {
    const prefix: NamingPart = { enabled: true, source: "current-file", separator: "--", customText: "" };
    const suffix: NamingPart = { enabled: true, source: "custom", separator: "__", customText: "fromText" };
    expect(buildNodeName({ selection: "Selected", currentFile: "Source", currentNode: "Node", currentHeading: "", now: new Date() }, prefix, suffix, "%Y")).toBe("Source--Selected__fromText");
  });
  it("uses only selected text when both parts are off", () => {
    expect(buildNodeName({ selection: " Alias ", currentFile: "", currentNode: "", currentHeading: "", now: new Date() }, disabled, disabled, "%Y")).toBe("Alias");
  });
});
