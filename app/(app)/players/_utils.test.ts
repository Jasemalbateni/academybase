/**
 * Unit tests for players page pure utilities.
 * No React, no Supabase, no side effects — fast and isolated.
 */

import { describe, it, expect } from "vitest";
import {
  computeMonthlyEnd,
  computeSessionsEnd,
  computeExtendEndISO,
  calcStatusFromEnd,
  daysUntilEnd,
  normalizeName,
  findExistingPlayer,
  buildSyntheticHistory,
} from "./_utils";
import type { Player } from "./_types";

// ── computeMonthlyEnd ──────────────────────────────────────────────────────────

describe("computeMonthlyEnd", () => {
  it("returns one month minus one day", () => {
    expect(computeMonthlyEnd("2025-01-01")).toBe("31/01/2025");
  });

  it("handles short months", () => {
    expect(computeMonthlyEnd("2025-02-01")).toBe("28/02/2025");
  });

  it("handles leap year February", () => {
    expect(computeMonthlyEnd("2024-02-01")).toBe("29/02/2024");
  });

  it("clamps end of month (e.g. Jan 31 → Feb 27: addMonthsClamped gives Feb 28, then -1 day)", () => {
    expect(computeMonthlyEnd("2025-01-31")).toBe("27/02/2025");
  });
});

// ── computeSessionsEnd ─────────────────────────────────────────────────────────

describe("computeSessionsEnd", () => {
  // Saturday = JS day 6, Sunday = 0, Monday = 1
  // Arabic: "الأحد"=Sunday, "الاثنين"=Monday, "الثلاثاء"=Tuesday
  // "السبت"=Saturday

  it("returns — when no branch days", () => {
    expect(computeSessionsEnd("2025-01-01", [], 4)).toBe("—");
  });

  it("returns — when sessions <= 0", () => {
    expect(computeSessionsEnd("2025-01-01", ["الاثنين"], 0)).toBe("—");
  });

  it("finds correct end date for weekly sessions", () => {
    // 2025-01-06 is a Monday. 4 Mondays from there: Jan 6, 13, 20, 27
    const result = computeSessionsEnd("2025-01-06", ["الاثنين"], 4);
    expect(result).toBe("27/01/2025");
  });

  it("handles multiple training days per week", () => {
    // 2025-01-06 = Monday. Mon+Wed → Jan 6(Mon), 8(Wed), 13(Mon), 15(Wed)
    const result = computeSessionsEnd("2025-01-06", ["الاثنين", "الأربعاء"], 4);
    expect(result).toBe("15/01/2025");
  });
});

// ── computeExtendEndISO ────────────────────────────────────────────────────────

describe("computeExtendEndISO", () => {
  it("adds calendar days for شهري mode", () => {
    // 30 days from 31/01/2025 → 2025-03-02
    const result = computeExtendEndISO("31/01/2025", "شهري", [], 30);
    expect(result).toBe("2025-03-02");
  });

  it("counts training sessions for حصص mode", () => {
    // Jan 31 is Friday. Next Monday (Feb 3) is the first day after.
    // 4 Mondays from Feb 3: Feb 3, 10, 17, 24
    const result = computeExtendEndISO("31/01/2025", "حصص", ["الاثنين"], 4);
    expect(result).toBe("2025-02-24");
  });

  it("returns null for invalid date", () => {
    expect(computeExtendEndISO("—", "شهري", [], 30)).toBeNull();
  });

  it("returns null for حصص with empty days", () => {
    expect(computeExtendEndISO("31/01/2025", "حصص", [], 4)).toBeNull();
  });
});

// ── calcStatusFromEnd ──────────────────────────────────────────────────────────

describe("calcStatusFromEnd", () => {
  it("returns تجميد when paused", () => {
    expect(calcStatusFromEnd("31/12/2099", true)).toBe("تجميد");
  });

  it("returns نشط when end is far in future", () => {
    expect(calcStatusFromEnd("31/12/2099")).toBe("نشط");
  });

  it("returns قريب when end is within 7 days", () => {
    const today = new Date();
    const soon = new Date(today);
    soon.setDate(today.getDate() + 3);
    const dd = String(soon.getDate()).padStart(2, "0");
    const mm = String(soon.getMonth() + 1).padStart(2, "0");
    const yyyy = soon.getFullYear();
    expect(calcStatusFromEnd(`${dd}/${mm}/${yyyy}`)).toBe("قريب");
  });

  it("returns منتهي when end is in the past", () => {
    expect(calcStatusFromEnd("01/01/2020")).toBe("منتهي");
  });

  it("returns نشط when end is — (no date)", () => {
    expect(calcStatusFromEnd("—")).toBe("نشط");
  });
});

// ── daysUntilEnd ───────────────────────────────────────────────────────────────

