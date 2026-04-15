/**
 * Tests for lib/truly-govern/notifications.ts — notify() and recipient resolution
 */

// ── Mock supabaseAdmin ──────────────────────────────────────────────────────

const mockSingle = jest.fn();
const mockLimit = jest.fn();
const mockIn = jest.fn();
const mockEq = jest.fn();
const mockSelect = jest.fn();
const mockInsert = jest.fn();
const mockFrom = jest.fn();

// Build a chainable mock that mirrors supabaseAdmin.from(...).select(...).eq(...).single()
function resetSupabaseMock() {
  mockSingle.mockReset();
  mockLimit.mockReset();
  mockIn.mockReset();
  mockEq.mockReset();
  mockSelect.mockReset();
  mockInsert.mockReset();
  mockFrom.mockReset();

  const chain = {
    select: mockSelect,
    eq: mockEq,
    in: mockIn,
    single: mockSingle,
    limit: mockLimit,
    insert: mockInsert,
  };

  mockSelect.mockReturnValue(chain);
  mockEq.mockReturnValue(chain);
  mockIn.mockReturnValue(chain);
  mockLimit.mockReturnValue(chain);
  mockSingle.mockResolvedValue({ data: null, error: null });
  mockInsert.mockResolvedValue({ error: null });
  mockFrom.mockReturnValue(chain);
}

jest.mock("@/lib/supabaseAdmin", () => ({
  supabaseAdmin: {
    from: (...args: unknown[]) => mockFrom(...args),
  },
}));

import { notify } from "@/lib/truly-govern/notifications";

// ---------------------------------------------------------------------------

