import { Rule, SourcesFile, type Source } from "./schema";

export interface RuleDocument {
  /** Path relative to the repo root, e.g. "rules/federal/opt-filing-window.yaml". */
  path: string;
  data: unknown;
}

export interface ValidationResult {
  rules: Rule[];
  sources: Source[];
  errors: string[];
}

const stripFragment = (url: string) => url.split("#")[0];

/**
 * Checks each file against its schema, then checks the files against each other:
 * ids, locations, refines targets and source citations.
 * Pure: takes parsed data, reads nothing.
 */
export function validateRuleBase(sourcesData: unknown, docs: RuleDocument[]): ValidationResult {
  const errors: string[] = [];

  const parsedSources = SourcesFile.safeParse(sourcesData);
  if (!parsedSources.success) {
    for (const issue of parsedSources.error.issues) {
      errors.push(`rules/sources.yaml: ${issue.path.join(".")}: ${issue.message}`);
    }
  }
  const sources = parsedSources.success ? parsedSources.data.sources : [];
  const sourcesById = new Map<string, Source>();
  for (const s of sources) {
    if (sourcesById.has(s.id)) errors.push(`rules/sources.yaml: duplicate source id "${s.id}"`);
    sourcesById.set(s.id, s);
  }
  const changeIds = new Set(sources.flatMap((s) => (s.pending_changes ?? []).map((p) => p.id)));
  for (const id of changeIds) {
    const hasHeadline = sources.some((s) => s.pending_changes?.some((p) => p.id === id && p.headline));
    if (!hasHeadline) errors.push(`rules/sources.yaml: pending change "${id}" needs a headline on at least one entry`);
  }
  for (const s of sources) {
    for (const target of s.refines ?? []) {
      const t = sourcesById.get(target);
      if (!t) errors.push(`rules/sources.yaml: ${s.id} refines unknown source "${target}"`);
      else if (t.layer !== "federal") errors.push(`rules/sources.yaml: ${s.id} refines non-federal source "${target}"`);
    }
  }

  const rules: Rule[] = [];
  const pathById = new Map<string, string>();
  for (const doc of docs) {
    const parsed = Rule.safeParse(doc.data);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        errors.push(`${doc.path}: ${issue.path.join(".") || "(root)"}: ${issue.message}`);
      }
      continue;
    }
    const rule = parsed.data;

    const fileId = doc.path.split("/").pop()!.replace(/\.ya?ml$/, "");
    if (rule.id !== fileId) errors.push(`${doc.path}: id "${rule.id}" must match file name "${fileId}"`);

    const expectedDir = rule.authority === "federal" ? "rules/federal/" : `rules/schools/${rule.school}/`;
    if (!doc.path.startsWith(expectedDir)) {
      errors.push(`${doc.path}: ${rule.authority} rule must live under ${expectedDir}`);
    }

    if (pathById.has(rule.id)) {
      errors.push(`${doc.path}: duplicate rule id "${rule.id}" (also in ${pathById.get(rule.id)})`);
    }
    pathById.set(rule.id, doc.path);

    for (const [i, cite] of rule.sources.entries()) {
      const source = sourcesById.get(cite.source_id);
      if (!source) {
        errors.push(`${doc.path}: sources.${i}: unknown source_id "${cite.source_id}"`);
      } else if (stripFragment(cite.source_url) !== stripFragment(source.url)) {
        errors.push(`${doc.path}: sources.${i}: source_url does not match ${source.id}'s url in sources.yaml`);
      }
    }

    rules.push(rule);
  }

  // refines is checked after all rules are parsed, since targets can be in any file.
  const rulesById = new Map(rules.map((r) => [r.id, r]));
  for (const rule of rules) {
    for (const target of rule.refines) {
      const t = rulesById.get(target);
      if (!t) errors.push(`${pathById.get(rule.id)}: refines unknown rule "${target}"`);
      else if (t.authority !== "federal") {
        errors.push(`${pathById.get(rule.id)}: refines "${target}", which is not a federal rule`);
      }
    }
    if (rule.authority === "school" && rule.refines.length === 0) {
      errors.push(`${pathById.get(rule.id)}: school rules must refine at least one federal rule`);
    }
    if (rule.computation.type === "lead_time") {
      for (const id of rule.computation.precedes) {
        const target = rulesById.get(id);
        if (!target) {
          errors.push(`${pathById.get(rule.id)}: lead_time precedes unknown rule "${id}"`);
        } else if (!["window", "validity", "deadline"].includes(target.computation.type)) {
          errors.push(`${pathById.get(rule.id)}: lead_time must precede a dated rule; "${id}" is ${target.computation.type}`);
        }
      }
    }
  }

  return { rules, sources, errors };
}
