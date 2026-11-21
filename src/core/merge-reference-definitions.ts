interface Definition {
  readonly label: string;
  readonly destination: string;
  readonly lines: number;
}

/** A complete first definition at a known block boundary wins throughout its document. */
export function referenceDestinations(lines: readonly string[], original: readonly string[]): Map<string, Set<string>> {
  const candidates = new Map<string, Set<string>>();
  const settled = new Set<string>();
  let lastDefinitionEnd = -1;
  for (let i = 0; i < lines.length; i += 1) {
    if (!/^ {0,3}\[/u.test(lines[i]!)) continue;
    const definition = readDefinition(lines, i);
    if (definition === null) continue;
    const certain = i === 0 || i === lastDefinitionEnd || original[i - 1]!.trim() === "";
    if (!settled.has(definition.label)) {
      const targets = candidates.get(definition.label) ?? new Set<string>();
      targets.add(definition.destination);
      candidates.set(definition.label, targets);
      if (certain) settled.add(definition.label);
    }
    if (certain) {
      lastDefinitionEnd = i + definition.lines;
      i = lastDefinitionEnd - 1;
    }
  }
  return candidates;
}

function readDefinition(lines: readonly string[], first: number): Definition | null {
  let text = lines[first]!;
  let read = 1;
  const append = (): boolean => {
    const next = lines[first + read];
    if (next === undefined || next.trim().length === 0) return false;
    text += `\n${next}`;
    read += 1;
    return true;
  };
  // Labels are bounded; an unfinished label must not scan a whole source again.
  while (/^ {0,3}\[(?:\\.|[^[\]\\]){0,999}$/su.test(text) && append()) { /* continue label */ }
  const label = /^ {0,3}\[((?:\\.|[^[\]\\]){1,999})\]: */su.exec(text);
  if (label === null || label[1]!.trim().length === 0) return null;
  let cursor = label[0].length;
  if (cursor === text.length) {
    if (!append()) return null;
    cursor += /^\n */u.exec(text.slice(cursor))![0].length;
  }
  const start = cursor;
  const angle = text[cursor] === "<";
  if (angle) cursor += 1;
  let depth = 0;
  for (; cursor < text.length; cursor += 1) {
    const character = text[cursor]!;
    if (character === "\\" && /[!-/:-@[-`{-~]/u.test(text[cursor + 1] ?? "")) { cursor += 1; continue; }
    if (angle && character === ">") { depth = -1; cursor += 1; break; }
    if (angle && (character === "<" || character === "\n")) return null;
    if (!angle) {
      if (character <= " " || character === "\u007f") break;
      if (character === "(") depth += 1;
      if (character === ")" && --depth < 0) return null;
    }
  }
  if (angle ? depth !== -1 : cursor === start || depth !== 0) return null;
  const destination = text.slice(angle ? start + 1 : start, angle ? cursor - 1 : cursor);
  const complete = (count: number): Definition | null => count === 0 ? null : {
    label: label[1]!.trim().replace(/\s+/gu, " ").toLowerCase().toUpperCase(),
    destination, lines: count,
  };
  const destinationLines = read;
  const end = cursor;
  while (text[cursor] === " ") cursor += 1;
  const sameLine = cursor < text.length;
  if (!sameLine) {
    if (!append()) return complete(destinationLines);
    cursor += /^\n */u.exec(text.slice(cursor))![0].length;
  } else if (cursor === end) return null;
  const opening = text[cursor];
  const closing = opening === "(" ? ")" : opening;
  const fallback = sameLine ? 0 : destinationLines;
  if (opening !== '"' && opening !== "'" && opening !== "(") return complete(fallback);
  cursor += 1;
  for (;;) {
    if (cursor === text.length) {
      text = "";
      cursor = 0;
      if (!append()) return complete(fallback);
    }
    const character = text[cursor++];
    if (character === "\\" && /[!-/:-@[-`{-~]/u.test(text[cursor] ?? "")) { cursor += 1; continue; }
    if (character === closing) return complete(text.slice(cursor).trim().length === 0 ? read : fallback);
    if (opening === "(" && character === "(") return complete(fallback);
  }
}
