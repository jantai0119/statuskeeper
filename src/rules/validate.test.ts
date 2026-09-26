import { describe, expect, it } from "vitest";
import { validateRuleBase, type RuleDocument } from "./validate";

const sources = {
  schema_version: 1,
  observed_on: "2026-09-25",
  sources: [
    {
      id: "fed-page",
      url: "https://example.gov/opt",
      title: "Federal page",
      publisher: "Agency",
      layer: "federal",
      school: null,
      governs: ["opt"],
      page_last_updated: null,
      last_checked: null,
      fetch: { status: "ok", method: "curl" },
      observed: [],
    },
  ],
};

const federalRule = {
  id: "fed-rule",
  title: "Federal rule",
  summary: "Plain English.",
  task: "Do the thing",
  authority: "federal",
  school: null,
  applies_to: ["program_end_date"],
  computation: {
    type: "deadline",
    due: { from: "program_end_date", offset: { days: -90 } },
  },
  sources: [{ source_id: "fed-page", source_url: "https://example.gov/opt#para", supports: "all of it" }],
  effective_date: null,
  verified_on: null,
  status: "draft",
};

const schoolRule = {
  ...federalRule,
  id: "school-rule",
  authority: "school",
  school: "cmu",
  refines: ["fed-rule"],
};

const doc = (path: string, data: unknown): RuleDocument => ({ path, data });
const ok = [doc("rules/federal/fed-rule.yaml", federalRule), doc("rules/schools/cmu/school-rule.yaml", schoolRule)];

const errorsFor = (docs: RuleDocument[], src: unknown = sources) => validateRuleBase(src, docs).errors;

