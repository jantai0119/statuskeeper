import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { parse } from "yaml";
import type { RuleDocument } from "./validate";

/** Reads rules/sources.yaml and every rule file under rules/federal and rules/schools. */
export function loadRuleBase(repoRoot: string): { sourcesData: unknown; docs: RuleDocument[] } {
  const rulesDir = join(repoRoot, "rules");
  const sourcesData: unknown = parse(readFileSync(join(rulesDir, "sources.yaml"), "utf8"));

  const docs: RuleDocument[] = [];
  for (const sub of ["federal", "schools"]) {
    const entries = readdirSync(join(rulesDir, sub), { recursive: true, withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile() || !/\.ya?ml$/.test(entry.name)) continue;
      const abs = join(entry.parentPath, entry.name);
      docs.push({ path: relative(repoRoot, abs), data: parse(readFileSync(abs, "utf8")) });
    }
  }
  docs.sort((a, b) => a.path.localeCompare(b.path));
  return { sourcesData, docs };
}
