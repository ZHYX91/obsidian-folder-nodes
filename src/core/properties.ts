export const FOLDER_NODES_PROPERTY = "folder-nodes";

export const LEGACY_CHILDREN_SORT_PROPERTY = "folderNodeChildrenSort";
export const LEGACY_SIBLING_RANK_PROPERTY = "folderNodeSiblingRank";
export const LEGACY_HIDDEN_PROPERTY = "folderNodeHidden";

export const LEGACY_FOLDER_NODES_PROPERTIES = [
  LEGACY_CHILDREN_SORT_PROPERTY,
  LEGACY_SIBLING_RANK_PROPERTY,
  LEGACY_HIDDEN_PROPERTY,
] as const;

export const ICON_PROPERTY = "icon";

export type FolderNodesTokenKey = "hidden" | "order" | "rank";
export type FolderNodesPropertyIssueField = "all" | FolderNodesTokenKey;

export interface FolderNodesPropertyIssue {
  readonly code:
    | "canonical-type"
    | "conflict"
    | "duplicate-key"
    | "invalid-value"
    | "legacy-type"
    | "malformed-token"
    | "source-ambiguous";
  readonly field: FolderNodesPropertyIssueField;
  readonly message: string;
}

export interface ResolvedFolderNodesProperties {
  readonly blockedFields: ReadonlySet<FolderNodesPropertyIssueField>;
  readonly canonicalEntries: readonly string[];
  readonly canonicalPresent: boolean;
  readonly hidden: boolean;
  readonly issues: readonly FolderNodesPropertyIssue[];
  readonly legacyKeysPresent: readonly string[];
  readonly order: "manual" | null;
  readonly rank: number | null;
  readonly redundantLegacyKeys: readonly string[];
  readonly unknownEntries: readonly string[];
}

interface CanonicalValues {
  hidden?: true;
  order?: "manual";
  rank?: number;
}

interface LegacyValues {
  hidden?: boolean;
  order?: "manual";
  rank?: number;
}

const KNOWN_KEYS = new Set<FolderNodesTokenKey>(["hidden", "order", "rank"]);

export function resolveFolderNodesProperties(
  frontmatter: Readonly<Record<string, unknown>> | null | undefined,
  sourceIssues: readonly FolderNodesPropertyIssue[] = [],
): ResolvedFolderNodesProperties {
  const record = frontmatter ?? {};
  const issues: FolderNodesPropertyIssue[] = [...sourceIssues];
  const blockedFields = new Set<FolderNodesPropertyIssueField>(sourceIssues.map(({ field }) => field));
  const canonicalPresent = hasOwn(record, FOLDER_NODES_PROPERTY);
  const canonicalEntries: string[] = [];
  const unknownEntries: string[] = [];
  const canonical: CanonicalValues = {};
  const seen = new Set<FolderNodesTokenKey>();

  if (canonicalPresent) {
    const raw = record[FOLDER_NODES_PROPERTY];
    if (!Array.isArray(raw)) {
      addIssue(issues, blockedFields, {
        code: "canonical-type",
        field: "all",
        message: `${FOLDER_NODES_PROPERTY} must be a list of key=value text items`,
      });
    } else {
      for (const item of raw) {
        if (typeof item !== "string" || item.trim() !== item) {
          addIssue(issues, blockedFields, {
            code: "malformed-token",
            field: "all",
            message: `${FOLDER_NODES_PROPERTY} contains a non-text or padded item`,
          });
          continue;
        }
        canonicalEntries.push(item);
        const match = /^([a-z][a-z0-9-]*)=(.+)$/u.exec(item);
        if (match === null) {
          addIssue(issues, blockedFields, {
            code: "malformed-token",
            field: "all",
            message: `Invalid ${FOLDER_NODES_PROPERTY} item: ${item}`,
          });
          continue;
        }
        const rawKey = match[1] ?? "";
        const value = match[2] ?? "";
        if (!KNOWN_KEYS.has(rawKey as FolderNodesTokenKey)) {
          unknownEntries.push(item);
          continue;
        }
        const key = rawKey as FolderNodesTokenKey;
        if (seen.has(key)) {
          addIssue(issues, blockedFields, {
            code: "duplicate-key",
            field: key,
            message: `Duplicate ${FOLDER_NODES_PROPERTY} item: ${key}`,
          });
          continue;
        }
        seen.add(key);
        if (key === "order" && value === "manual") canonical.order = "manual";
        else if (key === "hidden" && value === "true") canonical.hidden = true;
        else if (key === "rank" && /^[1-9]\d*$/u.test(value)) {
          const parsed = Number(value);
          if (Number.isSafeInteger(parsed)) canonical.rank = parsed;
          else addInvalidCanonicalIssue(issues, blockedFields, key, item);
        } else addInvalidCanonicalIssue(issues, blockedFields, key, item);
      }
    }
  }

  const legacy: LegacyValues = {};
  const legacyKeysPresent: string[] = [];
  readLegacy(record, LEGACY_CHILDREN_SORT_PROPERTY, "order", legacyKeysPresent, issues, blockedFields, (raw) => raw === "manual" ? "manual" : null, legacy);
  readLegacy(record, LEGACY_SIBLING_RANK_PROPERTY, "rank", legacyKeysPresent, issues, blockedFields, (raw) =>
    typeof raw === "number" && Number.isSafeInteger(raw) && raw > 0 ? raw : null, legacy);
  readLegacy(record, LEGACY_HIDDEN_PROPERTY, "hidden", legacyKeysPresent, issues, blockedFields, (raw) =>
    typeof raw === "boolean" ? raw : null, legacy);

  const redundantLegacyKeys: string[] = [];
  compareDualValue("order", LEGACY_CHILDREN_SORT_PROPERTY, canonical.order, legacy.order, redundantLegacyKeys, issues, blockedFields);
  compareDualValue("rank", LEGACY_SIBLING_RANK_PROPERTY, canonical.rank, legacy.rank, redundantLegacyKeys, issues, blockedFields);
  compareDualValue("hidden", LEGACY_HIDDEN_PROPERTY, canonical.hidden, legacy.hidden, redundantLegacyKeys, issues, blockedFields);

  const allBlocked = blockedFields.has("all");
  return {
    blockedFields,
    canonicalEntries,
    canonicalPresent,
    hidden: allBlocked || blockedFields.has("hidden") ? false : canonical.hidden ?? legacy.hidden ?? false,
    issues,
    legacyKeysPresent,
    order: allBlocked || blockedFields.has("order") ? null : canonical.order ?? legacy.order ?? null,
    rank: allBlocked || blockedFields.has("rank") ? null : canonical.rank ?? legacy.rank ?? null,
    redundantLegacyKeys,
    unknownEntries,
  };
}

