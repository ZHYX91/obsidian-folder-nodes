import { expect, it } from "vitest";

import { ReferenceIndex } from "../src/core/reference-index";

it("builds and incrementally updates a large reverse-reference index", () => {
  const size = import.meta.env.MODE === "large" ? 100_000 : 20_000;
  const links = Object.fromEntries(Array.from({ length: size }, (_, index) => [
    `Notes/${index}.md`,
    { [`Assets/${index % 1_000}.png`]: 1, [`Documents/${index % 2_000}.pdf`]: 1 },
  ]));
  const index = new ReferenceIndex();
  const started = performance.now();
  index.rebuild(links);
  const rebuilt = performance.now();
  for (let source = 0; source < 1_000; source += 1) index.updateSource(`Notes/${source}.md`, {});
  expect(index.isReferenced("Assets/999.png")).toBe(true);
  expect(rebuilt - started).toBeLessThan(2_000);
  expect(performance.now() - rebuilt).toBeLessThan(1_000);
});
