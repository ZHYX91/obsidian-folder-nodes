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

Object.assign(window, { measureTabs, checkTabReveal });
