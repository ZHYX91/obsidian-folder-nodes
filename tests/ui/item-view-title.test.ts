import type { View } from "obsidian";
import { afterEach, describe, expect, it } from "vitest";
import { refreshItemViewTitle } from "../../src/ui/item-view-title";

const originalTitle = document.title;
afterEach(() => { document.title = originalTitle; });

function fixture(owner = document) {
  const containerEl = owner.createElement("div");
  containerEl.innerHTML = '<div class="view-header"><div class="view-header-title">Knotengraf</div></div><div class="view-content">Notes</div>';
  const leaf = {};
  const view = { containerEl, leaf, app: { workspace: { getMostRecentLeaf: () => leaf } }, getDisplayText: () => "Граф узлов" };
  return { view, header: containerEl.querySelector(".view-header-title")! };
}

describe("owned ItemView title refresh", () => {
  it("updates the cached navigation and active window title while preserving host suffix and content", () => {
    const { view, header } = fixture();
    document.title = "Knotengraf - My Vault - Obsidian 1.14.4";
    refreshItemViewTitle(view as unknown as View);
    expect(header.textContent).toBe("Граф узлов");
    expect(document.title).toBe("Граф узлов - My Vault - Obsidian 1.14.4");
    expect(view.containerEl.querySelector(".view-content")?.textContent).toBe("Notes");
  });

  it("leaves another active leaf's window title alone", () => {
    const { view, header } = fixture();
    view.app.workspace.getMostRecentLeaf = () => ({});
    document.title = "Knotengraf - My Vault";
    refreshItemViewTitle(view as unknown as View);
    expect(header.textContent).toBe("Граф узлов");
    expect(document.title).toBe("Knotengraf - My Vault");
  });

  it("does not replace unrelated or ambiguous document titles", () => {
    const { view } = fixture();
    document.title = "My Knotengraf notes - My Vault";
    refreshItemViewTitle(view as unknown as View);
    expect(document.title).toBe("My Knotengraf notes - My Vault");
  });

  it("uses the owning document for a detached window", () => {
    const owner = document.implementation.createHTMLDocument("Knotengraf - Detached Vault");
    owner.title = "Knotengraf - Detached Vault";
    const { view, header } = fixture(owner);
    document.title = "Other window";
    refreshItemViewTitle(view as unknown as View);
    expect(header.textContent).toBe("Граф узлов");
    expect(owner.title).toBe("Граф узлов - Detached Vault");
    expect(document.title).toBe("Other window");
  });

  it("ignores nested content imitating a host header when the host header is absent", () => {
    const { view } = fixture();
    view.containerEl.innerHTML = '<div class="view-content"><div class="view-header"><div class="view-header-title">Note text</div></div></div>';
    refreshItemViewTitle(view as unknown as View);
    expect(view.containerEl.textContent).toBe("Note text");
  });
});
