/**
 * Tests for upsertAutoFinanceTx.
 *
 * Behaviour under test:
 *  - Calls supabase.from("finance_tx").upsert(..., { onConflict: "academy_id,auto_key" }).select().single()
 *  - Injects academy_id from resolveAcademyId()
 *  - Injects updated_at timestamp
 *  - Returns the upserted row
 *  - Throws an Error (Arabic message) when Supabase returns an error
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock dependencies before importing the module under test ──────────────────

const mockSingle = vi.fn();
const mockBuilder = {
  from: vi.fn().mockImplementation(() => mockBuilder),
  select: vi.fn().mockImplementation(() => mockBuilder),
  insert: vi.fn().mockImplementation(() => mockBuilder),
  update: vi.fn().mockImplementation(() => mockBuilder),
  upsert: vi.fn().mockImplementation(() => mockBuilder),
  delete: vi.fn().mockImplementation(() => mockBuilder),
  eq: vi.fn().mockImplementation(() => mockBuilder),
  single: mockSingle,
  maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
};

vi.mock("../browser", () => ({
  createClient: vi.fn(() => mockBuilder),
}));

vi.mock("../academyId", () => ({
  resolveAcademyId: vi.fn().mockResolvedValue("academy-test"),
}));

import { upsertAutoFinanceTx } from "../finance";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const basePayload = {
  auto_key: "rent:2024-03:branch-1",
  month: "2024-03",
  date: "2024-03-01",
  type: "مصروف",
  branch_id: "branch-1",
  category: "حجز ملعب",
  amount: 120,
  note: "إيجار الملعب",
  source: "auto" as const,
};

const mockDbRow = {
  id: "tx-uuid-1",
  academy_id: "academy-test",
  ...basePayload,
  overridden_auto_key: null,
  created_at: "2024-03-01T00:00:00Z",
  updated_at: "2024-03-15T10:00:00Z",
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("upsertAutoFinanceTx", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBuilder.from.mockImplementation(() => mockBuilder);
    mockBuilder.select.mockImplementation(() => mockBuilder);
    mockBuilder.upsert.mockImplementation(() => mockBuilder);
    mockBuilder.single = vi.fn();
  });

  it("returns the upserted row on success", async () => {
    mockBuilder.single.mockResolvedValue({ data: mockDbRow, error: null });

    const result = await upsertAutoFinanceTx(basePayload);

    expect(result).toEqual(mockDbRow);
  });

  it("calls upsert with onConflict: 'academy_id,auto_key'", async () => {
    mockBuilder.single.mockResolvedValue({ data: mockDbRow, error: null });

    await upsertAutoFinanceTx(basePayload);

    expect(mockBuilder.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        academy_id: "academy-test",
        auto_key: basePayload.auto_key,
        amount: 120,
      }),
      { onConflict: "academy_id,auto_key" }
    );
  });

  it("injects academy_id from resolveAcademyId()", async () => {
    mockBuilder.single.mockResolvedValue({ data: mockDbRow, error: null });

    await upsertAutoFinanceTx(basePayload);

    const upsertArg = mockBuilder.upsert.mock.calls[0][0];
    expect(upsertArg.academy_id).toBe("academy-test");
  });

  it("injects updated_at timestamp", async () => {
    mockBuilder.single.mockResolvedValue({ data: mockDbRow, error: null });

    const before = Date.now();
    await upsertAutoFinanceTx(basePayload);
    const after = Date.now();

    const upsertArg = mockBuilder.upsert.mock.calls[0][0];
    expect(upsertArg.updated_at).toBeDefined();
    const ts = new Date(upsertArg.updated_at).getTime();
    expect(ts).toBeGreaterThanOrEqual(before - 100);
    expect(ts).toBeLessThanOrEqual(after + 100);
  });

  it("throws an Error when Supabase returns an error", async () => {
    mockBuilder.single.mockResolvedValue({
      data: null,
      error: { message: "unique constraint violation", code: "23505" },
    });

    await expect(upsertAutoFinanceTx(basePayload)).rejects.toThrow(
      "unique constraint violation"
    );
  });

  it("handles zero-amount entry (cancelled session saves)", async () => {
    const zeroPayload = { ...basePayload, amount: 0, note: "حصة ملغاة — تم توفير تكلفة الملعب" };
    mockBuilder.single.mockResolvedValue({
      data: { ...mockDbRow, amount: 0 },
      error: null,
    });

    const result = await upsertAutoFinanceTx(zeroPayload);
    expect(result.amount).toBe(0);

    const upsertArg = mockBuilder.upsert.mock.calls[0][0];
    expect(upsertArg.amount).toBe(0);
  });
});
