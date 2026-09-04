import { describe, expect, it } from "vitest";

import { selectionPreviewRows } from "../../src/ui/selection-create-modal";

describe("selection creation preview", () => {
  it("shows only creation location, the short node name, and alias policy", () => {
    expect(selectionPreviewRows({
      parentPath: "Diary/2026/2026-09/2026-09-02",
      nodeName: "Hot seaweed rice roll",
      alias: null,
    })).toEqual([
      ["Create in", "Diary/2026/2026-09/2026-09-02"],
      ["New node", "Hot seaweed rice roll"],
      ["Alias", "Do not add"],
    ]);
  });
});
