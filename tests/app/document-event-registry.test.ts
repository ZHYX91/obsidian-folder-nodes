import { describe, expect, it, vi } from "vitest";
import { Window } from "happy-dom";

import { DocumentEventRegistry } from "../../src/app/document-event-registry";

describe("DocumentEventRegistry", () => {
  it("releases listeners for workspace documents that are no longer live", () => {
    const firstWindow = new Window();
    const secondWindow = new Window();
    const first = firstWindow.document as unknown as Document;
    const second = secondWindow.document as unknown as Document;
    const listener = vi.fn();
    const registry = new DocumentEventRegistry(listener);

    registry.reconcile([first, second]);
    first.dispatchEvent(new firstWindow.MouseEvent("click", { bubbles: true }));
    second.dispatchEvent(new secondWindow.MouseEvent("auxclick", { bubbles: true }));
    expect(listener).toHaveBeenCalledTimes(2);

    registry.reconcile([second]);
    first.dispatchEvent(new firstWindow.MouseEvent("click", { bubbles: true }));
    second.dispatchEvent(new secondWindow.MouseEvent("click", { bubbles: true }));
    expect(listener).toHaveBeenCalledTimes(3);

    registry.clear();
    second.dispatchEvent(new secondWindow.MouseEvent("click", { bubbles: true }));
    expect(listener).toHaveBeenCalledTimes(3);
  });
});
