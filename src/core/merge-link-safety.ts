/**
 * Reject location-sensitive link syntax before a Node merge moves any files.
 * A relative link is safe unchanged only if its referenced child moves with
 * the source folder to the exact path it will resolve to from the new note.
 * This is intentionally a fail-closed guard, not an unproved Markdown rewrite.
 */
export function assertMergeLinksKeepDestinations(
  source: string, oldNote: string, newNote: string,
  sourceFolder: string, targetFolder: string, retiredNote: string,
): void {
  if (oldNote === newNote) return;
  let fence: { mark: string; width: number } | null = null;
  let comment: "html" | "obsidian" | null = null;
  for (const line of source.split(/\r\n|\r|\n/u)) {
    if (fence !== null) {
      const close = new RegExp("^ {0,3}" + fence.mark + "{" + fence.width + ",}[ \\t]*$", "u");
      if (close.test(line)) fence = null;
      continue;
    }
    const opening = comment === null ? /^ {0,3}(\x60{3,}|~{3,})(.*)$/u.exec(line) : null;
    if (opening?.[1] != null && !(opening[1][0] === "\x60" && (opening[2] ?? "").includes("\x60"))) {
      fence = { mark: opening[1][0] ?? "~", width: opening[1].length };
      continue;
    }
    const masked = maskInlineLiterals(line, comment);
    comment = masked.comment;
    const visible = masked.text;
    const matches = /!?\[[^\]\r\n]*\]\(([^)\r\n]*)\)/gu;
    const covered = new Set<number>();
    for (const link of visible.matchAll(matches)) {
      if (link.index === undefined || link[1] === undefined) continue;
      covered.add(link.index + link[0].indexOf("]("));
      const content = link[1].trim();
      const raw = content.startsWith("<") && content.endsWith(">") ? content.slice(1, -1) : content;
      if (raw === "" || absolute(raw)) continue;
      if (/[%\\()\s]/u.test(raw)) throw new Error("Cannot safely merge an ambiguous relative Markdown link");
      if (raw.startsWith("#") || raw.includes("?")) throw new Error("Cannot safely merge a relative anchor or query");
      const path = raw.split("#", 1)[0] ?? "";
      const before = resolve(oldNote, path);
      if (before === retiredNote) throw new Error("Cannot merge a link to the removed Node Note");
      const moved = before.startsWith(sourceFolder + "/")
        ? targetFolder + before.slice(sourceFolder.length) : before;
      if (moved !== resolve(newNote, path)) {
        throw new Error("Merge would change a relative link target: " + raw);
      }
    }
    for (let index = visible.indexOf("]("); index >= 0; index = visible.indexOf("](", index + 2)) {
      if (!covered.has(index)) throw new Error("Cannot safely merge an unsupported Markdown link");
    }
    // An empty first line can continue its destination on the next line.
    // Refuse that unsupported form at the opener, before any merge effects.
    const definition = /^ {0,3}\[[^\]\r\n]+\]:[ \t]*(\S*)/u.exec(visible);
    if (definition?.[1] != null && !absolute(definition[1])) {
      throw new Error("Cannot safely merge a relative reference definition");
    }
    for (const wiki of visible.matchAll(/!?\[\[([^\]\r\n]+)\]\]/gu)) {
      const path = (wiki[1] ?? "").split(/[#|]/u, 1)[0] ?? "";
      if (path === "." || path === ".." || path.startsWith("./") || path.startsWith("../")) {
        throw new Error("Cannot safely merge a relative WikiLink");
      }
    }
    if (/\b(?:href|src)\s*=\s*["']?\.{1,2}\//iu.test(visible)) {
      throw new Error("Cannot safely merge a relative HTML link");
    }
  }
}

function absolute(path: string): boolean {
  return path.startsWith("/") || /^[A-Za-z][A-Za-z0-9+.-]*:/u.test(path);
}

function resolve(filePath: string, relative: string): string {
  const result = filePath.split("/").slice(0, -1);
  for (const part of relative.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") {
      if (result.length === 0) throw new Error("Merge link escapes the Vault root");
      result.pop();
    } else result.push(part);
  }
  return result.join("/");
}

function maskInlineLiterals(line: string, initial: "html" | "obsidian" | null) {
  const chars = line.split("");
  let cursor = 0;
  let comment = initial;
  while (cursor < line.length) {
    if (comment !== null) {
      const end = comment === "html" ? "-->" : "%%";
      const found = line.indexOf(end, cursor);
      const stop = found < 0 ? line.length : found + end.length;
      for (let i = cursor; i < stop; i += 1) chars[i] = " ";
      if (found >= 0) comment = null;
      cursor = stop;
      continue;
    }
    if (line.startsWith("<!--", cursor) || line.startsWith("%%", cursor)) {
      const isHtml = line.startsWith("<!--", cursor);
      comment = isHtml ? "html" : "obsidian";
      const openingLength = isHtml ? 4 : 2;
      for (let i = cursor; i < cursor + openingLength; i += 1) chars[i] = " ";
      cursor += openingLength;
      continue;
    }
    if (line[cursor] === "\x60") {
      let escaped = 0;
      for (let i = cursor - 1; i >= 0 && line[i] === "\\"; i -= 1) escaped += 1;
      if (escaped % 2 !== 0) { cursor += 1; continue; }
      let width = 1;
      while (line[cursor + width] === "\x60") width += 1;
      let close = -1;
      for (let i = cursor + width; i < line.length;) {
        if (line[i] !== "\x60") { i += 1; continue; }
        let length = 1;
        while (line[i + length] === "\x60") length += 1;
        if (length === width) { close = i + length; break; }
        i += length;
      }
      if (close >= 0) {
        for (let i = cursor; i < close; i += 1) chars[i] = " ";
        cursor = close;
        continue;
      }
      cursor += width;
      continue;
    }
    cursor += 1;
  }
  return { text: chars.join(""), comment };
}
