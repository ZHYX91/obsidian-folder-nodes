import { describe, expect, it } from "vitest";
import { buildNodeName, formatTimestamp, isValidMomentTimestampFormat } from "../../src/core/naming";
import type { NamingPart } from "../../src/core/types";

const formatter = (date: Date, format: string): string => format
  .replaceAll("YYYY", String(date.getFullYear()))
  .replaceAll("MM", String(date.getMonth() + 1).padStart(2, "0"))
  .replaceAll("DD", String(date.getDate()).padStart(2, "0"))
  .replaceAll("HH", String(date.getHours()).padStart(2, "0"))
  .replaceAll("mm", String(date.getMinutes()).padStart(2, "0"))
  .replaceAll("ss", String(date.getSeconds()).padStart(2, "0"));
const disabled: NamingPart = { enabled: false, source: "custom", separator: "_", customText: "", timestampFormat: "YYYY" };
describe("selection naming", () => {
  it("formats deterministic timestamps", () => {
    expect(formatTimestamp(new Date(2026, 7, 21, 1, 2, 3), "YYYYMMDD-HHmmss", formatter)).toBe("20260821-010203");
    expect(isValidMomentTimestampFormat("YYYY-MM-DD [at] HHmmss")).toBe(true);
    expect(isValidMomentTimestampFormat("yyyy-MM-dd")).toBe(false);
  });
  it("applies configurable prefix, suffix, and separators", () => {
    const prefix: NamingPart = { enabled: true, source: "current-file", separator: "--", customText: "", timestampFormat: "YYYY" };
    const suffix: NamingPart = { enabled: true, source: "custom", separator: "__", customText: "fromText", timestampFormat: "HH" };
    expect(buildNodeName({ selection: "Selected", currentFile: "Source", currentNode: "Node", currentHeading: "", now: new Date() }, prefix, suffix, formatter)).toBe("Source--Selected__fromText");
  });
  it("formats prefix and suffix timestamps independently from one captured instant", () => {
    const prefix: NamingPart = { enabled: true, source: "timestamp", separator: "-", customText: "", timestampFormat: "YYYYMMDD" };
    const suffix: NamingPart = { enabled: true, source: "timestamp", separator: "-", customText: "", timestampFormat: "HHmmss" };
    expect(buildNodeName({ selection: "Selected", currentFile: "", currentNode: "", currentHeading: "", now: new Date(2026, 8, 5, 6, 7, 8) }, prefix, suffix, formatter)).toBe("20260905-Selected-060708");
  });
  it("uses only selected text when both parts are off", () => {
    expect(buildNodeName({ selection: " Alias ", currentFile: "", currentNode: "", currentHeading: "", now: new Date() }, disabled, disabled, formatter)).toBe("Alias");
  });
});