beforeEach(() => {
  resetSupabaseMock();
  jest.spyOn(console, "log").mockImplementation(() => {});
  jest.spyOn(console, "warn").mockImplementation(() => {});
  jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Unknown event type
// ---------------------------------------------------------------------------

describe("notify — unknown event", () => {
  it("logs a warning and returns early for unknown event types", async () => {
    await notify("totally.unknown", "ent-1", "org-1");
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining("Unknown event type"),
    );
    // No insert should have been attempted
    expect(mockInsert).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// review.submitted — with assigned reviewer
// ---------------------------------------------------------------------------

describe("notify — review.submitted", () => {
  it("sends to assigned_reviewer_id when it exists", async () => {
    // 1st from("reviews") → returns assigned_reviewer_id
    mockSingle
      .mockResolvedValueOnce({ data: { assigned_reviewer_id: "reviewer-1" }, error: null })
      // 2nd from("notification_preferences") — no disabled users
      .mockResolvedValueOnce({ data: null, error: null });

    // notification_preferences select → chain returns data via eq → in
    // We need the `in` call (for notification_preferences) to resolve properly
    mockIn.mockImplementation(() => ({
      select: mockSelect,
      eq: mockEq,
      in: mockIn,
      single: mockSingle,
      limit: mockLimit,
      insert: mockInsert,
      // Resolve the preferences query
      then: (resolve: (v: unknown) => void) =>
        resolve({ data: [], error: null }),
    }));

    await notify("review.submitted", "rev-1", "org-1", { title: "My Review" });

    // Verify the insert was called with the reviewer
    expect(mockInsert).toHaveBeenCalled();
    const insertedRows = mockInsert.mock.calls[0][0];
    expect(insertedRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ user_id: "reviewer-1" }),
      ]),
    );
  });

  it("falls back to org members when no assigned reviewer", async () => {
    // reviews query → no assigned_reviewer_id
    mockSingle.mockResolvedValueOnce({ data: { assigned_reviewer_id: null }, error: null });

    // profiles query → org members
    mockLimit.mockResolvedValueOnce({
      data: [{ id: "member-1" }, { id: "member-2" }],
      error: null,
    });

    // notification_preferences query
    mockIn.mockImplementation(() => ({
      select: mockSelect,
      eq: mockEq,
      in: mockIn,
      single: mockSingle,
      limit: mockLimit,
      insert: mockInsert,
      then: (resolve: (v: unknown) => void) =>
        resolve({ data: [], error: null }),
    }));

    await notify("review.submitted", "rev-2", "org-1", { title: "Another Review" });

    expect(mockInsert).toHaveBeenCalled();
    const insertedRows = mockInsert.mock.calls[0][0];
    expect(insertedRows.length).toBe(2);
    expect(insertedRows.map((r: { user_id: string }) => r.user_id)).toEqual(
      expect.arrayContaining(["member-1", "member-2"]),
    );
  });
});

// ---------------------------------------------------------------------------
// review.approved — notify submitted_by
// ---------------------------------------------------------------------------

describe("notify — review.approved", () => {
  it("sends notification to the submitted_by user", async () => {
    // reviews query → submitted_by
    mockSingle.mockResolvedValueOnce({ data: { submitted_by: "author-1" }, error: null });

    // notification_preferences
    mockIn.mockImplementation(() => ({
      select: mockSelect, eq: mockEq, in: mockIn, single: mockSingle,
      limit: mockLimit, insert: mockInsert,
      then: (resolve: (v: unknown) => void) => resolve({ data: [], error: null }),
    }));

    await notify("review.approved", "rev-3", "org-1", { title: "Approved Review" });

    expect(mockInsert).toHaveBeenCalled();
    const insertedRows = mockInsert.mock.calls[0][0];
    expect(insertedRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          user_id: "author-1",
          event_type: "review.approved",
          title: "Your review was approved",
        }),
      ]),
    );
  });

  it("does not insert when submitted_by is missing", async () => {
    mockSingle.mockResolvedValueOnce({ data: { submitted_by: null }, error: null });

    await notify("review.approved", "rev-4", "org-1", { title: "No Author" });

    // No recipients → no insert
    expect(mockInsert).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// condition events — use owner_id from context
// ---------------------------------------------------------------------------

describe("notify — condition events", () => {
  for (const eventType of ["condition.due_soon", "condition.due_tomorrow", "condition.overdue"]) {
    it(`${eventType} sends to owner_id from context`, async () => {
      // notification_preferences
      mockIn.mockImplementation(() => ({
        select: mockSelect, eq: mockEq, in: mockIn, single: mockSingle,
        limit: mockLimit, insert: mockInsert,
        then: (resolve: (v: unknown) => void) => resolve({ data: [], error: null }),
      }));

      await notify(eventType, "cond-1", "org-1", {
        owner_id: "owner-42",
        review_id: "rev-1",
        description: "Fix something",
      });

      expect(mockInsert).toHaveBeenCalled();
      const insertedRows = mockInsert.mock.calls[0][0];
      expect(insertedRows).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ user_id: "owner-42" }),
        ]),
      );

      // Reset for next iteration
      resetSupabaseMock();
      jest.spyOn(console, "log").mockImplementation(() => {});
    });
  }

  it("condition events do not insert when owner_id is missing", async () => {
    await notify("condition.due_soon", "cond-2", "org-1", { review_id: "rev-1" });
    expect(mockInsert).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Template fields
// ---------------------------------------------------------------------------

describe("notify — template structure", () => {
  it("builds correct action_url for review events", async () => {
    mockSingle.mockResolvedValueOnce({ data: { submitted_by: "user-1" }, error: null });
    mockIn.mockImplementation(() => ({
      select: mockSelect, eq: mockEq, in: mockIn, single: mockSingle,
      limit: mockLimit, insert: mockInsert,
      then: (resolve: (v: unknown) => void) => resolve({ data: [], error: null }),
    }));

    await notify("review.approved", "rev-99", "org-1", { title: "Test" });

    const insertedRows = mockInsert.mock.calls[0][0];
    expect(insertedRows[0].action_url).toBe("/govern/reviews/rev-99");
    expect(insertedRows[0].entity_type).toBe("review");
    expect(insertedRows[0].urgent).toBe(false);
  });

  it("marks review.rejected as urgent", async () => {
    mockSingle.mockResolvedValueOnce({ data: { submitted_by: "user-1" }, error: null });
    mockIn.mockImplementation(() => ({
      select: mockSelect, eq: mockEq, in: mockIn, single: mockSingle,
      limit: mockLimit, insert: mockInsert,
      then: (resolve: (v: unknown) => void) => resolve({ data: [], error: null }),
    }));

    await notify("review.rejected", "rev-100", "org-1", { title: "Rejected" });

    const insertedRows = mockInsert.mock.calls[0][0];
    expect(insertedRows[0].urgent).toBe(true);
  });
});
