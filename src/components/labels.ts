import type { Anchor } from "@/rules/schema";
import type { TimelineItem } from "@/engine/timeline";

/** Plain-English names for the dates a rule can depend on. */
export const ANCHOR_LABELS: Record<Anchor, string> = {
  program_start_date: "Program start date",
  program_end_date: "Program end date",
  visa_stamp_expiry: "Visa stamp expiry",
  last_travel_signature_date: "Last I-20 travel signature (set it in your profile)",
  dso_opt_recommendation: "Date OIE recommends your OPT in SEVIS",
  dso_stem_recommendation: "Date OIE recommends your STEM OPT in SEVIS",
  planned_departure: "Next trip abroad: departure date",
  planned_reentry: "Next trip abroad: date you return to the U.S.",
  cpt_start_date: "CPT start date (on your CPT I-20)",
  opt_ead_start_date: "OPT start date (on your EAD card)",
  opt_ead_end_date: "OPT end date (on your EAD card)",
};

const fmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

/** "2027-02-13" → "Feb 13, 2027". UTC so the date never shifts with the viewer's time zone. */
export const formatDate = (iso: string) => fmt.format(new Date(`${iso}T00:00:00Z`));

export function stateLabel(item: TimelineItem): { text: string; tone: "ok" | "warn" | "danger" | "muted" | "accent" } | null {
  switch (item.kind) {
    case "window":
      return {
        upcoming: { text: "Upcoming", tone: "muted" as const },
        open: { text: "Open now", tone: "accent" as const },
        closed: { text: "Closed", tone: "muted" as const },
        unknown: { text: "Needs a date", tone: "warn" as const },
      }[item.state];
    case "deadline":
      return {
        upcoming: { text: "Upcoming", tone: "muted" as const },
        passed: { text: "Passed", tone: "muted" as const },
        unknown: { text: "Needs a date", tone: "warn" as const },
      }[item.state];
    case "validity":
      return {
        valid: { text: "Valid", tone: "ok" as const },
        expired: { text: "Expired", tone: "danger" as const },
        lapses_before_needed: { text: "Lapses before you return", tone: "danger" as const },
        missing: { text: "None on file", tone: "warn" as const },
      }[item.state];
    case "threshold":
      return item.triggered ? { text: "Limit reached", tone: "danger" } : null;
    case "guidance":
      return null;
  }
}
