@AGENTS.md

# statuskeeper

A personal F-1 visa compliance timeline: where I am, what's next, what changed.
F-1 requirements are split across the school's international office, SEVP,
USCIS and the State Department, and they change often. This puts them in one
timeline, computed from rules that cite their sources.

**v1 user:** one F-1 master's student already enrolled at Carnegie Mellon.
Pre-arrival students, undergrads, PhDs and other schools are later segments.
Don't generalise for them yet, but don't block them either (see "Layers").

## Architecture: non-negotiable

Deviating from any of these needs an explicit discussion with the maintainer first.

1. **The rule base is versioned data in `rules/`, not knowledge in a model.**
   Every date the app shows comes from a YAML rule that cites a source in
   `rules/sources.yaml`.
2. **The timeline engine is a pure function**: `computeTimeline(profile, rules, today)`
   returns dated tasks. No LLM, no network, no `Date.now()` / `new Date()` inside
   it. `today` is an argument so tests are deterministic.
3. **An LLM never computes a date or states a rule.** Later it may only
   (a) rephrase a retrieved rule's `summary` in plain English, and
   (b) propose edits to rule files when a monitored source changes, as a PR
   the maintainer reviews. This applies to you too: never fill a date,
   duration, deadline or eligibility condition from model knowledge. If a
   fetched source doesn't state it, leave it null and say so.
4. **No database, no accounts, no uploads.** The profile lives in
   `localStorage`, has 10 typed fields (`src/profile/schema.ts`) and contains no
   identifying data (no name, SEVIS ID, passport or employer). If a rule seems
   to need one of those, the rule is wrong.

## Rule base conventions

- **Schema:** `src/rules/schema.ts` (zod; the TS types are inferred from it).
  `src/rules/validate.ts` adds the cross-file checks. `src/rules/rule-base.test.ts`
  validates the real `rules/` in CI.
- **Computation is structured, never a sentence.** Dated types: `window`
  (opens at the latest of N points, closes at the earliest of N, or open-ended),
  `validity` (expires at X, must still be valid on Y), `deadline`. Other types:
  `lead_time` (a negative offset applied to other rules' closing dates, e.g. a
  school's I-20 turnaround), `threshold` (a profile count reaching a limit),
  `guidance` (no date; shown when `when` matches, for facts the app doesn't
  collect). Offsets are exactly one of `days` / `months` / `business_days`.
  Add a new type only when a real rule can't be expressed; don't add an
  expression language. Estimates (e.g. USCIS processing time) are guidance,
  never computed dates.
- **Anchors** are profile date fields or named events (`planned_departure`,
  `dso_opt_recommendation`, …). Events aren't stored; the engine asks for them
  or renders the task relative to them.
- **Layers.** Federal rules live in `rules/federal/`. School rules live in
  `rules/schools/<school>/`, set `authority: school` and `refines: [federal ids]`.
  Where a school rule is stricter, it wins for that school. Never merge a
  federal and a school rule into one file: a second school must be addable
  without touching federal files.
- **One-time inputs** (webinar notes, emails) live in `research/` and are cited
  in a rule's `notes` as e.g. "CMU OIE webinar, 2026-09-25", never in
  `sources.yaml` (the watcher can't re-fetch them). A rule may have
  `sources: []` while draft; `active` requires at least one monitored source.
- **`verified_on` and `last_checked` are human-only.** A fetch by a tool or an
  LLM is not verification. Leave them null; the maintainer sets them.
- **Status:** `draft` (not yet human-checked, not used by the engine),
  `needs_verification` (blocked on a named open question), `active` (requires
  `verified_on` and `effective_date`; the validator enforces this).
- **`pending_changes` are watch items, never rules.** Announced-but-not-in-force
  changes (e.g. the enjoined D/S final rule) go in `pending_changes` with
  `display: watch` on the source. The engine never applies them.
- **Pinned regulation text.** While the D/S rule is enjoined, eCFR's "current"
  text shows the enjoined version (e.g. OPT filing "30 days after" instead of 60).
  The eCFR source is pinned to 2026-09-01 on purpose. Don't re-point it at
  current without checking the litigation status.

## Domain modelling decisions

- **CPT:** the federal floor (`sevp-cpt`) and CMU's stricter rules are
  separate. The standard in force is SEVP's August 2026 guidance: the
  internship must be a graduation requirement for every student in the
  program. CMU's CPT page was mid-rewrite on 2026-09-25; re-check it.
- **H-1B is employer-driven.** The student never "applies by X". Model it as a
  calendar (registration, filing, Oct 1 start) with preconditions (on OPT or
  in grace period when the petition is filed; change of status, not consular
  processing). The cap-gap end date is deliberately unset until the
  maintainer verifies it against USCIS.
- **CPT days** are stored as full-time and part-time separately. Only 12+
  months of full-time CPT removes OPT eligibility.
- **Travel signature validity** is checked against the planned re-entry date,
  not today.

## Layout

```
rules/sources.yaml          monitored source pages + what each said when fetched
rules/federal/*.yaml        federal rules
rules/schools/cmu/*.yaml    CMU rules (refine federal ones)
src/profile/schema.ts       the profile (zod)
src/rules/schema.ts         rule + sources schema (zod)
src/rules/validate.ts       pure cross-file validation
src/rules/load.ts           reads rules/ from disk (the only fs code)
src/app/                    Next.js App Router UI (placeholder so far)
```

## Commands

```bash
npm run dev             # local app
npm test                # vitest, includes validation of rules/
npm run validate:rules  # just the rules/ check
npm run lint
npm run typecheck       # next typegen && tsc (typegen provides LayoutProps etc.)
```

Node 24 (`.nvmrc`). npm, not pnpm/yarn. CI: `.github/workflows/ci.yml` runs
lint, typecheck and tests on every push and PR. Deploy target: Vercel.

## Not built yet

The engine (`computeTimeline`), the UI, and the source watcher. Build them in
that order; the engine gets its own tests with fixed `today` values before
any UI uses it.
