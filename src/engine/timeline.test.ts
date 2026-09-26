// Runs the engine against the real rules/ with a fixed "today", so every
// expected date below was worked out by hand from the rule files.
import { describe, expect, it } from "vitest";
import type { Profile } from "@/profile/schema";
import { loadRuleBase } from "@/rules/load";
import { validateRuleBase } from "@/rules/validate";
import { computeTimeline, phaseOf, type TimelineItem } from "./timeline";
import { watchItems } from "./watch";

const { sourcesData, docs } = loadRuleBase(process.cwd());
const { rules, sources } = validateRuleBase(sourcesData, docs);

const student: Profile = {
  program_start_date: "2025-08-25",
  program_end_date: "2027-05-14",
  degree_level: "masters",
  stem_designated: true,
  visa_stamp_expiry: "2028-01-01",
  last_travel_signature_date: "2026-09-01",
  cpt_full_time_days: 0,
  cpt_part_time_days: 0,
  program_requires_first_year_internship: false,
  home_country: "IN",
};

const TODAY = "2026-09-25";
const all = { includeUnverified: true };

const find = (items: TimelineItem[], key: string) => {
  const item = items.find((i) => i.key === key);
  if (!item) throw new Error(`no item ${key}; got ${items.map((i) => i.key).join(", ")}`);
  return item;
};

describe("phaseOf", () => {
  it("places today relative to the program", () => {
    expect(phaseOf(student, "2025-08-01")).toBe("before_program");
    expect(phaseOf(student, "2027-05-14")).toBe("in_program"); // end date itself is still in program
    expect(phaseOf(student, "2027-05-15")).toBe("after_program_end");
  });
});