describe("daysUntilEnd", () => {
  it("returns null for —", () => {
    expect(daysUntilEnd("—")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(daysUntilEnd("")).toBeNull();
  });

  it("returns negative for past date", () => {
    const d = daysUntilEnd("01/01/2020");
    expect(d).not.toBeNull();
    expect(d!).toBeLessThan(0);
  });

  it("returns positive for future date", () => {
    const d = daysUntilEnd("31/12/2099");
    expect(d).not.toBeNull();
    expect(d!).toBeGreaterThan(0);
  });
});

// ── normalizeName ──────────────────────────────────────────────────────────────

describe("normalizeName", () => {
  it("lowercases and trims", () => {
    expect(normalizeName("  Ahmed  ")).toBe("ahmed");
  });

  it("handles empty string", () => {
    expect(normalizeName("")).toBe("");
  });

  it("handles Arabic names unchanged (already lowercase-neutral)", () => {
    expect(normalizeName("  محمد  ")).toBe("محمد");
  });
});

// ── findExistingPlayer ─────────────────────────────────────────────────────────

describe("findExistingPlayer", () => {
  const players: Player[] = [
    {
      id: "p1", academy_id: "a1", name: "Ahmed Ali", birth: "2010",
      phone: "", branchId: null, subscriptionMode: "شهري",
      sessions: 0, price: 0, start: "—", end: "—",
      isLegacy: false, isPaused: false, avatarUrl: null,
    },
    {
      id: "p2", academy_id: "a1", name: "Sara Mohamed", birth: "2012",
      phone: "", branchId: null, subscriptionMode: "شهري",
      sessions: 0, price: 0, start: "—", end: "—",
      isLegacy: false, isPaused: false, avatarUrl: null,
    },
  ];

  it("finds a match by name+birth", () => {
    const found = findExistingPlayer(players, { name: "ahmed ali", birth: "2010" });
    expect(found?.id).toBe("p1");
  });

  it("returns undefined when no match", () => {
    expect(findExistingPlayer(players, { name: "Unknown", birth: "2000" })).toBeUndefined();
  });

  it("excludes self when excludeId is provided", () => {
    const found = findExistingPlayer(players, { name: "ahmed ali", birth: "2010" }, "p1");
    expect(found).toBeUndefined();
  });

  it("does not match wrong birth year", () => {
    expect(findExistingPlayer(players, { name: "ahmed ali", birth: "2011" })).toBeUndefined();
  });
});

// ── buildSyntheticHistory ──────────────────────────────────────────────────────

describe("buildSyntheticHistory", () => {
  it("returns empty array for empty payments", () => {
    expect(buildSyntheticHistory([])).toEqual([]);
  });

  it("marks first payment as first_registration", () => {
    const events = buildSyntheticHistory([
      {
        id: "pay1", player_id: "p1", academy_id: "a1",
        date: "2024-01-01", amount: "100", kind: "new",
        branch_id: "b1", subscription_end: "2024-01-31",
        created_at: "2024-01-01T00:00:00Z",
      },
    ]);
    expect(events[0].event_type).toBe("first_registration");
  });

  it("marks second payment as renewal", () => {
    const events = buildSyntheticHistory([
      {
        id: "pay1", player_id: "p1", academy_id: "a1",
        date: "2024-01-01", amount: "100", kind: "new",
        branch_id: "b1", subscription_end: "2024-01-31",
        created_at: "2024-01-01T00:00:00Z",
      },
      {
        id: "pay2", player_id: "p1", academy_id: "a1",
        date: "2024-03-01", amount: "100", kind: "renew",
        branch_id: "b1", subscription_end: "2024-03-31",
        created_at: "2024-03-01T00:00:00Z",
      },
    ]);
    const renewal = events.find((e) => e.event_type === "renewal");
    expect(renewal).toBeDefined();
  });

  it("inserts an expired event between payments with a gap > 1 day", () => {
    const events = buildSyntheticHistory([
      {
        id: "pay1", player_id: "p1", academy_id: "a1",
        date: "2024-01-01", amount: "100", kind: "new",
        branch_id: "b1", subscription_end: "2024-01-31",
        created_at: "2024-01-01T00:00:00Z",
      },
      {
        id: "pay2", player_id: "p1", academy_id: "a1",
        date: "2024-03-01", amount: "100", kind: "renew",
        branch_id: "b1", subscription_end: "2024-03-31",
        created_at: "2024-03-01T00:00:00Z",
      },
    ]);
    const expired = events.find((e) => e.event_type === "expired");
    expect(expired).toBeDefined();
    expect(expired?.event_date).toBe("2024-01-31");
  });

  it("does NOT insert expired between adjacent payments (no gap)", () => {
    const events = buildSyntheticHistory([
      {
        id: "pay1", player_id: "p1", academy_id: "a1",
        date: "2024-01-01", amount: "100", kind: "new",
        branch_id: "b1", subscription_end: "2024-01-31",
        created_at: "2024-01-01T00:00:00Z",
      },
      {
        id: "pay2", player_id: "p1", academy_id: "a1",
        date: "2024-02-01", amount: "100", kind: "renew",
        branch_id: "b1", subscription_end: "2024-02-29",
        created_at: "2024-02-01T00:00:00Z",
      },
    ]);
    const expiredBetween = events.filter((e) => e.event_type === "expired");
    // Only a final expired (if last end is past) — not between the two payments
    const betweenExpired = expiredBetween.find((e) => e.event_date === "2024-01-31");
    expect(betweenExpired).toBeUndefined();
  });
});
