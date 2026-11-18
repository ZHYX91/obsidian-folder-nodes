/** Keep help expansion state in the owning SettingTab, never in data.json. */
export function createFolderSettingsGuide(
  panel: HTMLElement, key: string, title: string, expanded: Set<string>,
): HTMLDivElement {
  const guide = panel.createEl("details", { cls: "folder-nodes-settings-guide" });
  guide.open = expanded.has(key);
  guide.createEl("summary", { text: title });
  guide.addEventListener("toggle", () => {
    if (guide.open) expanded.add(key);
    else expanded.delete(key);
  });
  return guide.createDiv({ cls: "folder-nodes-settings-guide-body" });
}
