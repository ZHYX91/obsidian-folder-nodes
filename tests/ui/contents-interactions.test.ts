import { describe, expect, it } from "vitest";
import {
  breadcrumbSegments,
  breadcrumbItems,
  filesSectionKey,
  formatContentLinks,
  isContextMenuKey,
  nodeEntryVisual,
  referencedVaultPaths,
  selectionRange,
  siblingDropAxis,
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

  it("uses left and right insertion edges for a multi-column grid", () => {
    const rect = { top: 100, left: 200, width: 120, height: 80 };
    expect(siblingDropZone(rect, { clientX: 210, clientY: 140 }, "horizontal")).toBe("before");
    expect(siblingDropZone(rect, { clientX: 310, clientY: 140 }, "horizontal")).toBe("after");
    expect(siblingDropZone(rect, { clientX: 210, clientY: 140 }, "horizontal", true)).toBe("after");
  });

  it("uses top and bottom insertion edges for a single-column grid", () => {
    const rect = { top: 100, left: 200, width: 120, height: 80 };
    expect(siblingDropZone(rect, { clientX: 260, clientY: 110 }, "vertical")).toBe("before");
    expect(siblingDropZone(rect, { clientX: 260, clientY: 180 }, "vertical")).toBe("after");
  });

  it("detects whether sibling cards share a row", () => {
    expect(siblingDropAxis([
      { top: 0, left: 0, width: 120, height: 80 },
      { top: 0, left: 128, width: 120, height: 80 },
      { top: 88, left: 0, width: 120, height: 80 },
    ])).toBe("horizontal");
    expect(siblingDropAxis([
      { top: 0, left: 0, width: 120, height: 80 },
      { top: 88, left: 0, width: 120, height: 80 },
    ])).toBe("vertical");
  });

  it("keeps a stable visual slot for nodes without a custom icon", () => {
    expect(nodeEntryVisual("healthy", { kind: "fallback", value: "", inheritedFrom: null })).toEqual({
      defaultVisual: true,
      visual: { kind: "lucide", value: "folder-tree", inheritedFrom: null },
      warning: false,
    });
    expect(nodeEntryVisual("missing-note", null)).toEqual({
      defaultVisual: true,
      visual: { kind: "lucide", value: "folder-tree", inheritedFrom: null },
      warning: true,
    });
    const custom = { kind: "emoji" as const, value: "☕", inheritedFrom: null };
    expect(nodeEntryVisual("healthy", custom)).toEqual({ defaultVisual: false, visual: custom, warning: false });
  });

  it("builds one normalized reverse reference set from Obsidian link metadata", () => {
    expect(referencedVaultPaths({
      "A.md": { "media/photo.jpg": 2, "documents/report.pdf": 1, "ignored.bin": 0 },
      "B.md": { "/media/photo.jpg/": 1 },
    })).toEqual(new Set(["media/photo.jpg", "documents/report.pdf"]));
  });

  it("names the content section according to whether it contains folders", () => {
    expect(filesSectionKey(false)).toBe("files");
    expect(filesSectionKey(true)).toBe("filesAndFolders");
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
