/**
 * Tests for isPlayerActiveOnDate — pure function, no mocking required.
 *
 * Business rules (from players.ts JSDoc):
 *  1. Paused players are NEVER active.
 *  2. session_date must be >= player.start_date.
 *  3. session_date must be <= player.end_date (null end_date = unlimited).
 *  4. حصص mode: sessions > 0 required.
 *  5. Monthly mode: rules 1-3 are sufficient.
 */

import { describe, it, expect } from "vitest";
import { isPlayerActiveOnDate } from "../players";

// ── helpers ───────────────────────────────────────────────────────────────────

type MinPlayer = Parameters<typeof isPlayerActiveOnDate>[0];

function player(overrides: Partial<MinPlayer> = {}): MinPlayer {
  return {
    is_paused: false,
    subscription_mode: "شهري",
    sessions: 0,
    start_date: "2024-01-01",
    end_date: "2024-12-31",
    ...overrides,
  };
}

// ── Rule 1: paused player ─────────────────────────────────────────────────────

describe("Rule 1 — paused player", () => {
  it("returns false for a paused monthly player within subscription window", () => {
    expect(
      isPlayerActiveOnDate(player({ is_paused: true }), "2024-06-15")
    ).toBe(false);
  });

  it("returns false for a paused حصص player with sessions remaining", () => {
    expect(
      isPlayerActiveOnDate(
        player({ is_paused: true, subscription_mode: "حصص", sessions: 10 }),
        "2024-06-15"
      )
    ).toBe(false);
  });
});

// ── Rule 2: start_date boundary ───────────────────────────────────────────────

describe("Rule 2 — start_date boundary", () => {
  it("returns false when session_date is before start_date", () => {
    expect(
      isPlayerActiveOnDate(player({ start_date: "2024-06-01" }), "2024-05-31")
    ).toBe(false);
  });

  it("returns true on exactly the start_date", () => {
    expect(
      isPlayerActiveOnDate(player({ start_date: "2024-06-01" }), "2024-06-01")
    ).toBe(true);
  });

  it("returns true after start_date", () => {
    expect(
      isPlayerActiveOnDate(player({ start_date: "2024-06-01" }), "2024-06-15")
    ).toBe(true);
  });
});

// ── Rule 3: end_date boundary ─────────────────────────────────────────────────

describe("Rule 3 — end_date boundary", () => {
  it("returns false when session_date is after end_date", () => {
    expect(
      isPlayerActiveOnDate(player({ end_date: "2024-03-31" }), "2024-04-01")
    ).toBe(false);
  });

  it("returns true on exactly the end_date", () => {
    expect(
      isPlayerActiveOnDate(player({ end_date: "2024-03-31" }), "2024-03-31")
    ).toBe(true);
  });

  it("returns true (unlimited) when end_date is null", () => {
    expect(
      isPlayerActiveOnDate(player({ end_date: null }), "2099-01-01")
    ).toBe(true);
  });
});

// ── Rule 4: حصص mode session count ────────────────────────────────────────────

describe("Rule 4 — حصص mode session count", () => {
  it("returns false when sessions === 0", () => {
    expect(
      isPlayerActiveOnDate(
        player({ subscription_mode: "حصص", sessions: 0 }),
        "2024-06-15"
      )
    ).toBe(false);
  });

  it("returns false when sessions is negative (safety)", () => {
    expect(
      isPlayerActiveOnDate(
        player({ subscription_mode: "حصص", sessions: -1 }),
        "2024-06-15"
      )
    ).toBe(false);
  });

  it("returns true when sessions === 1 (last session)", () => {
    expect(
      isPlayerActiveOnDate(
        player({ subscription_mode: "حصص", sessions: 1 }),
        "2024-06-15"
      )
    ).toBe(true);
  });

  it("returns true when sessions > 0", () => {
    expect(
      isPlayerActiveOnDate(
        player({ subscription_mode: "حصص", sessions: 12 }),
        "2024-06-15"
      )
    ).toBe(true);
  });
});

// ── Rule 5: monthly mode ──────────────────────────────────────────────────────

describe("Rule 5 — monthly mode", () => {
  it("returns true for active monthly player (sessions field is 0, ignored for monthly)", () => {
    expect(
      isPlayerActiveOnDate(
        player({ subscription_mode: "شهري", sessions: 0 }),
        "2024-06-15"
      )
    ).toBe(true);
  });

  it("returns true for monthly player with unlimited subscription (null end_date)", () => {
    expect(
      isPlayerActiveOnDate(
        player({ subscription_mode: "شهري", end_date: null }),
        "2099-12-31"
      )
    ).toBe(true);
  });
});

// ── Combined edge cases ───────────────────────────────────────────────────────

describe("Combined edge cases", () => {
  it("paused + حصص + sessions > 0 still returns false (pause wins)", () => {
    expect(
      isPlayerActiveOnDate(
        player({ is_paused: true, subscription_mode: "حصص", sessions: 5 }),
        "2024-06-15"
      )
    ).toBe(false);
  });

  it("حصص mode with sessions > 0 but expired end_date returns false", () => {
    expect(
      isPlayerActiveOnDate(
        player({ subscription_mode: "حصص", sessions: 5, end_date: "2024-01-15" }),
        "2024-06-15"
      )
    ).toBe(false);
  });

  it("حصص mode with sessions > 0 and start_date in future returns false", () => {
    expect(
      isPlayerActiveOnDate(
        player({
          subscription_mode: "حصص",
          sessions: 5,
          start_date: "2025-01-01",
          end_date: "2025-06-30",
        }),
        "2024-06-15"
      )
    ).toBe(false);
  });

  it("حصص mode with sessions > 0, unlimited end_date, active → true", () => {
    expect(
      isPlayerActiveOnDate(
        player({
          subscription_mode: "حصص",
          sessions: 3,
          end_date: null,
          start_date: "2023-01-01",
        }),
        "2024-06-15"
      )
    ).toBe(true);
  });
});
