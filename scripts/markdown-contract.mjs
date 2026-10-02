export function semanticText(source) {
  return source.replaceAll("\r\n", "\n").replace(/[*_`]/gu, "").replace(/\s+/gu, " ").trim();
}

export function assertSemanticAnchors(source, anchors, label) {
  const text = semanticText(source);
  for (const anchor of anchors) {
    if (!text.includes(semanticText(anchor))) throw new Error(`${label} is missing semantic anchor: ${anchor}`);
  }
}

function sorted(values) { return [...values].sort(); }

export function technicalSignature(source) {
  const normalized = source.replaceAll("\r\n", "\n");
  const fences = [...normalized.matchAll(/^```[^\n]*\n([\s\S]*?)^```[ \t]*$/gmu)].map((match) => match[1].trim());
  const prose = normalized.replace(/^```[^\n]*\n[\s\S]*?^```[ \t]*$/gmu, "");
  return {
    fences,
    code: sorted([...prose.matchAll(/(?<!`)`([^`\n]+)`(?!`)/gu)].map((match) => match[1].replaceAll("跟随 Obsidian", "Follow Obsidian"))),
    lists: [...prose.matchAll(/^(\s*)([-*+] |\d+\. )/gmu)].map((match) => `${match[1].length}:${/\d/u.test(match[2]) ? "ordered" : "bullet"}`),
    links: sorted([...prose.matchAll(/\[[^\]]*\]\(([^)]+)\)/gu)].map((match) => match[1].replace(/\.(?:en|zh-CN)\.md/gu, ".md"))),
    // Single-digit prose quantities may be spelled out differently in translations.
    numbers: sorted([...prose.matchAll(/\d+(?:\.\d+)*/gu)].map((match) => match[0]).filter((value) => value.includes(".") || Number(value) >= 10)),
  };
}

export function assertTechnicalParity(source, translation, label) {
  const left = technicalSignature(source);
  const right = technicalSignature(translation);
  for (const key of Object.keys(left)) {
    if (JSON.stringify(left[key]) !== JSON.stringify(right[key])) {
      throw new Error(`${label} has mismatched technical ${key}: ${JSON.stringify(left[key])} != ${JSON.stringify(right[key])}`);
    }
  }
}
