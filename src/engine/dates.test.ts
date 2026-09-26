import { describe, expect, it } from "vitest";
import { addBusinessDays, addDays, addMonths, applyOffset } from "./dates";

describe("addDays", () => {
  it("crosses month and year boundaries", () => {
    expect(addDays("2027-05-14", -90)).toBe("2027-02-13");
    expect(addDays("2027-05-14", 60)).toBe("2027-07-13");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });
});

describe("addMonths", () => {
  it("keeps the day of month when it exists", () => {
    expect(addMonths("2026-09-01", 12)).toBe("2027-09-01");
  });

  it("clamps to the end of a shorter month", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2028-01-31", 1)).toBe("2028-02-29"); // leap year
    expect(addMonths("2026-03-31", -1)).toBe("2026-02-28");
  });
});

describe("addBusinessDays", () => {
  it("skips weekends in both directions", () => {
    expect(addBusinessDays("2026-09-25", 1)).toBe("2026-09-28"); // Fri → Mon
    expect(addBusinessDays("2026-09-28", -1)).toBe("2026-09-25"); // Mon → Fri
    expect(addBusinessDays("2027-07-13", -10)).toBe("2027-06-29"); // Tue → Tue, two weeks back
  });

  it("from a weekend, the first step lands on a weekday", () => {
    expect(addBusinessDays("2026-09-26", -1)).toBe("2026-09-25"); // Sat → Fri
  });

  it("returns the same date for zero", () => {
    expect(addBusinessDays("2026-09-26", 0)).toBe("2026-09-26");
  });
});

describe("applyOffset", () => {
  it("dispatches on the offset unit", () => {
    expect(applyOffset("2026-12-18", { business_days: -5 })).toBe("2026-12-11");
    expect(applyOffset("2026-09-01", { months: 12 })).toBe("2027-09-01");
    expect(applyOffset("2028-08-15", { days: 180 })).toBe("2029-02-11");
  });
});
