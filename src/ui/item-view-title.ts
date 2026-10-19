import type { View } from "obsidian";

/** ItemView caches its navigation title at load; setViewState only refreshes the tab. */
export function refreshItemViewTitle(view: View): void {
  const header = view.containerEl.querySelector<HTMLElement>(":scope > .view-header .view-header-title");
  if (!header) return;
  const previous = header.textContent ?? "";
  const title = view.getDisplayText();
  header.textContent = title;
  const document = header.ownerDocument;
  if (view.app.workspace.getMostRecentLeaf() === view.leaf && previous && document.title.startsWith(`${previous} - `)) {
    document.title = title + document.title.slice(previous.length);
  }
}
