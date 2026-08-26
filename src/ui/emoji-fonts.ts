import { EMOJI_FONT_FAMILIES, type EmojiFontFamily } from "../core/emoji-font";

export type LocalEmojiFontProbe = (family: EmojiFontFamily) => Promise<boolean>;

export async function detectInstalledEmojiFonts(
  probe: LocalEmojiFontProbe = probeLocalEmojiFont,
): Promise<EmojiFontFamily[]> {
  const results = await Promise.all(EMOJI_FONT_FAMILIES.map(async (family) => ({
    family,
    installed: await probe(family).catch(() => false),
  })));
  return results.filter((result) => result.installed).map((result) => result.family);
}

async function probeLocalEmojiFont(family: EmojiFontFamily): Promise<boolean> {
  if (typeof FontFace !== "function") return false;
  try {
    const face = new FontFace("Folder Nodes local font probe", `local("${family}")`);
    await face.load();
    return face.status === "loaded";
  } catch {
    return false;
  }
}
