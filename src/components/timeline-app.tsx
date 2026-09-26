"use client";

import { useMemo, useState } from "react";
import { computeTimeline, type TimelineItem } from "@/engine/timeline";
import type { WatchItem } from "@/engine/watch";
import { EVENT_ANCHORS, type Rule } from "@/rules/schema";
import { EventDatesForm, isEventAnchor } from "./event-dates-form";
import { formatDate } from "./labels";
import { ProfileForm } from "./profile-form";
import { useEventDates, useProfile, useToday } from "./storage";
import { TimelineItemCard } from "./timeline-item";

interface Props {
  rules: Rule[];
  watch: WatchItem[];
  sourceTitles: Record<string, string>;
}

/** The date an item is placed by on the timeline, or null if it has none. */
function placeDate(i: TimelineItem): string | null {
  if (i.kind === "window") return i.opens ?? i.closes;
  if (i.kind === "deadline") return i.due;
  if (i.kind === "validity") return i.valid_until;
  return null;
}

const isPast = (i: TimelineItem) =>
  (i.kind === "window" && i.state === "closed") ||
  (i.kind === "deadline" && i.state === "passed") ||
  (i.kind === "validity" && i.state === "expired");

export function TimelineApp({ rules, watch, sourceTitles }: Props) {
  const [profile, setProfile] = useProfile();
  const [storedEvents, setEvents] = useEventDates();
  const today = useToday();
  const [editing, setEditing] = useState(false);
  const events = useMemo(() => storedEvents ?? {}, [storedEvents]);

  // All rules are drafts today, so unverified rules are shown, clearly labelled.
  const options = useMemo(() => ({ events, includeUnverified: true }), [events]);

  const items = useMemo(
    () => (profile && today ? computeTimeline(profile, rules, today, options) : []),
    [profile, rules, today, options],
  );

  // Which dates to ask for: whatever the rules wait on with nothing filled in,
  // plus anything already filled in (so an input doesn't vanish once used).
  const askFor = useMemo(() => {
    if (!profile || !today) return [];
    const needed = new Set<string>(Object.keys(events));
    for (const i of computeTimeline(profile, rules, today, { includeUnverified: true })) {
      for (const a of i.waiting_on) if (isEventAnchor(a)) needed.add(a);
    }
    return EVENT_ANCHORS.filter((a) => needed.has(a));
  }, [profile, rules, today, events]);

  const ruleTitles = useMemo(() => Object.fromEntries(rules.map((r) => [r.id, r.title])), [rules]);

  if (profile === undefined || storedEvents === undefined || today === undefined) {
    return <p className="py-16 text-center text-sm text-muted">Loading…</p>;
  }

  if (profile === null || editing) {
    return (
      <ProfileForm
        initial={profile}
        onSave={(p) => {
          setProfile(p);
          setEditing(false);
        }}
        onCancel={profile ? () => setEditing(false) : undefined}
      />
    );
  }

  const dated = items.filter((i) => placeDate(i) !== null);
  const needsDate = items.filter((i) => placeDate(i) === null && (i.kind === "window" || i.kind === "deadline" || i.kind === "validity"));
  const alerts = items.filter((i) => i.kind === "threshold" && i.triggered);
  const toKnow = items.filter((i) => i.kind === "guidance" || (i.kind === "threshold" && !i.triggered));
  const firstCurrent = dated.findIndex((i) => !isPast(i));
  const card = (i: TimelineItem) => (
    <TimelineItemCard key={i.key} item={i} today={today} sourceTitles={sourceTitles} ruleTitles={ruleTitles} />
  );

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">
          Today is <span className="font-medium text-foreground">{formatDate(today)}</span> · program ends{" "}
          {formatDate(profile.program_end_date)}
        </p>
        <div className="flex gap-2 text-sm">
          <button onClick={() => setEditing(true)} className="rounded-lg border border-border px-3 py-1.5 hover:bg-card">
            Edit details
          </button>
          <button
            onClick={() => {
              if (window.confirm("Delete your saved details and dates from this browser?")) {
                setProfile(null);
                setEvents(null);
              }
            }}
            className="rounded-lg border border-border px-3 py-1.5 text-danger hover:bg-card"
          >
            Clear my data
          </button>
        </div>
      </div>

      {items.some((i) => i.rule_status !== "active") && (
        <div className="rounded-xl border border-dashed border-warn bg-warn-soft p-4 text-sm text-warn">
          <strong className="font-semibold">Unverified rules.</strong> These are drafted from official pages and CMU OIE
          sessions but haven&apos;t been checked by a person yet. Not legal advice: confirm anything important with OIE.
        </div>
      )}

      {alerts.map(card)}

      <section aria-labelledby="timeline-heading" className="space-y-3">
        <h2 id="timeline-heading" className="text-lg font-semibold">
          Timeline
        </h2>
        {dated.length === 0 && <p className="text-sm text-muted">Nothing dated yet for where you are in your program.</p>}
        {dated.map((i, n) => (
          <div key={i.key}>
            {n === firstCurrent && n > 0 && <TodayMarker today={today} />}
            {card(i)}
          </div>
        ))}
      </section>

      <EventDatesForm anchors={askFor} values={events} onChange={setEvents} />

      {needsDate.length > 0 && (
        <section aria-labelledby="needs-heading" className="space-y-3">
          <h2 id="needs-heading" className="text-lg font-semibold">
            Waiting on a date
          </h2>
          {needsDate.map(card)}
        </section>
      )}

      {toKnow.length > 0 && (
        <section aria-labelledby="know-heading" className="space-y-3">
          <h2 id="know-heading" className="text-lg font-semibold">
            Good to know
          </h2>
          {toKnow.map(card)}
        </section>
      )}

      {watch.length > 0 && (
        <section aria-labelledby="watch-heading" className="space-y-3">
          <h2 id="watch-heading" className="text-lg font-semibold">
            Heads-up: changes on the horizon
          </h2>
          <p className="text-sm text-muted">Proposed or paused by a court. Not applied to your timeline.</p>
          {watch.map((w) => (
            <article key={w.id} className="rounded-xl border border-border bg-card p-4 text-sm">
              <span className="rounded-full bg-accent-soft px-2 py-0.5 text-xs font-medium text-accent">
                {w.status === "enjoined" ? "Paused by a court" : w.status === "proposed" ? "Proposed" : w.status}
                {w.since ? ` · ${formatDate(w.since)}` : ""}
              </span>
              <p className="mt-2 leading-relaxed">{w.headline}</p>
              <p className="mt-2 text-xs text-muted">
                Sources:{" "}
                {w.sources.map((s, n) => (
                  <span key={s.source_id}>
                    {n > 0 && ", "}
                    <a href={s.source_url} target="_blank" rel="noreferrer" className="text-accent underline underline-offset-2">
                      {sourceTitles[s.source_id] ?? s.source_id}
                    </a>
                  </span>
                ))}
              </p>
            </article>
          ))}
        </section>
      )}
    </div>
  );
}

function TodayMarker({ today }: { today: string }) {
  return (
    <div className="my-3 flex items-center gap-3 text-xs font-medium text-accent" role="separator">
      <span className="h-px flex-1 bg-accent/40" />
      Today · {formatDate(today)}
      <span className="h-px flex-1 bg-accent/40" />
    </div>
  );
}
