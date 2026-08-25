import { expect, it } from "vitest";
import { planReorder } from "../src/core/ordering";

it("reorders a large direct-child set with one metadata patch", () => {
  const size = import.meta.env.MODE === "large" ? 100_000 : 10_000;
  const children = Array.from({ length: size }, (_, index) => ({ basename: `Node ${index.toString().padStart(6, "0")}`, childPath: `Parent/Node ${index.toString().padStart(6, "0")}`, order: (index + 1) * 1024 }));
  const started = performance.now();
  const plan = planReorder(children, children[size - 1]?.childPath ?? "", 1);
  expect(plan.patches).toHaveLength(1);
  expect(performance.now() - started).toBeLessThan(2000);
});
