const FRONTMATTER_BOUNDARY = /^---\s*$/u;

export function patchFrontmatterScalar(source: string, key: string, value: string | number | null): string {
  const lines = source.replaceAll("\r\n", "\n").split("\n");
  const hasFrontmatter = FRONTMATTER_BOUNDARY.test(lines[0] ?? "");
  const end = hasFrontmatter ? lines.slice(1).findIndex((line) => FRONTMATTER_BOUNDARY.test(line)) + 1 : -1;
  const rendered = value === null ? null : `${key}: ${typeof value === "number" ? value : JSON.stringify(value)}`;

  if (!hasFrontmatter || end <= 0) {
    if (rendered === null) return source;
    return `---\n${rendered}\n---\n${source}`;
  }
  const keyPattern = new RegExp(`^${key.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}\\s*:`, "u");
  const index = lines.slice(1, end).findIndex((line) => keyPattern.test(line)) + 1;
  if (index > 0) {
    if (rendered === null) lines.splice(index, 1);
    else lines[index] = rendered;
  } else if (rendered !== null) {
    lines.splice(end, 0, rendered);
  }
  return lines.join("\n");
}

export function createNodeDocument(alias: string | null, body: string): string {
  const normalizedBody = body.trimStart();
  if (alias === null || alias.trim() === "") return normalizedBody;
  return `---\naliases:\n  - ${JSON.stringify(alias.trim())}\n---\n${normalizedBody}`;
}
