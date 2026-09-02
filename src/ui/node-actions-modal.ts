import { App, Modal, setIcon } from "obsidian";

import { t } from "./i18n";

export type NodeActionGroup = "appearance" | "management" | "open" | "structure";
export type NodeActionSurface = "contents" | "graph" | "native-folder" | "native-note";

export interface NodeAction {
  readonly disabled?: boolean;
  readonly group: NodeActionGroup;
  readonly icon: string;
  readonly id: string;
  readonly run: () => unknown;
  readonly title: string;
  readonly warning?: boolean;
}

const GROUPS: readonly NodeActionGroup[] = ["open", "appearance", "structure", "management"];

export class NodeActionsModal extends Modal {
  public constructor(
    app: App,
    private readonly nodeName: string,
    private readonly actions: readonly NodeAction[],
    private readonly reportError: (error: unknown) => void,
  ) { super(app); }

  public override onOpen(): void {
    this.setTitle(t("nodeActionsFor", { name: this.nodeName }));
    this.contentEl.addClass("folder-nodes-actions-modal");
    for (const group of GROUPS) {
      const actions = this.actions.filter((action) => action.group === group);
      if (actions.length === 0) continue;
      this.contentEl.createEl("h3", { text: groupLabel(group) });
      const list = this.contentEl.createDiv({ cls: "folder-nodes-actions-list" });
      for (const action of actions) {
        const button = list.createEl("button", {
          cls: `folder-nodes-action${action.warning === true ? " is-warning" : ""}`,
          attr: { type: "button" },
        });
        button.disabled = action.disabled === true;
        const icon = button.createSpan({ cls: "folder-nodes-action-icon", attr: { "aria-hidden": "true" } });
        setIcon(icon, action.icon);
        button.createSpan({ cls: "folder-nodes-action-label", text: action.title });
        button.addEventListener("click", () => {
          this.close();
          void Promise.resolve(action.run()).catch((error) => this.reportError(error));
        });
      }
    }
  }
}

function groupLabel(group: NodeActionGroup): string {
  if (group === "open") return t("actionGroupOpen");
  if (group === "appearance") return t("actionGroupAppearance");
  if (group === "structure") return t("actionGroupStructure");
  return t("actionGroupManagement");
}
