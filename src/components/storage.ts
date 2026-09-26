// The only code that touches localStorage. Nothing here is ever sent anywhere.
import { useCallback, useMemo, useSyncExternalStore } from "react";
import { z } from "zod";
import { IsoDate, Profile } from "@/profile/schema";
import { EVENT_ANCHORS } from "@/rules/schema";

export const PROFILE_KEY = "statuskeeper.profile.v1";
export const EVENTS_KEY = "statuskeeper.events.v1";

export const EventDates = z.object(
  Object.fromEntries(EVENT_ANCHORS.map((a) => [a, IsoDate.optional()])) as Record<
    (typeof EVENT_ANCHORS)[number],
    z.ZodOptional<typeof IsoDate>
  >,
);

const LOCAL_CHANGE = "statuskeeper:storage";

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange); // other tabs
  window.addEventListener(LOCAL_CHANGE, onChange); // this tab
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(LOCAL_CHANGE, onChange);
  };
}

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null; // storage blocked (private mode, browser settings)
  }
}

/**
 * A JSON value in localStorage, validated by `schema`.
 * undefined = not loaded yet (server render), null = nothing stored or invalid.
 */
export function useStored<T>(key: string, schema: z.ZodType<T>): [T | null | undefined, (value: T | null) => void] {
  const raw = useSyncExternalStore(
    subscribe,
    () => read(key),
    () => undefined,
  );
  const value = useMemo(() => {
    if (raw === undefined) return undefined;
    if (raw === null) return null;
    try {
      const parsed = schema.safeParse(JSON.parse(raw));
      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  }, [raw, schema]);

  const set = useCallback(
    (next: T | null) => {
      try {
        if (next === null) window.localStorage.removeItem(key);
        else window.localStorage.setItem(key, JSON.stringify(next));
      } catch {
        // storage blocked: the change just won't persist
      }
      window.dispatchEvent(new Event(LOCAL_CHANGE));
    },
    [key],
  );

  return [value, set];
}

export const useProfile = () => useStored(PROFILE_KEY, Profile);
export const useEventDates = () => useStored(EVENTS_KEY, EventDates);

/** Today's date in the viewer's own time zone. The UI reads the clock; the engine never does. */
function localToday(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function subscribeToDayChange(onChange: () => void) {
  const id = window.setInterval(onChange, 60_000);
  return () => window.clearInterval(id);
}

export function useToday(): string | undefined {
  return useSyncExternalStore(subscribeToDayChange, localToday, () => undefined);
}
