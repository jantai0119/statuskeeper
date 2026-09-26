"use client";

import type { EventDates } from "@/engine/timeline";
import { EVENT_ANCHORS, type Anchor } from "@/rules/schema";
import { ANCHOR_LABELS } from "./labels";

type EventAnchor = (typeof EVENT_ANCHORS)[number];

interface Props {
  /** Anchors some visible rule is waiting on, plus any already filled in. */
  anchors: EventAnchor[];
  values: EventDates;
  onChange: (next: EventDates) => void;
}

export const isEventAnchor = (a: Anchor): a is EventAnchor => (EVENT_ANCHORS as readonly string[]).includes(a);

export function EventDatesForm({ anchors, values, onChange }: Props) {
  if (anchors.length === 0) return null;

  const set = (anchor: EventAnchor, value: string) => {
    const next = { ...values };
    if (value) next[anchor] = value;
    else delete next[anchor];
    onChange(next);
  };

  return (
    <section className="rounded-xl border border-border bg-card p-4 sm:p-5">
      <h2 className="text-base font-semibold">Dates that sharpen your timeline</h2>
      <p className="mt-1 text-sm text-muted">
        Optional. Add them when you know them; the timeline updates as you type.
      </p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {anchors.map((a) => (
          <label key={a} className="block text-sm">
            <span className="font-medium">{ANCHOR_LABELS[a]}</span>
            <span className="mt-1 flex gap-2">
              <input
                type="date"
                value={values[a] ?? ""}
                onChange={(e) => set(a, e.target.value)}
                className="block w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-2 focus:outline-accent"
              />
              {values[a] && (
                <button
                  type="button"
                  onClick={() => set(a, "")}
                  className="rounded-lg border border-border px-2 text-xs text-muted"
                  aria-label={`Clear ${ANCHOR_LABELS[a]}`}
                >
                  Clear
                </button>
              )}
            </span>
          </label>
        ))}
      </div>
    </section>
  );
}
