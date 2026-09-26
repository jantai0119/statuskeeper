import { z } from "zod";
import { DegreeLevel, IsoDate, PROFILE_FIELDS } from "@/profile/schema";

const Slug = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "expected kebab-case slug");

// ─── Anchors: the dates a computation can start from ───────────────────────────

/** Profile fields that hold dates. Kept in sync with Profile by the refine below. */
export const PROFILE_DATE_FIELDS = [
  "program_start_date",
  "program_end_date",
  "visa_stamp_expiry",
  "last_travel_signature_date",
] as const;

/**
 * Dates that are not in the profile because they are plans or outside events.
 * The engine cannot know them; it either asks, or renders the rule relative
 * to them ("30 days after your DSO recommends OPT").
 */
export const EVENT_ANCHORS = [
  "dso_opt_recommendation",
  "dso_stem_recommendation",
  "planned_departure",
  "planned_reentry",
  "cpt_start_date",
  "opt_ead_start_date",
  "opt_ead_end_date",
] as const;

/** Profile fields that hold counts; the only fields a threshold can test. */
export const PROFILE_NUMBER_FIELDS = ["cpt_full_time_days", "cpt_part_time_days"] as const;

export const Anchor = z.enum([...PROFILE_DATE_FIELDS, ...EVENT_ANCHORS]);
export type Anchor = z.infer<typeof Anchor>;

/**
 * Exactly one unit. Negative = before the anchor.
 * months = calendar months; business_days = Mon–Fri. Holidays are not modelled.
 */
export const Offset = z.union([
  z.strictObject({ days: z.number().int() }),
  z.strictObject({ months: z.number().int() }),
  z.strictObject({ business_days: z.number().int() }),
]);
export type Offset = z.infer<typeof Offset>;

export const DatePoint = z.strictObject({ from: Anchor, offset: Offset });
export type DatePoint = z.infer<typeof DatePoint>;

// ─── Computations ─────────────────────────────────────────────────────────────

/**
 * A period in which something may or must be done.
 * opens: the LATEST of these points. closes: the EARLIEST of these points.
 * Lists let one rule express "90 days before program end, but not before the
 * DSO recommendation" without inventing min/max operators.
 * No closes_earliest_of = open-ended ("you may do this from X on").
 */
const WindowComputation = z.strictObject({
  type: z.literal("window"),
  opens_latest_of: z.array(DatePoint).min(1),
  closes_earliest_of: z.array(DatePoint).min(1).optional(),
});

/** Something that expires, and the date on which it must still be valid. */
const ValidityComputation = z.strictObject({
  type: z.literal("validity"),
  valid_until: DatePoint,
  must_be_valid_on: Anchor,
});

/** A single "do this by" date. */
const DeadlineComputation = z.strictObject({
  type: z.literal("deadline"),
  due: DatePoint,
});

/**
 * A fixed delay that must happen before another rule's dates. The engine
 * applies `lead` (negative: earlier) to each target rule's closing date(s)
 * and shows the result as this rule's task. E.g. a school needs 10 business days to issue the I-20
 * that a USCIS filing depends on: the last day to ask the school is the
 * filing window's close minus 10 business days.
 */
const LeadTimeComputation = z.strictObject({
  type: z.literal("lead_time"),
  precedes: z.array(Slug).min(1),
  lead: Offset,
}).refine((c) => Object.values(c.lead)[0] < 0, {
  path: ["lead"],
  message: "lead must be negative (before the target date)",
});

/** A count in the profile reaching a limit, e.g. full-time CPT days >= 365. Not a date. */
const ThresholdComputation = z.strictObject({
  type: z.literal("threshold"),
  field: z.enum(PROFILE_NUMBER_FIELDS),
  at_least: z.number().int().positive(),
});

/**
 * No date and no test: a requirement or warning shown whenever `when` matches.
 * Use for rules that depend on facts the app deliberately does not collect
 * (employer, job hours, business activity).
 */
const GuidanceComputation = z.strictObject({
  type: z.literal("guidance"),
});

export const Computation = z.discriminatedUnion("type", [
  WindowComputation,
  ValidityComputation,
  DeadlineComputation,
  LeadTimeComputation,
  ThresholdComputation,
  GuidanceComputation,
]);
export type Computation = z.infer<typeof Computation>;

// ─── Conditions ───────────────────────────────────────────────────────────────

/**
 * Where the student is relative to their program, derived by the engine from
 * program dates and "today". Not stored in the profile.
 */
export const Phase = z.enum(["before_program", "in_program", "after_program_end"]);

/**
 * When a rule applies. A fixed set of typed keys, not an expression language:
 * add a key when a real rule needs one. All present keys must match (AND).
 */
export const When = z.strictObject({
  phase: z.array(Phase).min(1).optional(),
  degree_level: z.array(DegreeLevel).min(1).optional(),
  stem_designated: z.boolean().optional(),
  program_requires_first_year_internship: z.boolean().optional(),
});

/** When-keys that read a profile field (phase is derived, not stored). */
const WHEN_PROFILE_KEYS = ["degree_level", "stem_designated", "program_requires_first_year_internship"] as const;

// ─── Rule ─────────────────────────────────────────────────────────────────────

export const RuleSource = z.strictObject({
  /** id of an entry in rules/sources.yaml */
  source_id: Slug,
  /** That source's URL, optionally with a #fragment pointing at the paragraph. */
  source_url: z.url(),
  /** Which part of the rule this source supports. */
  supports: z.string().min(1),
});