export function folderNodesPropertyWriteIsSafe(
  resolution: ResolvedFolderNodesProperties,
  field: FolderNodesTokenKey,
): boolean {
  return !resolution.blockedFields.has("all") && !resolution.blockedFields.has(field);
}

export function canonicalFolderNodesEntries(
  values: { readonly hidden: boolean; readonly order: "manual" | null; readonly rank: number | null },
  unknownEntries: readonly string[] = [],
): string[] {
  return [
    ...(values.order === "manual" ? ["order=manual"] : []),
    ...(values.rank !== null ? [`rank=${values.rank}`] : []),
    ...(values.hidden ? ["hidden=true"] : []),
    ...unknownEntries,
  ];
}

function readLegacy<T extends keyof LegacyValues>(
  record: Readonly<Record<string, unknown>>,
  property: string,
  field: T,
  present: string[],
  issues: FolderNodesPropertyIssue[],
  blockedFields: Set<FolderNodesPropertyIssueField>,
  parse: (raw: unknown) => LegacyValues[T] | null,
  legacy: LegacyValues,
): void {
  if (!hasOwn(record, property)) return;
  present.push(property);
  const parsed = parse(record[property]);
  if (parsed !== null) {
    legacy[field] = parsed;
    return;
  }
  addIssue(issues, blockedFields, {
    code: "legacy-type",
    field,
    message: `Invalid legacy property ${property}`,
  });
}

function compareDualValue<T extends FolderNodesTokenKey>(
  field: T,
  legacyProperty: string,
  canonical: CanonicalValues[T] | undefined,
  legacy: LegacyValues[T] | undefined,
  redundant: string[],
  issues: FolderNodesPropertyIssue[],
  blockedFields: Set<FolderNodesPropertyIssueField>,
): void {
  if (canonical === undefined || legacy === undefined) return;
  if (canonical === legacy) {
    redundant.push(legacyProperty);
    return;
  }
  addIssue(issues, blockedFields, {
    code: "conflict",
    field,
    message: `Conflicting ${field} values in ${FOLDER_NODES_PROPERTY} and ${legacyProperty}`,
  });
}

function addInvalidCanonicalIssue(
  issues: FolderNodesPropertyIssue[],
  blockedFields: Set<FolderNodesPropertyIssueField>,
  field: FolderNodesTokenKey,
  item: string,
): void {
  addIssue(issues, blockedFields, {
    code: "invalid-value",
    field,
    message: `Invalid ${FOLDER_NODES_PROPERTY} item: ${item}`,
  });
}

function addIssue(
  issues: FolderNodesPropertyIssue[],
  blockedFields: Set<FolderNodesPropertyIssueField>,
  issue: FolderNodesPropertyIssue,
): void {
  issues.push(issue);
  blockedFields.add(issue.field);
}

function hasOwn(record: Readonly<Record<string, unknown>>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}
