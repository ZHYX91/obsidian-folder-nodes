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

    const dispatch = (document: Document, type: string): void => {
      const event = document.createEvent("Event");
      event.initEvent(type, true, true);
      document.dispatchEvent(event);
    };

    registry.reconcile([first, second]);
    dispatch(first, "click");
    dispatch(second, "auxclick");
    expect(listener).toHaveBeenCalledTimes(2);

    registry.reconcile([second]);
    dispatch(first, "click");
    dispatch(second, "click");
    expect(listener).toHaveBeenCalledTimes(3);

    registry.clear();
    dispatch(second, "click");
    expect(listener).toHaveBeenCalledTimes(3);
  });
});
