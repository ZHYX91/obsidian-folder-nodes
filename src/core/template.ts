export interface NodeTemplateContext {
  name: string;
  path: string;
  parent: string;
  date: string;
}

export function renderNodeTemplate(source: string, context: NodeTemplateContext): string {
  const replacements: Record<string, string> = {
    "{{name}}": context.name,
    "{{path}}": context.path,
    "{{parent}}": context.parent,
    "{{date}}": context.date,
  };
  return Object.entries(replacements).reduce(
    (text, [token, value]) => text.replaceAll(token, value),
    source,
  );
}