describe("computeTimeline", () => {
  it("uses only active rules by default (all current rules are unverified)", () => {
    expect(computeTimeline(student, rules, TODAY)).toEqual([]);
  });

  it("is deterministic", () => {
    expect(computeTimeline(student, rules, TODAY, all)).toEqual(computeTimeline(student, rules, TODAY, all));
  });

  describe("an enrolled STEM master's student, no plans entered", () => {
    const items = computeTimeline(student, rules, TODAY, all);

    it("gives the OPT filing window from the program end date, flagged as waiting on the DSO recommendation", () => {
      expect(find(items, "opt-post-completion-filing-window")).toMatchObject({
        kind: "window",
        opens: "2027-02-13",
        closes: "2027-07-13",
        state: "upcoming",
        waiting_on: ["dso_opt_recommendation"],
      });
    });

    it("puts CMU's I-20 turnaround 10 business days before the filing window closes", () => {
      expect(find(items, "cmu-opt-i20-turnaround:opt-post-completion-filing-window")).toMatchObject({
        kind: "deadline",
        due: "2027-06-29",
        precedes: "opt-post-completion-filing-window",
      });
    });

    it("computes travel signature expiry but waits for a re-entry date to judge it", () => {
      expect(find(items, "i20-travel-signature")).toMatchObject({
        kind: "validity",
        valid_until: "2027-09-01",
        needed_on: null,
        state: "valid",
        waiting_on: ["planned_reentry"],
      });
    });

    it("excludes rules for after graduation", () => {
      const keys = items.map((i) => i.key);
      expect(keys).not.toContain("stem-opt-filing-window");
      expect(keys).not.toContain("opt-multiple-employers");
    });

    it("shows the CPT one-year rule to a student whose program doesn't require a first-year internship", () => {
      expect(find(items, "cpt-one-academic-year").kind).toBe("guidance");
    });

    it("does not trigger the CPT threshold at 0 days", () => {
      expect(find(items, "cpt-full-time-opt-ineligibility")).toMatchObject({ triggered: false, value: 0, limit: 365 });
    });

    it("sorts dated items first, earliest first", () => {
      const dated = items.filter((i) => "opens" in i || "due" in i || "valid_until" in i);
      const firstUndated = items.findIndex((i) => i.kind === "guidance" || i.kind === "threshold");
      expect(items.slice(0, 3).map((i) => i.key)).toEqual([
        "opt-post-completion-filing-window",
        "cmu-opt-i20-turnaround:opt-post-completion-filing-window",
        "i20-travel-signature",
      ]);
      expect(firstUndated).toBeGreaterThanOrEqual(3);
      expect(dated.length).toBeGreaterThan(0);
    });
  });

  it("hides the CPT one-year rule when the program requires a first-year internship", () => {
    const exempt = { ...student, program_requires_first_year_internship: true };
    const keys = computeTimeline(exempt, rules, TODAY, all).map((i) => i.key);
    expect(keys).not.toContain("cpt-one-academic-year");
  });

  it("triggers the CPT threshold at exactly 365 full-time days, not on part-time days", () => {
    const at365 = computeTimeline({ ...student, cpt_full_time_days: 365 }, rules, TODAY, all);
    expect(find(at365, "cpt-full-time-opt-ineligibility")).toMatchObject({ triggered: true });
    const partTime = computeTimeline({ ...student, cpt_part_time_days: 400 }, rules, TODAY, all);
    expect(find(partTime, "cpt-full-time-opt-ineligibility")).toMatchObject({ triggered: false });
  });

  it("with a trip planned, judges the signature on the re-entry date and dates the CMU request", () => {
    const events = { planned_departure: "2026-12-18", planned_reentry: "2027-01-10" };
    const items = computeTimeline(student, rules, TODAY, { ...all, events });
    expect(find(items, "i20-travel-signature")).toMatchObject({ state: "valid", needed_on: "2027-01-10", waiting_on: [] });
    expect(find(items, "cmu-i20-travel-signature-request")).toMatchObject({ due: "2026-12-11", state: "upcoming" });
  });

  it("flags a signature that is valid today but lapses before re-entry", () => {
    const items = computeTimeline({ ...student, last_travel_signature_date: "2026-01-05" }, rules, TODAY, {
      ...all,
      events: { planned_reentry: "2027-01-10" },
    });
    expect(find(items, "i20-travel-signature")).toMatchObject({ valid_until: "2027-01-05", state: "lapses_before_needed" });
  });

  it("reports a missing signature rather than inventing a date", () => {
    const items = computeTimeline({ ...student, last_travel_signature_date: null }, rules, TODAY, all);
    expect(find(items, "i20-travel-signature")).toMatchObject({ valid_until: null, state: "missing" });
  });

  it("an early DSO recommendation pulls the OPT window's close forward, and the I-20 lead time with it", () => {
    const items = computeTimeline(student, rules, TODAY, { ...all, events: { dso_opt_recommendation: "2027-06-01" } });
    expect(find(items, "opt-post-completion-filing-window")).toMatchObject({
      opens: "2027-06-01",
      closes: "2027-06-30", // recommendation + 29, earlier than program end + 60
      waiting_on: [],
    });
    expect(find(items, "cmu-opt-i20-turnaround:opt-post-completion-filing-window")).toMatchObject({ due: "2027-06-16" });
  });

  describe("after graduation, on OPT with a STEM degree", () => {
    const items = computeTimeline(student, rules, "2027-08-01", { ...all, events: { opt_ead_end_date: "2028-08-15" } });

    it("marks the post-completion OPT window closed", () => {
      expect(find(items, "opt-post-completion-filing-window")).toMatchObject({ state: "closed" });
    });

    it("gives the STEM filing window from the EAD end date", () => {
      expect(find(items, "stem-opt-filing-window")).toMatchObject({
        opens: "2028-05-17",
        closes: "2028-08-14",
        state: "upcoming",
        waiting_on: ["dso_stem_recommendation"],
      });
    });

    it("dates the 180-day continuation and the I-20 lead for STEM", () => {
      expect(find(items, "stem-opt-180-day-continuation")).toMatchObject({ due: "2029-02-11" });
      expect(find(items, "cmu-opt-i20-turnaround:stem-opt-filing-window")).toMatchObject({ due: "2028-07-31" });
    });

    it("leaves STEM rules out entirely for a non-STEM degree", () => {
      const nonStem = computeTimeline({ ...student, stem_designated: false }, rules, "2027-08-01", all);
      expect(nonStem.map((i) => i.key).filter((k) => k.includes("stem"))).toEqual([]);
    });
  });
});

describe("watchItems", () => {
  it("surfaces pending changes from sources, including the enjoined D/S rule", () => {
    const watch = watchItems(sources);
    expect(watch.length).toBeGreaterThanOrEqual(3);
    expect(watch.some((w) => w.status === "enjoined")).toBe(true);
    expect(watch.some((w) => /H-1B/.test(w.summary))).toBe(true);
  });
});
