import { t } from "./i18n";

interface ContentsStatusAction { readonly id: string; readonly label: string; readonly run: () => void }

export function renderContentsStatus(
  container: HTMLElement,
  path: string,
  reason: string,
  actions: readonly ContentsStatusAction[],
): void {
  const status = container.createDiv({ cls: "folder-nodes-contents-status" });
  status.createEl("p", { text: `${t("nodePath")}: ${path || t("root")}`, cls: "folder-nodes-contents-status-path" });
  status.createEl("p", { text: reason, attr: { role: "status" } });
  const controls = status.createDiv({ cls: "folder-nodes-contents-status-actions" });
  for (const action of actions) {
    const button = controls.createEl("button", { text: action.label, attr: { type: "button" } });
    button.dataset.folderNodesFocusKey = `status:${action.id}`;
    button.addEventListener("click", action.run);
  }
}
