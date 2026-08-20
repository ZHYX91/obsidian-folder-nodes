import { describe, expect, it } from "vitest";
import { renderNodeTemplate } from "../../src/core/template";

describe("node template", () => {
  it("renders every v1 token without evaluating arbitrary syntax", () => {
    expect(renderNodeTemplate("# {{name}}\n{{path}}|{{parent}}|{{date}}", {
      name: "Child", path: "Parent/Child", parent: "Parent", date: "2026-08-21",
    })).toBe("# Child\nParent/Child|Parent|2026-08-21");
  });
});
