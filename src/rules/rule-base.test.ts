// Validates the real files in rules/. This is what fails CI when a rule edit
// (by hand or from a watcher PR) breaks the schema or a cross-reference.
import { describe, expect, it } from "vitest";
import { loadRuleBase } from "./load";
import { validateRuleBase } from "./validate";

describe("rule base in rules/", () => {
  const { sourcesData, docs } = loadRuleBase(process.cwd());
  const result = validateRuleBase(sourcesData, docs);

  it("has no validation errors", () => {
    expect(result.errors).toEqual([]);
  });

  it("loads at least one rule", () => {
    expect(result.rules.length).toBeGreaterThan(0);
  });

  it("has no active rule without a human verification date", () => {
    for (const rule of result.rules.filter((r) => r.status === "active")) {
      expect(rule.verified_on, rule.id).not.toBeNull();
    }
  });
});
