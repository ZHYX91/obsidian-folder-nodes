import { describe, expect, it, vi } from "vitest";

import { detectInstalledEmojiFonts } from "../../src/ui/emoji-fonts";

describe("Emoji font detection", () => {
  it("keeps curated order and excludes missing or failed local fonts", async () => {
    const probe = vi.fn(async (family: string) => {
      if (family === "OpenMoji") throw new Error("font cache unavailable");
      return family === "Segoe UI Emoji" || family === "Twemoji Mozilla";
    });

    await expect(detectInstalledEmojiFonts(probe)).resolves.toEqual([
      "Segoe UI Emoji",
      "Twemoji Mozilla",
    ]);
    expect(probe).toHaveBeenCalledTimes(5);
  });
});
