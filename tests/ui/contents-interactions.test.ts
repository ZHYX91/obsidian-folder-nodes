import { describe, expect, it } from "vitest";
import {
  isContextMenuKey,
  nodeDropZone,
  parseDragPayload,
  serializeDragPayload,
} from "../../src/ui/contents-interactions";

describe("Node Contents interactions", () => {
  it("uses before, into, and after node drop zones", () => {
    const rect = { top: 100, height: 80 };
    expect(nodeDropZone(rect, 105)).toBe("before");
    expect(nodeDropZone(rect, 140)).toBe("into");
    expect(nodeDropZone(rect, 175)).toBe("after");
  });

  it("round-trips only supported internal drag payloads", () => {
    const payload = { kind: "file" as const, path: "A/image.png" };
    expect(parseDragPayload(serializeDragPayload(payload))).toEqual(payload);
    expect(parseDragPayload('{"kind":"other","path":"A"}')).toBeNull();
    expect(parseDragPayload('{"kind":"file","path":""}')).toBeNull();
    expect(parseDragPayload("not-json")).toBeNull();
  });

  it("recognizes both keyboard context-menu gestures", () => {
    expect(isContextMenuKey(new KeyboardEvent("keydown", { key: "ContextMenu" }))).toBe(true);
    expect(isContextMenuKey(new KeyboardEvent("keydown", { key: "F10", shiftKey: true }))).toBe(true);
    expect(isContextMenuKey(new KeyboardEvent("keydown", { key: "F10" }))).toBe(false);
  });
});
