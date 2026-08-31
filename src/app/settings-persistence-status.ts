import { Setting } from "obsidian";

import {
  SettingsSchemaIncompatibleError,
  type SettingsCompatibility,
} from "../shared/settings";
import type { SettingsSaveState } from "../shared/settings-save-coordinator";
import { t } from "../ui/i18n";

export type PluginSettingsSaveState = SettingsSaveState | "blocked";

export function renderSettingsPersistenceStatus(
  containerEl: HTMLElement,
  compatibility: SettingsCompatibility,
  state: PluginSettingsSaveState,
  retry: () => Promise<void>,
): void {
  if (compatibility.status === "incompatible") {
    const setting = new Setting(containerEl)
      .setName(t("settingsReadOnly"))
      .setDesc(t("settingsReadOnlyDesc", {
        current: compatibility.currentSchemaVersion,
        stored: compatibility.storedSchemaVersion ?? "?",
      }))
      .setClass("folder-nodes-settings-warning");
    setting.settingEl.setAttribute("role", "alert");
    setting.settingEl.setAttribute("aria-live", "assertive");
    return;
  }
  if (state !== "pending") return;
  const setting = new Setting(containerEl)
    .setName(t("settingsSavePending"))
    .setDesc(t("settingsSavePendingDesc"))
    .setClass("folder-nodes-settings-warning");
  setting.settingEl.setAttribute("role", "alert");
  setting.settingEl.setAttribute("aria-live", "polite");
  setting.addButton((button) => button
    .setButtonText(t("retrySettingsSave"))
    .onClick(() => {
      button.setDisabled(true);
      void retry();
    }));
}

export function lockSettingsPanel(panel: HTMLElement, readOnly: boolean): void {
  if (!readOnly) return;
  panel.setAttribute("aria-disabled", "true");
  for (const control of panel.querySelectorAll<HTMLButtonElement | HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
    "button, input, select, textarea",
  )) {
    control.disabled = true;
    control.setAttribute("aria-disabled", "true");
  }
}

export function assertSettingsWritable(compatibility: SettingsCompatibility): void {
  if (compatibility.status === "incompatible") {
    throw new SettingsSchemaIncompatibleError(compatibility);
  }
}
