import "../setup/obsidian-dom";
import { LabeledSetting } from "../../src/ui/labeled-setting";
import { addSettingsTabArrows } from "../../src/ui/settings-tab-arrows";

function mountTabs(width: number, direction: "ltr" | "rtl", hidden = false) {
  const root = document.createElement("div");
  root.className = "folder-nodes-settings";
  root.dir = direction;
  root.hidden = hidden;
  root.style.width = width + "px";
  const tabs = document.createElement("div");
  tabs.className = "folder-nodes-tabs";
  tabs.setAttribute("role", "tablist");
  for (const label of ["General", "Management", "Icons & appearance", "Selection & naming", "Node Graph"]) {
    const tab = document.createElement("button");
    tab.className = "folder-nodes-tab";
    tab.classList.toggle("is-active", label === "Node Graph");
    tab.setAttribute("role", "tab");
    tab.setAttribute("aria-selected", String(label === "Node Graph"));
    tab.textContent = label;
    tabs.append(tab);
  }
  root.append(tabs);
  document.body.append(root);
  const cleanup = addSettingsTabArrows(tabs, direction, "Earlier", "More");
  return { root, tabs, remove() { cleanup(); root.remove(); } };
}

function measureTabs(width: number, direction: "ltr" | "rtl") {
  const { root, tabs, remove } = mountTabs(width, direction);
  try {
    return {
      coarse: matchMedia("(pointer: coarse)").matches,
      heights: Array.from(tabs.children, (tab) => tab.getBoundingClientRect().height),
      arrows: Array.from(root.querySelectorAll(".folder-nodes-tab-arrow"), (arrow) => arrow.getBoundingClientRect().width)
        .filter((visibleWidth) => visibleWidth > 0),
    };
  } finally {
    remove();
  }
}

function afterLayout(): Promise<void> {
  return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
}

async function checkTabReveal(direction: "ltr" | "rtl", opening: "hidden" | "wide" | "overflowing") {
  const external = document.createElement("button");
  document.body.append(external);
  external.focus();
  const { root, tabs, remove } = mountTabs(opening === "wide" ? 900 : 310, direction, opening === "hidden");
  try {
    // Let initial observers settle before making the component visible or narrower.
    await afterLayout();
    root.hidden = false;
    root.style.width = "220.5px";
    await afterLayout();
    const viewport = tabs.getBoundingClientRect();
    const active = tabs.querySelector('[aria-selected="true"]')!.getBoundingClientRect();
    const revealed = active.left >= viewport.left - 1 && active.right <= viewport.right + 1;
    const previous = root.querySelector<HTMLButtonElement>('[aria-label="Earlier"]')!;
    for (let step = 0; step < tabs.childElementCount && !previous.disabled; step++) {
      previous.click();
      await afterLayout();
    }
    root.style.width = "210.5px";
    await afterLayout();
    return { revealed, keptPage: Math.abs(tabs.scrollLeft) <= 1 && previous.disabled,
      keptFocus: document.activeElement === external, selected: tabs.querySelector('[aria-selected="true"]')?.textContent };
  } finally {
    remove();
    external.remove();
  }
}

// The browser runner samples the actual two pixel rows of both tab borders.
function mountTabPaintSample() {
  const { root, tabs } = mountTabs(900, "ltr");
  root.style.setProperty("--interactive-accent", "#6242aa");
  root.style.setProperty("--background-modifier-border", "#bbb");
  return [".is-active", ":not(.is-active)"].map(state => {
    const rect = tabs.querySelector(`button${state}`)!.getBoundingClientRect();
    return { x: Math.floor(rect.left + rect.width / 2), y: Math.floor(rect.bottom) - 2 };
  });
}

function measureNarrowFields(direction: "ltr" | "rtl") {
  const root = document.createElement("div");
  root.className = "folder-nodes-settings";
  root.style.cssText = "width:260px;font:20px sans-serif";
  root.dir = direction;
  const panel = document.createElement("div");
  panel.className = "folder-nodes-tab-panel";
  root.append(panel);
  document.body.append(root);
  const host = root.createEl("style");
  host.textContent = `
    .setting-item,.setting-item-control{display:flex;align-items:center;justify-content:space-between}
    .setting-item button{font:inherit;white-space:nowrap}
    .setting-item-control select.is-measuring{position:absolute;visibility:hidden;width:max-content}
  `;
  try {
    const selection = new LabeledSetting(panel).setName("Sprache");
    selection.addDropdown((dropdown) => dropdown.addOptions({ auto: "Obsidian-Sprache verwenden" }).setValue("auto"));
    const mirror = selection.controlEl.querySelector("select")!.cloneNode(true) as HTMLSelectElement;
    mirror.className = "dropdown is-measuring";
    mirror.style.font = "26px sans-serif";
    selection.controlEl.append(mirror);
    new LabeledSetting(panel).setName("Ajouter une règle")
      .addButton((button) => button.setButtonText("Ajouter un chemin"))
      .addButton((button) => button.setButtonText("Ajouter une règle de début de nom"));
    const preview = panel.createDiv({ cls: "folder-nodes-emoji-font-preview" });
    preview.createSpan({ cls: "folder-nodes-emoji-font-preview-sample", text: "📔🫠🩷👨‍👩‍👧‍👦🏳️‍🌈".repeat(6) });
    const frame = panel.getBoundingClientRect();
    return {
      overflow: panel.scrollWidth - panel.clientWidth,
      allActionsVisible: Array.from(panel.querySelectorAll("button")).every((button) => {
        const box = button.getBoundingClientRect();
        return box.left >= frame.left - 1 && box.right <= frame.right + 1;
      }),
      measuredLabel: mirror.offsetWidth,
    };
  } finally { root.remove(); }
}

Object.assign(window, { measureTabs, checkTabReveal, mountTabPaintSample, measureNarrowFields });