describe("validateRuleBase", () => {
  it("accepts a valid federal rule and a school rule that refines it", () => {
    expect(errorsFor(ok)).toEqual([]);
  });

  it("rejects a computation in free text", () => {
    const bad = { ...federalRule, computation: "program_end minus 90 days" };
    expect(errorsFor([doc("rules/federal/fed-rule.yaml", bad)])).not.toEqual([]);
  });

  it("rejects an offset with two units", () => {
    const bad = {
      ...federalRule,
      computation: { type: "deadline", due: { from: "program_end_date", offset: { days: 1, months: 1 } } },
    };
    expect(errorsFor([doc("rules/federal/fed-rule.yaml", bad)])).not.toEqual([]);
  });

  it("rejects a computation anchored on a profile field missing from applies_to", () => {
    const bad = { ...federalRule, applies_to: ["degree_level"] };
    expect(errorsFor([doc("rules/federal/fed-rule.yaml", bad)]).join()).toMatch(/applies_to does not list it/);
  });

  it("allows event anchors that are not profile fields", () => {
    const rule = {
      ...federalRule,
      computation: { type: "deadline", due: { from: "planned_departure", offset: { business_days: -5 } } },
    };
    expect(errorsFor([doc("rules/federal/fed-rule.yaml", rule)])).toEqual([]);
  });

  it("rejects an active rule with no verified_on", () => {
    const bad = { ...federalRule, status: "active", effective_date: "2016-05-10" };
    expect(errorsFor([doc("rules/federal/fed-rule.yaml", bad)]).join()).toMatch(/verified_on/);
  });

  it("rejects an impossible calendar date", () => {
    const bad = { ...federalRule, verified_on: "2026-02-30" };
    expect(errorsFor([doc("rules/federal/fed-rule.yaml", bad)]).join()).toMatch(/not a real calendar date/);
  });

  it("rejects a file whose name does not match its id", () => {
    expect(errorsFor([doc("rules/federal/other-name.yaml", federalRule)]).join()).toMatch(/must match file name/);
  });

  it("rejects a school rule stored under rules/federal", () => {
    const docs = [ok[0], doc("rules/federal/school-rule.yaml", schoolRule)];
    expect(errorsFor(docs).join()).toMatch(/must live under rules\/schools\/cmu\//);
  });

  it("rejects a school rule that refines nothing", () => {
    const bad = { ...schoolRule, refines: [] };
    expect(errorsFor([ok[0], doc("rules/schools/cmu/school-rule.yaml", bad)]).join()).toMatch(
      /must refine at least one federal rule/,
    );
  });

  it("rejects a school rule refining a rule that does not exist", () => {
    expect(errorsFor([ok[1]]).join()).toMatch(/refines unknown rule "fed-rule"/);
  });

  it("rejects a federal rule that names a school", () => {
    const bad = { ...federalRule, school: "cmu" };
    expect(errorsFor([doc("rules/federal/fed-rule.yaml", bad)]).join()).toMatch(/school: null/);
  });

  it("rejects a citation of a source not in sources.yaml", () => {
    const bad = { ...federalRule, sources: [{ ...federalRule.sources[0], source_id: "nowhere" }] };
    expect(errorsFor([doc("rules/federal/fed-rule.yaml", bad)]).join()).toMatch(/unknown source_id/);
  });

  it("rejects a source_url that does not match the cited source", () => {
    const bad = {
      ...federalRule,
      sources: [{ ...federalRule.sources[0], source_url: "https://example.gov/something-else" }],
    };
    expect(errorsFor([doc("rules/federal/fed-rule.yaml", bad)]).join()).toMatch(/source_url does not match/);
  });

  it("rejects duplicate rule ids", () => {
    const docs = [ok[0], doc("rules/schools/cmu/fed-rule.yaml", { ...schoolRule, id: "fed-rule" })];
    expect(errorsFor(docs).join()).toMatch(/duplicate rule id/);
  });

  it("allows a draft rule with no monitored source but rejects it once active", () => {
    const draft = { ...federalRule, sources: [] };
    expect(errorsFor([doc("rules/federal/fed-rule.yaml", draft)])).toEqual([]);
    const active = { ...draft, status: "active", verified_on: "2026-09-25", effective_date: "2016-05-10" };
    expect(errorsFor([doc("rules/federal/fed-rule.yaml", active)]).join()).toMatch(/at least one monitored source/);
  });

  it("requires a when-condition's profile field to be listed in applies_to", () => {
    const bad = { ...federalRule, when: { program_requires_first_year_internship: false } };
    expect(errorsFor([doc("rules/federal/fed-rule.yaml", bad)]).join()).toMatch(
      /reads program_requires_first_year_internship/,
    );
  });

  it("accepts a threshold on a count field and rejects one on a date field", () => {
    const ok1 = {
      ...federalRule,
      applies_to: ["cpt_full_time_days"],
      computation: { type: "threshold", field: "cpt_full_time_days", at_least: 365 },
    };
    expect(errorsFor([doc("rules/federal/fed-rule.yaml", ok1)])).toEqual([]);
    const bad = { ...ok1, computation: { ...ok1.computation, field: "program_end_date" } };
    expect(errorsFor([doc("rules/federal/fed-rule.yaml", bad)])).not.toEqual([]);
  });

  it("rejects a lead_time that precedes a missing or undated rule", () => {
    const lead = {
      ...schoolRule,
      computation: { type: "lead_time", precedes: ["fed-rule"], lead: { business_days: -10 } },
    };
    expect(errorsFor([ok[0], doc("rules/schools/cmu/school-rule.yaml", lead)])).toEqual([]);
    const missing = { ...lead, computation: { ...lead.computation, precedes: ["nowhere"] } };
    expect(errorsFor([ok[0], doc("rules/schools/cmu/school-rule.yaml", missing)]).join()).toMatch(/unknown rule/);
    const guidanceTarget = { ...federalRule, applies_to: [], computation: { type: "guidance" } };
    expect(
      errorsFor([doc("rules/federal/fed-rule.yaml", guidanceTarget), doc("rules/schools/cmu/school-rule.yaml", lead)]).join(),
    ).toMatch(/must precede a dated rule/);
  });

  it("rejects a pending change that is not marked as a watch item", () => {
    const src = structuredClone(sources);
    Object.assign(src.sources[0], { pending_changes: [{ summary: "x", status: "enjoined" }] });
    expect(errorsFor(ok, src).join()).toMatch(/pending_changes/);
  });
});
