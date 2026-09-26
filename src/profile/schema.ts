import { z } from "zod";

/** ISO calendar date, e.g. "2027-05-14". Strings, not Date objects: no time zones. */
export const IsoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD")
  .refine((s) => {
    const d = new Date(`${s}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(s);
  }, "not a real calendar date");

export const DegreeLevel = z.enum(["bachelors", "masters", "doctorate"]);

/**
 * The whole profile. Stored only in the browser's localStorage.
 * Deliberately small and non-identifying: no name, SEVIS ID, passport number or
 * employer. If a rule seems to need one of those, the rule is wrong, not the profile.
 */
export const Profile = z.object({
  program_start_date: IsoDate,
  program_end_date: IsoDate,
  degree_level: DegreeLevel,
  stem_designated: z.boolean(),
  visa_stamp_expiry: IsoDate,
  last_travel_signature_date: IsoDate.nullable(),
  /** CPT used at the current degree level, full- and part-time separately: only full-time affects OPT. */
  cpt_full_time_days: z.number().int().nonnegative(),
  cpt_part_time_days: z.number().int().nonnegative(),
  /** Graduate programs that require an internship in year one are exempt from CPT's one-year wait. */
  program_requires_first_year_internship: z.boolean(),
  /** ISO 3166-1 alpha-2, e.g. "IN". */
  home_country: z.string().regex(/^[A-Z]{2}$/, "expected ISO 3166-1 alpha-2"),
});
export type Profile = z.infer<typeof Profile>;

export const PROFILE_FIELDS = Profile.keyof().options;
export type ProfileField = (typeof PROFILE_FIELDS)[number];
