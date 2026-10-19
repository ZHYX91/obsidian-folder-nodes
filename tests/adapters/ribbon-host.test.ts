import type { Workspace } from "obsidian";
import { describe, expect, it } from "vitest";
import { refreshRibbonLabel, ribbonRegistrationTitle } from "../../src/adapters/ribbon-host";

describe("ribbon host compatibility", () => {
  it.each([undefined, null, {}, { items: null }, { items: {} }, { items: [null, false, { title: "Other" }] }])(
    "keeps the owned button accessible when host metadata is absent or incompatible: %j", (leftRibbon) => {
      const button = document.createElement("button");
      refreshRibbonLabel({ leftRibbon } as unknown as Workspace, button, "Knoteninhalt öffnen");
      expect(button.getAttribute("aria-label")).toBe("Knoteninhalt öffnen");
      expect(button.getAttribute("title")).toBe("Knoteninhalt öffnen");
      expect(ribbonRegistrationTitle({ leftRibbon } as unknown as Workspace, "folder-nodes")).toBe("Open node contents");
    },
  );

  it("does not access host internals after the owned ribbon button has been removed", () => {
    const workspace = new Proxy({}, { get() { throw new Error("Unexpected host access"); } });
    expect(() => refreshRibbonLabel(workspace as Workspace, null, "Contents")).not.toThrow();
  });

  it("rejects an incompatible matching item rather than overwriting unknown host state", () => {
    const button = document.createElement("button");
    const incompatible = { buttonEl: button, title: { future: true } };
    refreshRibbonLabel({ leftRibbon: { items: [incompatible] } } as unknown as Workspace, button, "Contents");
    expect(incompatible.title).toEqual({ future: true });
  });

  it("reuses the saved legacy action ID after its translated title changes and the plugin reloads", () => {
    const button = document.createElement("button");
    const item: Record<string, unknown> = { id: "folder-nodes:打开节点内容视图", title: "打开节点内容视图", buttonEl: button, hidden: true };
    const items = [{ id: "another:Action" }, item];
    const workspace = { leftRibbon: { items } } as unknown as Workspace;
    expect(ribbonRegistrationTitle(workspace, "folder-nodes")).toBe("打开节点内容视图");
    refreshRibbonLabel(workspace, button, "محتويات العقدة");
    delete item.buttonEl;
    expect(ribbonRegistrationTitle(workspace, "folder-nodes")).toBe("打开节点内容视图");
    expect(item).toEqual({ id: "folder-nodes:打开节点内容视图", title: "محتويات العقدة", hidden: true });
    expect(items[1]).toBe(item);
  });

  it("prefers the constant ID and does not guess between multiple legacy actions", () => {
    const items = [null, { id: "another:Action" }, { id: "folder-nodes:" }, { id: 42 }, { id: "folder-nodes:First" }, { id: "folder-nodes:Second" }];
    const workspace = { leftRibbon: { items } } as unknown as Workspace;
    expect(ribbonRegistrationTitle(workspace, "folder-nodes")).toBe("Open node contents");
    items.push({ id: "folder-nodes:Open node contents" });
    expect(ribbonRegistrationTitle(workspace, "folder-nodes")).toBe("Open node contents");
  });
});
