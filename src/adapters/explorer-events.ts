export function isFolderCollapseControl(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(
    ".nav-folder-collapse-indicator, .tree-item-icon.collapse-icon",
  ) !== null;
}

export function ensureExplorerIconPosition(
  container: HTMLElement,
  icon: HTMLElement,
  title: HTMLElement | null,
  position: "before" | "after",
): boolean {
  if (title === null) {
    const positioned = icon.parentElement === container &&
      (position === "before" ? container.firstChild === icon : container.lastChild === icon);
    if (positioned) return false;
    if (position === "before") container.prepend(icon);
    else container.append(icon);
    return true;
  }

  const positioned = icon.parentElement === container &&
    (position === "before" ? icon.nextSibling === title : title.nextSibling === icon);
  if (positioned) return false;
  if (position === "before") container.insertBefore(icon, title);
  else title.insertAdjacentElement("afterend", icon);
  return true;
}
