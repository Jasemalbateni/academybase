/**
 * Tests for orchestrateCancelSession and orchestrateRestoreSession.
 *
 * Strategy:
 *  - Mock browser (createClient), academyId, players, finance, staff-attendance modules
 *  - The Supabase builder mock handles all direct DB calls inside sessions.ts
 *  - extendBranchPlayersByOneSession and reduceSpecificPlayersByOneSession are
 *    mocked at the module level so we can control return values and simulate failures
 *
 * Scenarios:
 *  orchestrateCancelSession:
 *    1. Happy path — no deductCoach, no extendPlayers → ok, empty compensatedIds
 *    2. Happy path — extendPlayers=true, returns compensatedIds
 *    3. Step 1 failure (session upsert fails) → ok:false, no compensatedIds
 *    4. Step 2 failure (coach deduction fails) → ok:false, rollback step 1
 *    5. Step 3 failure (player extend fails) → ok:false, rollback steps 1+2
 *
 *  orchestrateRestoreSession:
 *    1. Happy path — no compensated players → ok:true
 *    2. Happy path — with compensated players → ok:true, reduceSpecific called
 *    3. Step 1 failure (deleteSession fails) → ok:false
 *    4. Step 2 failure (reduceSpecific fails) → ok:false with partial message
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Supabase builder mock ─────────────────────────────────────────────────────
// Flexible builder: all chain methods return the builder itself.
// terminal methods (single, maybeSingle) are vi.fn() with configurable responses.
// The builder is also "thenable" so "await builder" works for queries without
// .single() / .maybeSingle() (e.g. the staff list query).

const mockSingle = vi.fn();
const mockMaybeSingle = vi.fn();

const mockBuilder: Record<string, ReturnType<typeof vi.fn> | Function> = {};

// Chain methods
[
  "from", "select", "insert", "update", "upsert", "delete",
  "eq", "neq", "gte", "lte", "gt", "in", "contains", "order",
].forEach((m) => {
  mockBuilder[m] = vi.fn().mockImplementation(() => mockBuilder);
});

// Terminal methods
mockBuilder["single"] = mockSingle;
mockBuilder["maybeSingle"] = mockMaybeSingle;

// Make the builder thenable so "await supabase.from(...).select(...).eq(...)"
// (without .single()) resolves correctly — needed for staff list query.
(mockBuilder as { then?: Function }).then = (
  onFulfilled: (v: unknown) => unknown,
  onRejected?: (e: unknown) => unknown
) =>
  Promise.resolve({ data: [], error: null }).then(
    onFulfilled as (value: unknown) => unknown,
    onRejected as ((reason: unknown) => unknown) | undefined
  );

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock("../browser", () => ({
  createClient: vi.fn(() => mockBuilder),
}));

vi.mock("../academyId", () => ({
  resolveAcademyId: vi.fn().mockResolvedValue("acad-1"),
}));

// Mock players module — we test that orchestration calls these correctly
// vi.hoisted() ensures these are defined before vi.mock() factories run (which are hoisted)
const { mockExtendBranchPlayers, mockReduceSpecificPlayers } = vi.hoisted(() => ({
  mockExtendBranchPlayers: vi.fn(),
  mockReduceSpecificPlayers: vi.fn(),
}));

vi.mock("../players", () => ({
  extendBranchPlayersByOneSession: mockExtendBranchPlayers,
  reduceSpecificPlayersByOneSession: mockReduceSpecificPlayers,
  isPlayerActiveOnDate: vi.fn().mockReturnValue(true),
}));

// Mock finance module — prevent real Supabase calls from finance helpers
vi.mock("../finance", () => ({
  upsertAutoFinanceTx: vi.fn().mockResolvedValue({ id: "tx-1" }),
  updateFinanceTx: vi.fn().mockResolvedValue({ id: "tx-1" }),
  deleteFinanceTx: vi.fn().mockResolvedValue(undefined),
}));

// Mock staff-attendance module
vi.mock("../staff-attendance", () => ({
  countSessionsInMonth: vi.fn().mockReturnValue(8),
  computeSessionDeduction: vi.fn().mockReturnValue(25),
  ATTENDANCE_STATUS_LABELS: {},
}));

// ── Import after mocks ────────────────────────────────────────────────────────
import {
  orchestrateCancelSession,
  orchestrateRestoreSession,
  type CancelSessionOptions,
} from "../sessions";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const BRANCH_ID = "branch-abc";
const SESSION_DATE = "2024-06-15";
const BRANCH_DAYS = ["الاثنين", "الأربعاء"];

const cancelOpts: CancelSessionOptions = {
  branchId: BRANCH_ID,
  date: SESSION_DATE,
  fieldCost: 0,
  deductCoach: false,
  extendPlayers: false,
  branchDays: BRANCH_DAYS,
  note: "مطر",
};

/** A minimal DbSession returned by a successful session upsert */
const mockSessionRow = {
  id: "sess-1",
  academy_id: "acad-1",
  branch_id: BRANCH_ID,
  date: SESSION_DATE,
  status: "cancelled",
  field_cost: 0,
  coach_cost: 0,
  revenue: 0,
  notes: "مطر",
  created_at: "2024-06-15T10:00:00Z",
  updated_at: "2024-06-15T10:00:00Z",
};

