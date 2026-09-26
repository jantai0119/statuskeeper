import type { TimelineItem } from "@/engine/timeline";
import { daysBetween } from "@/engine/dates";
import { ANCHOR_LABELS, formatDate, stateLabel } from "./labels";

interface Props {
  item: TimelineItem;
  today: string;
  sourceTitles: Record<string, string>;
  ruleTitles: Record<string, string>;
}

const TONES = {
  ok: "bg-ok-soft text-ok",
  warn: "bg-warn-soft text-warn",
  danger: "bg-danger-soft text-danger",
  accent: "bg-accent-soft text-accent",
  muted: "bg-border/60 text-muted",
};

function relative(today: string, date: string): string {
  const d = daysBetween(today, date);
  if (d === 0) return "today";
  if (d === 1) return "tomorrow";
  if (d === -1) return "yesterday";
  return d > 0 ? `in ${d} days` : `${-d} days ago`;
}

function when(item: TimelineItem, today: string): { main: string; sub?: string } | null {
  switch (item.kind) {
    case "window":
      if (item.opens && item.closes) {
        const sub = item.state === "open" ? `closes ${relative(today, item.closes)}` : `opens ${relative(today, item.opens)}`;
        return { main: `${formatDate(item.opens)} – ${formatDate(item.closes)}`, sub };
      }
      if (item.opens) return { main: `From ${formatDate(item.opens)}`, sub: relative(today, item.opens) };
      return null;
    case "deadline":
      return item.due ? { main: `By ${formatDate(item.due)}`, sub: relative(today, item.due) } : null;
    case "validity":
      return item.valid_until
        ? {
            main: `Valid until ${formatDate(item.valid_until)}`,
            sub: item.needed_on ? `you return ${formatDate(item.needed_on)}` : relative(today, item.valid_until),
          }
        : null;
    case "threshold":
      return { main: `${item.value} of ${item.limit} days` };
    case "guidance":
      return null;
  }
}

export function TimelineItemCard({ item, today, sourceTitles, ruleTitles }: Props) {
  const state = stateLabel(item);
  const date = when(item, today);
  const past = (item.kind === "window" && item.state === "closed") || (item.kind === "deadline" && item.state === "passed");
  const unverified = item.rule_status !== "active";

  return (
    <article className={`rounded-xl border border-border bg-card p-4 sm:p-5 ${past ? "opacity-60" : ""}`}>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {state && <span className={`rounded-full px-2 py-0.5 font-medium ${TONES[state.tone]}`}>{state.text}</span>}
        <span className="rounded-full border border-border px-2 py-0.5 text-muted">
          {item.authority === "federal" ? "Federal" : (item.school ?? "School").toUpperCase()}
        </span>
        {unverified && (
          <span className="rounded-full border border-dashed border-warn px-2 py-0.5 text-warn" title={`Rule status: ${item.rule_status}`}>
            Unverified
          </span>
        )}
      </div>

      {date && (
        <p className="mt-3 text-base font-semibold tabular-nums">
          {date.main}
          {date.sub && <span className="ml-2 text-sm font-normal text-muted">{date.sub}</span>}
        </p>
      )}
      <h3 className={date ? "mt-1 text-sm font-medium" : "mt-3 text-base font-semibold"}>
        {/* A threshold's task is its warning; below the limit, show what it tracks instead. */}
        {item.kind === "threshold" && !item.triggered ? item.title : item.task}
      </h3>
      {item.kind === "deadline" && item.precedes && (
        <p className="mt-1 text-xs text-muted">So you can still meet: {ruleTitles[item.precedes] ?? item.precedes}</p>
      )}

      {item.waiting_on.length > 0 && (
        <p className="mt-2 text-xs text-warn">
          {date ? "May change once you add: " : "Needs: "}
          {item.waiting_on.map((a) => ANCHOR_LABELS[a]).join(", ")}
        </p>
      )}

      <details className="mt-3 text-sm">
        <summary className="cursor-pointer text-muted hover:text-foreground">Why, and where this comes from</summary>
        <p className="mt-2 leading-relaxed">{item.summary}</p>
        {item.sources.length > 0 ? (
          <ul className="mt-2 space-y-1 text-xs">
            {item.sources.map((s) => (
              <li key={s.source_url}>
                <a href={s.source_url} target="_blank" rel="noreferrer" className="text-accent underline underline-offset-2">
                  {sourceTitles[s.source_id] ?? s.source_id}
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-xs text-warn">No official source linked yet. Based on an info session; confirm with OIE.</p>
        )}
      </details>
    </article>
  );
}
