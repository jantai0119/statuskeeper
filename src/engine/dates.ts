// Calendar-date arithmetic on ISO "YYYY-MM-DD" strings. Everything is done in
// UTC so a date never shifts with the viewer's time zone.
import type { Offset } from "@/rules/schema";

export type IsoDate = string;

const toDate = (iso: IsoDate) => new Date(`${iso}T00:00:00Z`);
const toIso = (d: Date): IsoDate => d.toISOString().slice(0, 10);

export function addDays(iso: IsoDate, days: number): IsoDate {
  const d = toDate(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return toIso(d);
}

/** Calendar months. A day that doesn't exist in the target month clamps to its last day (Jan 31 + 1 → Feb 28). */
export function addMonths(iso: IsoDate, months: number): IsoDate {
  const d = toDate(iso);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
  return toIso(d);
}

const isWeekend = (d: Date) => d.getUTCDay() === 0 || d.getUTCDay() === 6;

/** Monday–Friday steps. Holidays are not modelled. Zero returns the date unchanged. */
export function addBusinessDays(iso: IsoDate, businessDays: number): IsoDate {
  const d = toDate(iso);
  const step = Math.sign(businessDays);
  let remaining = Math.abs(businessDays);
  while (remaining > 0) {
    d.setUTCDate(d.getUTCDate() + step);
    if (!isWeekend(d)) remaining--;
  }
  return toIso(d);
}

export function applyOffset(iso: IsoDate, offset: Offset): IsoDate {
  if ("days" in offset) return addDays(iso, offset.days);
  if ("months" in offset) return addMonths(iso, offset.months);
  return addBusinessDays(iso, offset.business_days);
}

/** ISO dates compare correctly as strings. */
export const maxDate = (dates: IsoDate[]) => dates.reduce((a, b) => (b > a ? b : a));
export const minDate = (dates: IsoDate[]) => dates.reduce((a, b) => (b < a ? b : a));