// ── Helper: reset mock state before each test ─────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();

  // Re-apply builder chain returns (clearAllMocks resets mockImplementation)
  [
    "from", "select", "insert", "update", "upsert", "delete",
    "eq", "neq", "gte", "lte", "gt", "in", "contains", "order",
  ].forEach((m) => {
    (mockBuilder[m] as ReturnType<typeof vi.fn>).mockImplementation(() => mockBuilder);
  });

  // Default: all DB calls succeed (session upsert returns valid row)
  mockSingle.mockResolvedValue({ data: mockSessionRow, error: null });
  mockMaybeSingle.mockResolvedValue({ data: null, error: null });

  // Default player mocks
  mockExtendBranchPlayers.mockResolvedValue([]);
  mockReduceSpecificPlayers.mockResolvedValue(undefined);
});

// ─────────────────────────────────────────────────────────────────────────────
// orchestrateCancelSession
// ─────────────────────────────────────────────────────────────────────────────

describe("orchestrateCancelSession", () => {

  it("happy path (no deductCoach, no extendPlayers) → ok:true, empty compensatedIds", async () => {
    const result = await orchestrateCancelSession(cancelOpts);

    expect(result.ok).toBe(true);
    expect(result.compensatedPlayerIds).toEqual([]);
    expect(result.error).toBeUndefined();
  });

  it("happy path with extendPlayers=true → ok:true, returns compensated player IDs", async () => {
    mockExtendBranchPlayers.mockResolvedValue(["player-1", "player-2"]);

    const result = await orchestrateCancelSession({
      ...cancelOpts,
      extendPlayers: true,
    });

    expect(result.ok).toBe(true);
    expect(result.compensatedPlayerIds).toEqual(["player-1", "player-2"]);
    expect(mockExtendBranchPlayers).toHaveBeenCalledWith(
      BRANCH_ID,
      BRANCH_DAYS,
      SESSION_DATE
    );
  });

  it("happy path with extendPlayers=true, no eligible players → empty compensatedIds", async () => {
    mockExtendBranchPlayers.mockResolvedValue([]);

    const result = await orchestrateCancelSession({
      ...cancelOpts,
      extendPlayers: true,
    });

    expect(result.ok).toBe(true);
    expect(result.compensatedPlayerIds).toEqual([]);
  });

  it("step 1 failure (session upsert DB error) → ok:false, Arabic error, no compensatedIds", async () => {
    mockSingle.mockResolvedValue({
      data: null,
      error: { message: "permission denied", code: "42501" },
    });

    const result = await orchestrateCancelSession(cancelOpts);

    expect(result.ok).toBe(false);
    expect(result.error).toContain("فشل تسجيل إلغاء الجلسة");
    expect(result.compensatedPlayerIds).toEqual([]);
  });

  it("step 2 failure (coach deduction throws) → ok:false, error message, empty compensatedIds", async () => {
    // syncSessionFieldFinance (fire-and-forget from upsertSession) also calls
    // maybeSingle() via syncRentAggregateForBranch concurrently with step 2.
    // Use mockRejectedValue (not Once) so ALL maybeSingle calls fail,
    // guaranteeing syncCoachDeductionForSession's branch query also throws.
    mockMaybeSingle.mockRejectedValue(new Error("DB connection lost"));

    const result = await orchestrateCancelSession({
      ...cancelOpts,
      deductCoach: true,
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("فشل خصم راتب الجلسة");
    expect(result.compensatedPlayerIds).toEqual([]);
  });

  it("step 3 failure (extendPlayers throws) → ok:false, rollback triggered", async () => {
    mockExtendBranchPlayers.mockRejectedValue(new Error("players DB error"));

    const result = await orchestrateCancelSession({
      ...cancelOpts,
      extendPlayers: true,
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("فشل تعويض اللاعبين");
    expect(result.compensatedPlayerIds).toEqual([]);
  });

  it("stores fieldCost in the session upsert payload", async () => {
    const withCost = { ...cancelOpts, fieldCost: 50 };
    await orchestrateCancelSession(withCost);

    const upsertArg = (mockBuilder["upsert"] as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(upsertArg.field_cost).toBe(50);
    expect(upsertArg.status).toBe("cancelled");
    expect(upsertArg.branch_id).toBe(BRANCH_ID);
    expect(upsertArg.date).toBe(SESSION_DATE);
  });

  it("does not call extendBranchPlayersByOneSession when extendPlayers=false", async () => {
    await orchestrateCancelSession({ ...cancelOpts, extendPlayers: false });
    expect(mockExtendBranchPlayers).not.toHaveBeenCalled();
  });

  it("does not call syncCoachDeduction when deductCoach=false (no staff attendance records created)", async () => {
    await orchestrateCancelSession({ ...cancelOpts, deductCoach: false });
    // The staff_attendance upsert should not be called
    const upsertCalls = (mockBuilder["upsert"] as ReturnType<typeof vi.fn>).mock.calls;
    const attUpsert = upsertCalls.find((args: unknown[]) => {
      const payload = args[0] as Record<string, unknown>;
      return payload?.status === "no_training";
    });
    expect(attUpsert).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// orchestrateRestoreSession
// ─────────────────────────────────────────────────────────────────────────────

describe("orchestrateRestoreSession", () => {

  it("happy path — no compensated players → ok:true, reduceSpecific not called", async () => {
    const result = await orchestrateRestoreSession(
      BRANCH_ID, SESSION_DATE, [], BRANCH_DAYS
    );

    expect(result.ok).toBe(true);
    expect(result.compensatedPlayerIds).toEqual([]);
    expect(mockReduceSpecificPlayers).not.toHaveBeenCalled();
  });

  it("happy path — with compensated players → ok:true, reduceSpecific called with exact IDs", async () => {
    const ids = ["player-1", "player-2", "player-3"];

    const result = await orchestrateRestoreSession(
      BRANCH_ID, SESSION_DATE, ids, BRANCH_DAYS
    );

    expect(result.ok).toBe(true);
    expect(mockReduceSpecificPlayers).toHaveBeenCalledWith(ids, BRANCH_DAYS);
    expect(mockReduceSpecificPlayers).toHaveBeenCalledTimes(1);
  });

  it("step 1 failure (deleteSession throws via DB error on suppressFieldFinance) → ok:false", async () => {
    // Make the finance_tx query inside suppressSessionFieldFinance throw
    mockMaybeSingle.mockRejectedValueOnce(new Error("network timeout"));

    const result = await orchestrateRestoreSession(
      BRANCH_ID, SESSION_DATE, [], BRANCH_DAYS
    );

    expect(result.ok).toBe(false);
    expect(result.error).toContain("فشل استعادة الجلسة");
    expect(result.compensatedPlayerIds).toEqual([]);
  });

  it("step 2 failure (reduceSpecificPlayers throws) → ok:false with partial success message", async () => {
    const ids = ["player-1"];
    mockReduceSpecificPlayers.mockRejectedValue(new Error("players table locked"));

    const result = await orchestrateRestoreSession(
      BRANCH_ID, SESSION_DATE, ids, BRANCH_DAYS
    );

    expect(result.ok).toBe(false);
    // Message should indicate session was restored but player reversal failed
    expect(result.error).toContain("تمت استعادة الجلسة");
    expect(result.error).toContain("فشل عكس تعويض اللاعبين");
    expect(result.compensatedPlayerIds).toEqual([]);
  });

  it("passes branchDays correctly to reduceSpecificPlayersByOneSession", async () => {
    const ids = ["p-1"];
    const customDays = ["السبت", "الثلاثاء", "الخميس"];

    await orchestrateRestoreSession(BRANCH_ID, SESSION_DATE, ids, customDays);

    expect(mockReduceSpecificPlayers).toHaveBeenCalledWith(ids, customDays);
  });

  it("empty compensated IDs — reduceSpecific not called even when step 1 succeeds", async () => {
    await orchestrateRestoreSession(BRANCH_ID, SESSION_DATE, [], BRANCH_DAYS);
    expect(mockReduceSpecificPlayers).not.toHaveBeenCalled();
  });

  it("restore result always returns compensatedPlayerIds:[] (restore produces no new compensations)", async () => {
    const ids = ["player-1"];
    const result = await orchestrateRestoreSession(
      BRANCH_ID, SESSION_DATE, ids, BRANCH_DAYS
    );
    expect(result.compensatedPlayerIds).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Compensation correctness: cancel then restore using stored IDs
// ─────────────────────────────────────────────────────────────────────────────

describe("cancel → restore compensation round-trip", () => {

  it("reduceSpecificPlayers receives exactly the IDs returned by cancel", async () => {
    const expectedIds = ["player-A", "player-B"];
    mockExtendBranchPlayers.mockResolvedValue(expectedIds);

    const cancelResult = await orchestrateCancelSession({
      ...cancelOpts,
      extendPlayers: true,
    });
    expect(cancelResult.ok).toBe(true);
    expect(cancelResult.compensatedPlayerIds).toEqual(expectedIds);

    // Simulate calendar page storing and passing these IDs to restore
    await orchestrateRestoreSession(
      BRANCH_ID, SESSION_DATE, cancelResult.compensatedPlayerIds, BRANCH_DAYS
    );

    expect(mockReduceSpecificPlayers).toHaveBeenCalledWith(expectedIds, BRANCH_DAYS);
  });

  it("when no players were compensated at cancel, restore skips player reversal", async () => {
    mockExtendBranchPlayers.mockResolvedValue([]);

    const cancelResult = await orchestrateCancelSession({
      ...cancelOpts,
      extendPlayers: true,
    });
    expect(cancelResult.compensatedPlayerIds).toEqual([]);

    await orchestrateRestoreSession(
      BRANCH_ID, SESSION_DATE, cancelResult.compensatedPlayerIds, BRANCH_DAYS
    );

    expect(mockReduceSpecificPlayers).not.toHaveBeenCalled();
  });
});
