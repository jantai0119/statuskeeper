"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { Profile } from "@/profile/schema";

interface Props {
  initial: Profile | null;
  onSave: (profile: Profile) => void;
  onCancel?: () => void;
}

type Errors = Partial<Record<keyof Profile | "form", string>>;

function fromForm(fd: FormData) {
  const text = (k: string) => String(fd.get(k) ?? "").trim();
  return {
    program_start_date: text("program_start_date"),
    program_end_date: text("program_end_date"),
    degree_level: text("degree_level"),
    stem_designated: fd.get("stem_designated") === "on",
    visa_stamp_expiry: text("visa_stamp_expiry"),
    last_travel_signature_date: text("last_travel_signature_date") || null,
    cpt_full_time_days: Number(text("cpt_full_time_days") || 0),
    cpt_part_time_days: Number(text("cpt_part_time_days") || 0),
    program_requires_first_year_internship: fd.get("program_requires_first_year_internship") === "on",
    home_country: text("home_country").toUpperCase(),
  };
}

/** Schema messages are for developers; these are for students. */
function friendly(field: keyof Profile, value: unknown): string {
  if (value === "" || value === null || Number.isNaN(value)) return "Required";
  if (field === "home_country") return "Use a two-letter country code, like IN";
  if (field === "cpt_full_time_days" || field === "cpt_part_time_days") return "Enter a whole number of days, 0 or more";
  return "Enter a valid date";
}

export function ProfileForm({ initial, onSave, onCancel }: Props) {
  const [errors, setErrors] = useState<Errors>({});

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const raw = fromForm(new FormData(e.currentTarget));
    const parsed = Profile.safeParse(raw);
    if (!parsed.success) {
      const next: Errors = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0] as keyof Profile;
        next[field] ??= friendly(field, raw[field]);
      }
      setErrors(next);
      return;
    }
    if (parsed.data.program_end_date <= parsed.data.program_start_date) {
      setErrors({ program_end_date: "Must be after the start date" });
      return;
    }
    setErrors({});
    onSave(parsed.data);
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-6 rounded-xl border border-border bg-card p-5 sm:p-6">
      <div>
        <h2 className="text-lg font-semibold">Your details</h2>
        <p className="mt-1 text-sm text-muted">
          Saved only in this browser. Nothing is sent anywhere, and nothing here identifies you.
        </p>
      </div>

      <Group title="Program">
        <Field label="Program start date" error={errors.program_start_date}>
          <input type="date" name="program_start_date" defaultValue={initial?.program_start_date} className={input} />
        </Field>
        <Field label="Program end date" hint="The end date on your I-20" error={errors.program_end_date}>
          <input type="date" name="program_end_date" defaultValue={initial?.program_end_date} className={input} />
        </Field>
        <Field label="Degree level" error={errors.degree_level}>
          <select name="degree_level" defaultValue={initial?.degree_level ?? "masters"} className={input}>
            <option value="masters">Master&apos;s</option>
            <option value="bachelors" disabled>
              Bachelor&apos;s (not supported yet)
            </option>
            <option value="doctorate" disabled>
              Doctorate (not supported yet)
            </option>
          </select>
        </Field>
        <Field label="Home country" hint="Two-letter code, e.g. IN, CN, KR" error={errors.home_country}>
          <input
            name="home_country"
            maxLength={2}
            defaultValue={initial?.home_country}
            autoComplete="off"
            className={`${input} uppercase`}
          />
        </Field>
        <Check
          name="stem_designated"
          label="My degree is STEM-designated"
          hint="Your I-20 lists a STEM CIP code"
          defaultChecked={initial?.stem_designated}
        />
        <Check
          name="program_requires_first_year_internship"
          label="My program requires an internship in the first year"
          hint="Required for every student in the program, not just allowed"
          defaultChecked={initial?.program_requires_first_year_internship}
        />
      </Group>

      <Group title="Travel">
        <Field label="Visa stamp expiry" hint="On the visa sticker in your passport" error={errors.visa_stamp_expiry}>
          <input type="date" name="visa_stamp_expiry" defaultValue={initial?.visa_stamp_expiry} className={input} />
        </Field>
        <Field
          label="Last I-20 travel signature"
          hint="Leave blank if you've never had one"
          error={errors.last_travel_signature_date}
        >
          <input
            type="date"
            name="last_travel_signature_date"
            defaultValue={initial?.last_travel_signature_date ?? ""}
            className={input}
          />
        </Field>
      </Group>

      <Group title="CPT used at this degree level">
        <Field label="Full-time CPT days" hint="More than 20 hours a week" error={errors.cpt_full_time_days}>
          <input
            type="number"
            min={0}
            name="cpt_full_time_days"
            defaultValue={initial?.cpt_full_time_days ?? 0}
            className={input}
          />
        </Field>
        <Field label="Part-time CPT days" hint="20 hours a week or less" error={errors.cpt_part_time_days}>
          <input
            type="number"
            min={0}
            name="cpt_part_time_days"
            defaultValue={initial?.cpt_part_time_days ?? 0}
            className={input}
          />
        </Field>
      </Group>

      <div className="flex gap-3">
        <button type="submit" className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-background hover:opacity-90">
          Save and show my timeline
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className="rounded-lg border border-border px-4 py-2 text-sm">
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}

const input =
  "mt-1 block w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-2 focus:outline-accent";

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="space-y-4">
      <legend className="mb-3 text-xs font-semibold uppercase tracking-wide text-subtle">{title}</legend>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </fieldset>
  );
}

function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="font-medium">{label}</span>
      {hint && <span className="block text-xs text-muted">{hint}</span>}
      {children}
      {error && <span className="mt-1 block text-xs text-danger">{error}</span>}
    </label>
  );
}

function Check({ name, label, hint, defaultChecked }: { name: string; label: string; hint: string; defaultChecked?: boolean }) {
  return (
    <label className="flex items-start gap-3 text-sm sm:col-span-2">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} className="mt-1 size-4 accent-[var(--accent)]" />
      <span>
        <span className="font-medium">{label}</span>
        <span className="block text-xs text-muted">{hint}</span>
      </span>
    </label>
  );
}
