import { expect, it } from "vitest";
import { planAppendChildren, planReorder } from "../src/core/ordering";

it("reorders a large direct-child set with one metadata patch", () => {
  const size = import.meta.env.MODE === "large" ? 100_000 : 10_000;
  const children = Array.from({ length: size }, (_, index) => ({ basename: `Node ${index.toString().padStart(6, "0")}`, childPath: `Parent/Node ${index.toString().padStart(6, "0")}`, order: (index + 1) * 1024 }));
  const started = performance.now();
  const plan = planReorder(children, children[size - 1]?.childPath ?? "", 1);
  expect(plan.patches).toHaveLength(1);
  expect(performance.now() - started).toBeLessThan(2000);
});

it("plans a large merge batch from one rank snapshot", () => {
  const size = import.meta.env.MODE === "large" ? 100_000 : 10_000;
  const half = size / 2;
  const existing = Array.from({ length: half }, (_, index) => ({ basename: `Existing ${index}`, childPath: `Parent/Existing ${index}`, order: (index + 1) * 1024 }));
  const incoming = Array.from({ length: half }, (_, index) => ({ basename: `Incoming ${index}`, childPath: `Parent/Incoming ${index}`, order: (index + 1) * 1024 }));
  const started = performance.now();
  const plan = planAppendChildren(existing, incoming);
  expect(plan.orderedPaths).toEqual([...existing, ...incoming].map(({ childPath }) => childPath));
  expect(plan.patches).toHaveLength(half);
  expect(plan.patches[0]?.nextOrder).toBe((half + 1) * 1024);
  expect(plan.patches.at(-1)?.nextOrder).toBe(size * 1024);
  expect(performance.now() - started).toBeLessThan(2000);
});
