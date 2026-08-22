import { describe, expect, it } from "vitest";
import {
  breadcrumbSegments,
  breadcrumbItems,
  formatContentLinks,
  isContextMenuKey,
  selectionRange,
  siblingDropZone,
} from "../../src/ui/contents-interactions";

describe("Node Contents interactions", () => {
  it("omits root-only breadcrumb separators", () => {
    expect(breadcrumbSegments("")).toEqual([]);
    expect(breadcrumbSegments("/")).toEqual([]);
    expect(breadcrumbSegments("A/B")).toEqual(["A", "B"]);
  });

  it("marks only the current breadcrumb as the current location", () => {
    expect(breadcrumbItems("Note", "")).toEqual([
      { current: true, label: "Note", path: "" },
    ]);
    expect(breadcrumbItems("Note", "学习/考试")).toEqual([
      { current: false, label: "Note", path: "" },
      { current: false, label: "学习", path: "学习" },
      { current: true, label: "考试", path: "学习/考试" },
    ]);
  });

  it("limits right-sidebar sibling sorting to before and after", () => {
    const rect = { top: 100, height: 80 };
    expect(siblingDropZone(rect, 110)).toBe("before");
    expect(siblingDropZone(rect, 140)).toBe("after");
    expect(siblingDropZone(rect, 180)).toBe("after");
  });

  it("embeds album media while leaving file-section entries as links", () => {
    const items = [
      { kind: "media" as const, link: "[[photo.jpg]]" },
      { kind: "media" as const, link: "[[clip.mp4]]" },
      { kind: "file" as const, link: "[[document.pdf]]" },
      { kind: "file" as const, link: "[[audio.mp3]]" },
    ];
    expect(formatContentLinks(items)).toBe("![[photo.jpg]]\n![[clip.mp4]]\n[[document.pdf]]\n[[audio.mp3]]");
    expect(formatContentLinks(items, true)).toBe("[[photo.jpg]]\n[[clip.mp4]]\n[[document.pdf]]\n[[audio.mp3]]");
  });

  it("extends content selection across the visible album and file order", () => {
    const order = ["a.jpg", "b.mp4", "c.pdf", "d.md"];
    expect(selectionRange(order, "b.mp4", "d.md")).toEqual(["b.mp4", "c.pdf", "d.md"]);
    expect(selectionRange(order, "d.md", "b.mp4")).toEqual(["b.mp4", "c.pdf", "d.md"]);
    expect(selectionRange(order, "missing", "d.md")).toEqual([]);
  });

  it("recognizes both keyboard context-menu gestures", () => {
    expect(isContextMenuKey(new KeyboardEvent("keydown", { key: "ContextMenu" }))).toBe(true);
    expect(isContextMenuKey(new KeyboardEvent("keydown", { key: "F10", shiftKey: true }))).toBe(true);
    expect(isContextMenuKey(new KeyboardEvent("keydown", { key: "F10" }))).toBe(false);
  });
});
