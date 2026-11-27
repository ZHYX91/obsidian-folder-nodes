import { readFile } from "node:fs/promises";
import path from "node:path";

import ts from "typescript";

function readObjectDeclaration(file, source, name) {
  const module = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, false, ts.ScriptKind.TS);
  for (const statement of module.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || declaration.name.text !== name) continue;
      if (declaration.initializer && ts.isObjectLiteralExpression(declaration.initializer)) {
        return { module, properties: declaration.initializer.properties };
      }
    }
  }
  throw new Error(`Missing locale object ${name} in ${file}`);
}

function propertyName(property, file) {
  if (ts.isPropertyAssignment(property) && (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name))) {
    return property.name.text;
  }
  throw new Error(`Expected a named locale entry in ${file}`);
}

/** Keep source catalogs editable and share their keys once in the production bundle. */
export async function packInterfaceLocales(file) {
  const source = await readFile(file, "utf8");
  const { module, properties } = readObjectDeclaration(file, source, "LANGUAGE_OVERRIDES");
  const imports = new Map();
  for (const statement of module.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
    const bindings = statement.importClause?.namedBindings;
    const specifier = statement.moduleSpecifier.text;
    if (!bindings || !ts.isNamedImports(bindings) || !specifier.startsWith("./locales/")) continue;
    for (const binding of bindings.elements) {
      imports.set(binding.name.text, {
        name: binding.propertyName?.text ?? binding.name.text,
        file: path.resolve(path.dirname(file), `${specifier}.ts`),
      });
    }
  }
  const watchFiles = [file];
  const locales = await Promise.all(properties.map(async (property) => {
    const locale = propertyName(property, file);
    const imported = ts.isIdentifier(property.initializer) ? imports.get(property.initializer.text) : undefined;
    if (!imported) throw new Error(`Expected an imported locale catalog for ${locale}`);
    const input = await readFile(imported.file, "utf8");
    const entries = readObjectDeclaration(imported.file, input, imported.name).properties;
    const messages = new Map();
    for (const entry of entries) {
      const key = propertyName(entry, imported.file);
      if (!ts.isStringLiteral(entry.initializer) || messages.has(key)) {
        throw new Error(`Expected a unique text message for ${locale}.${key}`);
      }
      messages.set(key, entry.initializer.text);
    }
    return { locale, messages, file: imported.file };
  }));
  const keys = [...(locales[0]?.messages.keys() ?? [])];
  if (keys.length === 0) throw new Error("Expected at least one complete interface catalog");
  const catalog = Object.fromEntries(locales.map(({ locale, messages, file: localeFile }) => {
    if (messages.size !== keys.length || keys.some((key) => !messages.has(key))) {
      throw new Error(`Incomplete interface catalog ${locale}`);
    }
    watchFiles.push(localeFile);
    return [locale, keys.map((key) => messages.get(key))];
  }));
  const contents = `
    const keys = ${JSON.stringify(keys)};
    const catalog = ${JSON.stringify(catalog)};
    const dictionaries = {};
    export const LANGUAGE_OVERRIDES = {};
    for (const [locale, messages] of Object.entries(catalog)) {
      Object.defineProperty(LANGUAGE_OVERRIDES, locale, {
        enumerable: true,
        get() {
          return dictionaries[locale] ?? (dictionaries[locale] = Object.fromEntries(keys.map((key, index) => [key, messages[index]])));
        },
      });
    }
  `;
  return { contents, loader: "js", watchFiles };
}

export const interfaceLocalePacking = {
  name: "pack-interface-locales",
  setup(build) {
    build.onLoad({ filter: /locale-overrides\.ts$/ }, (args) => packInterfaceLocales(args.path));
  },
};
