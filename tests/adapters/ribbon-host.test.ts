import type { Workspace } from "obsidian";
import { describe, expect, it } from "vitest";
import { refreshRibbonLabel } from "../../src/adapters/ribbon-host";

describe("ribbon host compatibility", () => {
  it.each([undefined, null, {}, { items: null }, { items: {} }, { items: [null, false, { title: "Other" }] }])(
    "keeps the owned button accessible when host metadata is absent or incompatible: %j", (leftRibbon) => {
      const button = document.createElement("button");
      refreshRibbonLabel({ leftRibbon } as unknown as Workspace, button, "Knoteninhalt öffnen");
      expect(button.getAttribute("aria-label")).toBe("Knoteninhalt öffnen");
      expect(button.getAttribute("title")).toBe("Knoteninhalt öffnen");
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
});
