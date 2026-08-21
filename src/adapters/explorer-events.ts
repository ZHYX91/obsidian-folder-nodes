export function isFolderCollapseControl(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(
    ".nav-folder-collapse-indicator, .tree-item-icon.collapse-icon",
  ) !== null;
}
