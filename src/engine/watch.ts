// Watch items: announced changes that are NOT in force. Shown as heads-ups,
// never fed into computeTimeline.
import type { Source } from "@/rules/schema";

export interface WatchItem {
  id: string;
  headline: string;
  status: string;
  since?: string;
  next_event?: string;
  /** Every monitored source that reports this change. */
  sources: { source_id: string; source_url: string }[];
}

/** One item per pending change id, merged across the sources that report it, in file order. */
export function watchItems(sources: Source[]): WatchItem[] {
  const byId = new Map<string, WatchItem>();
  for (const s of sources) {
    for (const p of s.pending_changes ?? []) {
      const item = byId.get(p.id) ?? {
        id: p.id,
        headline: "",
        status: p.status,
        since: p.since,
        next_event: p.next_event,
        sources: [],
      };
      if (!item.headline && p.headline) item.headline = p.headline;
      item.sources.push({ source_id: s.id, source_url: s.url });
      byId.set(p.id, item);
    }
  }
  return [...byId.values()];
}
