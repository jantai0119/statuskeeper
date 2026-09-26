// Watch items: announced changes that are NOT in force. Shown as heads-ups,
// never fed into computeTimeline.
import type { Source } from "@/rules/schema";

export interface WatchItem {
  source_id: string;
  source_url: string;
  summary: string;
  status: string;
  since?: string;
  next_event?: string;
}

export function watchItems(sources: Source[]): WatchItem[] {
  return sources.flatMap((s) =>
    (s.pending_changes ?? []).map((p) => ({
      source_id: s.id,
      source_url: s.url,
      summary: p.summary,
      status: p.status,
      since: p.since,
      next_event: p.next_event,
    })),
  );
}
