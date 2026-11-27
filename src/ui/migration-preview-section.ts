import { t } from "./i18n";

const batchSize = 500;

/** The preview can display every planned path, while keeping the initial render bounded. */
export function renderMigrationPreviewSection(
  container: HTMLElement,
  label: string,
  paths: readonly string[],
  blocking = false,
): void {
  const details = container.createEl("details", { cls: blocking && paths.length > 0 ? "is-blocking" : "" });
  details.open = paths.length > 0;
  details.createEl("summary", { text: `${label} (${paths.length})` });
  if (paths.length === 0) return;

  const list = details.createEl("ul", { cls: "folder-nodes-migration-paths" });
  let rendered = 0;
  const append = (): HTMLLIElement | undefined => {
    const end = Math.min(paths.length, rendered + batchSize);
    let first: HTMLLIElement | undefined;
    for (const path of paths.slice(rendered, end)) {
      const row = list.createEl("li");
      row.createEl("code", { text: path });
      first ??= row;
    }
    rendered = end;
    return first;
  };
  append();
  if (rendered === paths.length) return;

  const more = details.createEl("button", { cls: "folder-nodes-migration-more", attr: { type: "button" } });
  const updateLabel = (): void => more.setText(t("showMore", { count: Math.min(batchSize, paths.length - rendered) }));
  updateLabel();
  more.addEventListener("click", (event) => {
    const first = append();
    const finished = rendered === paths.length;
    if (first !== undefined && (event.detail === 0 || (finished && more === more.ownerDocument.activeElement))) {
      // Native keyboard activation should enter the new batch instead of
      // scrolling past it or losing focus when the final button disappears.
      first.tabIndex = -1;
      first.focus();
    }
    if (finished) more.remove();
    else updateLabel();
  });
}