export const RuleStatus = z.enum([
  /** Written, not yet confirmed by a human. The engine will not use it. */
  "draft",
  /** Blocked on a specific open question, stated in notes. */
  "needs_verification",
  /** Confirmed: verified_on and effective_date are set. */
  "active",
]);

export const Rule = z
  .strictObject({
    id: Slug,
    title: z.string().min(1),
    /** Plain English, written for the student. The LLM may rephrase this, never replace it. */
    summary: z.string().min(1),
    /** What the timeline shows as the task. */
    task: z.string().min(1),
    authority: z.enum(["federal", "school"]),
    /** null for federal rules; the school slug (e.g. "cmu") for school rules. */
    school: Slug.nullable(),
    /** School rules: ids of the federal rules they narrow. Where stricter, the school rule wins. */
    refines: z.array(Slug).default([]),
    /** Profile fields this rule reads, via computation or when. Empty for pure guidance. */
    applies_to: z.array(z.enum(PROFILE_FIELDS)),
    when: When.optional(),
    computation: Computation,
    /**
     * Monitored sources only (rules/sources.yaml). One-time inputs such as a
     * webinar are cited in notes instead. May be empty while a rule is not
     * active; an active rule needs at least one, so the watcher can detect
     * when it goes stale.
     */
    sources: z.array(RuleSource),
    /** When this version of the rule took legal effect. null = not confirmed from a source. */
    effective_date: IsoDate.nullable(),
    /** When a human last checked this rule against its sources. null = never. */
    verified_on: IsoDate.nullable(),
    status: RuleStatus,
    notes: z.string().optional(),
  })
  .superRefine((rule, ctx) => {
    if (rule.authority === "federal" && rule.school !== null) {
      ctx.addIssue({ code: "custom", path: ["school"], message: "federal rules must have school: null" });
    }
    if (rule.authority === "school" && rule.school === null) {
      ctx.addIssue({ code: "custom", path: ["school"], message: "school rules must name their school" });
    }
    if (rule.authority === "federal" && rule.refines.length > 0) {
      ctx.addIssue({ code: "custom", path: ["refines"], message: "only school rules refine other rules" });
    }
    if (rule.status === "active" && (rule.verified_on === null || rule.effective_date === null)) {
      ctx.addIssue({
        code: "custom",
        path: ["status"],
        message: "active rules need both verified_on and effective_date",
      });
    }
    if (rule.status === "active" && rule.sources.length === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["sources"],
        message: "active rules need at least one monitored source",
      });
    }
    const readsProfile: string[] = anchorsOf(rule.computation).filter((a) =>
      (PROFILE_FIELDS as readonly string[]).includes(a),
    );
    if (rule.computation.type === "threshold") readsProfile.push(rule.computation.field);
    for (const key of WHEN_PROFILE_KEYS) {
      if (rule.when?.[key] !== undefined) readsProfile.push(key);
    }
    for (const field of new Set(readsProfile)) {
      if (!(rule.applies_to as string[]).includes(field)) {
        ctx.addIssue({
          code: "custom",
          path: ["applies_to"],
          message: `rule reads ${field} but applies_to does not list it`,
        });
      }
    }
  });
export type Rule = z.infer<typeof Rule>;

export function anchorsOf(c: Computation): Anchor[] {
  switch (c.type) {
    case "window":
      return [...c.opens_latest_of, ...(c.closes_earliest_of ?? [])].map((p) => p.from);
    case "validity":
      return [c.valid_until.from, c.must_be_valid_on];
    case "deadline":
      return [c.due.from];
    case "lead_time":
    case "threshold":
    case "guidance":
      return [];
  }
}

// ─── sources.yaml ─────────────────────────────────────────────────────────────

const PendingChange = z.strictObject({
  summary: z.string(),
  status: z.string(),
  since: IsoDate.optional(),
  next_event: z.string().optional(),
  /** "watch" = shown in the UI as something to keep an eye on. Never applied by the engine. */
  display: z.literal("watch"),
});

export const Source = z
  .strictObject({
    id: Slug,
    url: z.url(),
    title: z.string(),
    publisher: z.string(),
    layer: z.enum(["federal", "school"]),
    school: Slug.nullable(),
    refines: z.array(Slug).optional(),
    governs: z.array(z.string()).min(1),
    page_last_updated: IsoDate.nullable(),
    last_checked: IsoDate.nullable(),
    status: z.literal("needs_verification").optional(),
    recheck_next_scan: z.boolean().optional(),
    fetch: z.looseObject({ status: z.enum(["ok", "blocked"]), method: z.string() }),
    observed: z.array(z.string()),
    not_stated: z.array(z.string()).optional(),
    pending_changes: z.array(PendingChange).optional(),
    notes: z.string().optional(),
  })
  .superRefine((s, ctx) => {
    if ((s.layer === "federal") !== (s.school === null)) {
      ctx.addIssue({ code: "custom", path: ["school"], message: "school must be null iff layer is federal" });
    }
  });
export type Source = z.infer<typeof Source>;

export const SourcesFile = z.strictObject({
  schema_version: z.literal(1),
  observed_on: IsoDate,
  sources: z.array(Source).min(1),
});
export type SourcesFile = z.infer<typeof SourcesFile>;

// Guard: the typed field lists above must all be real profile fields.
for (const f of [...PROFILE_DATE_FIELDS, ...PROFILE_NUMBER_FIELDS]) {
  if (!(PROFILE_FIELDS as readonly string[]).includes(f)) {
    throw new Error(`rule schema lists unknown profile field: ${f}`);
  }
}
