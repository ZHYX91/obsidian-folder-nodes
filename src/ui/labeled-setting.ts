import { Setting, type DropdownComponent, type ExtraButtonComponent, type TextComponent } from "obsidian";

let nextFieldId = 0;

export class LabeledSetting extends Setting {
  public override addText(configure: (text: TextComponent) => unknown): this {
    return super.addText((text) => { configure(text); this.label(text.inputEl); });
  }

  public override addDropdown(configure: (dropdown: DropdownComponent) => unknown): this {
    return super.addDropdown((dropdown) => { configure(dropdown); this.label(dropdown.selectEl); });
  }

  public addNamedAction(label: string, configure: (button: ExtraButtonComponent) => unknown): this {
    return super.addExtraButton((button) => {
      configure(button);
      button.setTooltip(label);
      button.extraSettingsEl.setAttribute("role", "button");
      button.extraSettingsEl.setAttribute("aria-label", `${label} · ${this.nameEl.textContent ?? ""}`);
      if (this.readOnly) {
        button.setDisabled(true);
        button.extraSettingsEl.setAttribute("aria-disabled", "true");
        button.extraSettingsEl.tabIndex = -1;
      }
    });
  }

  public addSwitch(checked: boolean, onChange: (value: boolean) => unknown): this {
    return super.addToggle((toggle) => {
      toggle.setValue(checked);
      const wrapper = toggle.toggleEl;
      const checkbox = wrapper.matches("input") ? wrapper
        : wrapper.querySelector<HTMLInputElement>('input[type="checkbox"]');
      if (checkbox !== null) {
        if (checkbox !== wrapper) wrapper.tabIndex = -1;
        checkbox.tabIndex = 0;
        checkbox.checked = checked;
        this.label(checkbox);
      } else {
        this.label(wrapper);
        wrapper.setAttribute("role", "switch");
        wrapper.setAttribute("aria-checked", String(checked));
      }
      if (this.readOnly) {
        toggle.setDisabled(true);
        if (checkbox !== null) checkbox.disabled = true;
        else { wrapper.tabIndex = -1; wrapper.setAttribute("aria-disabled", "true"); }
      }
      toggle.onChange((value) => {
        if (checkbox !== null) checkbox.checked = value;
        else wrapper.setAttribute("aria-checked", String(value));
        return onChange(value);
      });
    });
  }

  private get readOnly(): boolean {
    return this.settingEl.closest('[aria-disabled="true"]') !== null;
  }

  private label(control: HTMLElement): void {
    const id = `folder-nodes-field-${++nextFieldId}`;
    this.nameEl.id ||= `${id}-name`;
    control.setAttribute("aria-labelledby", this.nameEl.id);
    this.descEl.id ||= `${id}-description`;
    control.setAttribute("aria-describedby", this.descEl.id);
  }
}
