// The timeline engine: rules + profile + today → dated tasks.
// Pure: no clock, no network, no LLM. Same inputs always give the same output.
import type { Profile } from "@/profile/schema";
import { EVENT_ANCHORS, type Anchor, type DatePoint, type Rule } from "@/rules/schema";
import { applyOffset, maxDate, minDate, type IsoDate } from "./dates";

type EventAnchor = (typeof EVENT_ANCHORS)[number];

/** Dates the profile doesn't hold: plans and outside events, supplied by the UI when known. */
export type EventDates = Partial<Record<EventAnchor, IsoDate>>;

export type Phase = "before_program" | "in_program" | "after_program_end";

export interface TimelineOptions {
  events?: EventDates;
  /** Include draft / needs_verification rules. The UI must label them as unverified. */
  includeUnverified?: boolean;
}

interface ItemBase {
  /** Unique per item; a lead_time rule yields one item per rule it precedes. */
  key: string;
  rule_id: string;
  title: string;
  task: string;
  summary: string;
  authority: Rule["authority"];
  school: string | null;
  rule_status: Rule["status"];
  sources: { source_id: string; source_url: string }[];
  /** Anchors that had no date, so the dates shown are partial or missing. */
  waiting_on: Anchor[];
}

export type TimelineItem = ItemBase &
  (
    | { kind: "window"; opens: IsoDate | null; closes: IsoDate | null; state: "upcoming" | "open" | "closed" | "unknown" }
    | { kind: "deadline"; due: IsoDate | null; precedes?: string; state: "upcoming" | "passed" | "unknown" }
    | {
        kind: "validity";
        valid_until: IsoDate | null;
        needed_on: IsoDate | null;
        state: "valid" | "expired" | "lapses_before_needed" | "missing";
      }
    | { kind: "threshold"; value: number; limit: number; triggered: boolean }
    | { kind: "guidance" }
  );

export function phaseOf(profile: Profile, today: IsoDate): Phase {
  if (today < profile.program_start_date) return "before_program";
  if (today <= profile.program_end_date) return "in_program";
  return "after_program_end";
}

function applies(rule: Rule, profile: Profile, phase: Phase): boolean {
  const w = rule.when;
  if (!w) return true;
  if (w.phase && !w.phase.includes(phase)) return false;
  if (w.degree_level && !w.degree_level.includes(profile.degree_level)) return false;
  if (w.stem_designated !== undefined && w.stem_designated !== profile.stem_designated) return false;
  if (
    w.program_requires_first_year_internship !== undefined &&
    w.program_requires_first_year_internship !== profile.program_requires_first_year_internship
  ) {
    return false;
  }
  return true;
}

export function computeTimeline(
  profile: Profile,
  rules: Rule[],
  today: IsoDate,
  options: TimelineOptions = {},
): TimelineItem[] {
  const events = options.events ?? {};
  const phase = phaseOf(profile, today);

  const anchorDate = (a: Anchor): IsoDate | null => {
    if (a in profile) return (profile as Record<string, unknown>)[a] as IsoDate | null;
    return events[a as EventAnchor] ?? null;
  };

  /** Resolves each point; returns the dates found and the anchors that had none. */
  const resolve = (points: DatePoint[]) => {
    const dates: IsoDate[] = [];
    const missing: Anchor[] = [];
    for (const p of points) {
      const base = anchorDate(p.from);
      if (base === null) missing.push(p.from);
      else dates.push(applyOffset(base, p.offset));
    }
    return { dates, missing };
  };

  const usable = rules.filter(
    (r) => (r.status === "active" || options.includeUnverified) && applies(r, profile, phase),
  );

  const base = (rule: Rule, waiting_on: Anchor[], key = rule.id): ItemBase => ({
    key,
    rule_id: rule.id,
    title: rule.title,
    task: rule.task,
    summary: rule.summary,
    authority: rule.authority,
    school: rule.school,
    rule_status: rule.status,
    sources: rule.sources.map(({ source_id, source_url }) => ({ source_id, source_url })),
    waiting_on: [...new Set(waiting_on)],
  });

  const items: TimelineItem[] = [];

  // Pass 1: every rule that stands on its own.
  for (const rule of usable) {
    const c = rule.computation;
    switch (c.type) {
      case "window": {
        const open = resolve(c.opens_latest_of);
        const close = resolve(c.closes_earliest_of ?? []);
        const opens = open.dates.length ? maxDate(open.dates) : null;
        const closes = close.dates.length ? minDate(close.dates) : null;
        const state =
          opens === null ? "unknown" : today < opens ? "upcoming" : closes !== null && today > closes ? "closed" : "open";
        items.push({ ...base(rule, [...open.missing, ...close.missing]), kind: "window", opens, closes, state });
        break;
      }
      case "deadline": {
        const { dates, missing } = resolve([c.due]);
        const due = dates[0] ?? null;
        const state = due === null ? "unknown" : today > due ? "passed" : "upcoming";
        items.push({ ...base(rule, missing), kind: "deadline", due, state });
        break;
      }
      case "validity": {
        const { dates, missing } = resolve([c.valid_until]);
        const valid_until = dates[0] ?? null;
        const needed_on = anchorDate(c.must_be_valid_on);
        const waiting = needed_on === null ? [...missing, c.must_be_valid_on] : missing;
        const state =
          valid_until === null
            ? "missing"
            : valid_until < today
              ? "expired"
              : needed_on !== null && valid_until < needed_on
                ? "lapses_before_needed"
                : "valid";
        items.push({ ...base(rule, waiting), kind: "validity", valid_until, needed_on, state });
        break;
      }
      case "threshold": {
        const value = profile[c.field];
        items.push({ ...base(rule, []), kind: "threshold", value, limit: c.at_least, triggered: value >= c.at_least });
        break;
      }
      case "guidance":
        items.push({ ...base(rule, []), kind: "guidance" });
        break;
      case "lead_time":
        break; // pass 2
    }
  }

  // Pass 2: lead times shift the closing date of rules computed above.
  for (const rule of usable) {
    const c = rule.computation;
    if (c.type !== "lead_time") continue;
    for (const targetId of c.precedes) {
      const target = items.find((i) => i.rule_id === targetId);
      if (!target) continue; // target doesn't apply to this student right now
      const close =
        target.kind === "window" ? target.closes
        : target.kind === "deadline" ? target.due
        : target.kind === "validity" ? target.valid_until
        : null;
      const due = close === null ? null : applyOffset(close, c.lead);
      const state = due === null ? "unknown" : today > due ? "passed" : "upcoming";
      items.push({
        ...base(rule, target.waiting_on, `${rule.id}:${targetId}`),
        kind: "deadline",
        due,
        precedes: targetId,
        state,
      });
    }
  }

  return items.sort(byDate);
}

function primaryDate(i: TimelineItem): IsoDate | null {
  switch (i.kind) {
    case "window":
      return i.opens ?? i.closes;
    case "deadline":
      return i.due;
    case "validity":
      return i.valid_until;
    default:
      return null;
  }
}

/** Dated items first, earliest first; undated after; ties by key so order is stable. */
function byDate(a: TimelineItem, b: TimelineItem): number {
  const da = primaryDate(a);
  const db = primaryDate(b);
  if (da !== db) {
    if (da === null) return 1;
    if (db === null) return -1;
    return da < db ? -1 : 1;
  }
  return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
}
