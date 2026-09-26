# statuskeeper

A personal F-1 visa compliance timeline: where I am, what's next, and what changed.

F-1 rules are spread across a school's international office, SEVP, USCIS and the
State Department, and they change often. International students end up
re-researching the same questions every term and still miss deadlines.
statuskeeper computes one timeline from a small profile and a rule base where
every date cites its source.

> **Not legal advice.** This is a personal tool. Always confirm with your
> school's DSO and the official source linked on each rule.

## How it works

```
rules/sources.yaml  ──►  rules/**/*.yaml  ──►  computeTimeline(profile, rules, today)  ──►  dated tasks
   (monitored pages)      (versioned rules)        (pure function, no LLM)
```

- **Rules are data, not model knowledge.** Each rule is a YAML file with a
  plain-English summary, a structured date computation, the sources it relies
  on, and who verified it and when. See [`rules/federal/opt-post-completion-filing-window.yaml`](rules/federal/opt-post-completion-filing-window.yaml).
- **Federal and school layers are separate.** A school rule `refines` a federal
  one and wins where it's stricter, so adding a second school never touches
  federal rules.
- **Announced-but-not-in-force changes are "watch" items**, not rules. Example:
  a 2026 rule that would shorten the OPT filing window is blocked in court, so
  it's tracked but never applied.
- **Nothing is verified by a machine.** Rules start as `draft`; only a human
  review sets `verified_on` and makes a rule `active`. CI validates the whole
  rule base on every push.
- **No backend.** The profile (10 fields, nothing identifying) lives in your
  browser's `localStorage`.

An LLM will later be used for exactly two things: rephrasing a rule's summary,
and proposing rule edits as pull requests when a monitored source page changes.
It never computes a date.

## Status

| Piece | State |
| --- | --- |
| Rule + source schema, validator, CI | done |
| Sources (19 pages, federal + Carnegie Mellon) | done, pending human review |
| Rules | 15 drafts: OPT, STEM OPT, CPT, SSN, travel signature, guidance flags |
| Timeline engine | done: pure, tested against the real rules |
| UI | done: profile form, timeline, heads-up; static page |
| Source watcher | next |

v1 targets one segment: F-1 master's students already enrolled at Carnegie Mellon.

## Development

Requires Node 24 (see `.nvmrc`).

```bash
npm install
npm test            # unit tests + validation of every file in rules/
npm run lint
npm run typecheck
npm run dev         # http://localhost:3000
```

Stack: Next.js (App Router), TypeScript, Tailwind, zod, Vitest, ESLint, GitHub Actions, Vercel.

## License

[MIT](LICENSE)
