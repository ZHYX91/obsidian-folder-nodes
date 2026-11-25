import "../setup/obsidian-dom";
import { type App, TFolder } from "obsidian";
import { VisualPickerModal } from "../../src/ui/visual-picker-modal";

function openVisualPicker(width: number, direction: string): void {
  document.body.replaceChildren();
  const modal = new VisualPickerModal({} as App, Object.assign(new TFolder(), { name: "Test" }), ["A", "B"],
    () => ({ kind: "fallback", value: "folder", inheritedFrom: null, accent: null }),
    () => ({ unknownCount: 0, extraColorCount: 0 }), async () => {});
  modal.open();
  modal.contentEl.style.cssText = `width:${width}px;--size-2-2:4px;--size-4-2:8px`;
  modal.contentEl.dir = direction;
}

Object.assign(window, { openVisualPicker });
