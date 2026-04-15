import { NextRequest } from "next/server";
import { createChainMock } from "@/__tests__/mocks/supabase";

// ── Shared mock state ───────────────────────────────────────────────────────

let queryResult: { data: unknown; error: unknown } = { data: [], error: null };
let updateResult: { data: unknown; error: unknown } = { data: null, error: null };

// ── supabaseAdmin mock (Proxy-based) ──────────────────────────────────────

const mockFrom = jest.fn().mockImplementation(() =>
  createChainMock(queryResult),
);

jest.mock("@/lib/supabaseAdmin", () => ({
  supabaseAdmin: { from: (...args: unknown[]) => mockFrom(...args) },
}));

// ── withAuth mock — immediately invokes handler with fake context ────────

const fakeCtx = {
  user: { id: "user-1", email: "a@b.com" },
  orgId: "org-1",
  role: "admin" as const,
  token: "tok",
};

jest.mock("@/lib/api-auth", () => ({
  withAuth: (handler: Function) => (req: NextRequest) => handler(req, fakeCtx),
}));

// ── Import routes after mocks ───────────────────────────────────────────────

import { GET, POST } from "@/app/api/truly-govern/deviations/route";
import { GET as GET_SUMMARY } from "@/app/api/truly-govern/deviations/summary/route";

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeReq(url: string, init?: RequestInit) {
  return new NextRequest(new URL(url, "http://localhost"), init);
}

beforeEach(() => {
  jest.clearAllMocks();
  queryResult = { data: [], error: null };
  updateResult = { data: null, error: null };
  mockFrom.mockImplementation(() => createChainMock(queryResult));
});

// ── GET deviations ──────────────────────────────────────────────────────────

describe("GET /api/truly-govern/deviations", () => {
  it("returns deviations filtered by org_id", async () => {
    queryResult = { data: [{ id: "d1" }], error: null };
    mockFrom.mockImplementation(() => createChainMock(queryResult));

    const res = await GET(makeReq("http://localhost/api/truly-govern/deviations"));
    const json = await res.json();
    expect(json.data).toEqual([{ id: "d1" }]);
    expect(mockFrom).toHaveBeenCalledWith("governance_deviations");
  });

  it("supports owner_id filter", async () => {
    queryResult = { data: [], error: null };
    mockFrom.mockImplementation(() => createChainMock(queryResult));

    const res = await GET(
      makeReq("http://localhost/api/truly-govern/deviations?owner_id=u2"),
    );
    expect(res.status).toBe(200);
  });

  it("supports status, source_type, severity filters", async () => {
    queryResult = { data: [], error: null };
    mockFrom.mockImplementation(() => createChainMock(queryResult));

    const res = await GET(
      makeReq(
        "http://localhost/api/truly-govern/deviations?status=open&source_type=policy&severity=high",
      ),
    );
    expect(res.status).toBe(200);
  });
});

// ── POST deviations (override-resolve) ──────────────────────────────────────

describe("POST /api/truly-govern/deviations", () => {
  it("resolves deviation with override-resolve action", async () => {
    updateResult = { data: null, error: null };
    mockFrom.mockImplementation(() => createChainMock(updateResult));

    const res = await POST(
      makeReq("http://localhost/api/truly-govern/deviations", {
        method: "POST",
        body: JSON.stringify({
          id: "d1",
          action: "override-resolve",
          reason: "Manual fix applied",
        }),
      }),
    );
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(mockFrom).toHaveBeenCalledWith("governance_deviations");
  });

  it("returns error for invalid action", async () => {
    const res = await POST(
      makeReq("http://localhost/api/truly-govern/deviations", {
        method: "POST",
        body: JSON.stringify({ id: "d1", action: "invalid" }),
      }),
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("Invalid action");
  });
});

// ── GET deviations summary ──────────────────────────────────────────────────

describe("GET /api/truly-govern/deviations/summary", () => {
  it("returns correct counts", async () => {
    const rows = [
      { status: "open", resolved_at: null },
      { status: "overdue", resolved_at: null },
      { status: "overdue", resolved_at: null },
      { status: "expiring", resolved_at: null },
      { status: "resolved", resolved_at: new Date().toISOString() },
      { status: "pending_verification", resolved_at: null },
    ];

    mockFrom.mockImplementationOnce(() =>
      createChainMock({ data: rows, error: null }),
    );

    const res = await GET_SUMMARY(
      makeReq("http://localhost/api/truly-govern/deviations/summary"),
    );
    const json = await res.json();

    // open = open + overdue + pending_verification = 1 + 2 + 1 = 4
    expect(json.open).toBe(4);
    expect(json.overdue).toBe(2);
    expect(json.expiring).toBe(1);
    expect(json.total).toBe(6);
  });

  it("supports owner_id filter", async () => {
    mockFrom.mockImplementationOnce(() =>
      createChainMock({ data: [], error: null }),
    );

    const res = await GET_SUMMARY(
      makeReq("http://localhost/api/truly-govern/deviations/summary?owner_id=u5"),
    );
    const json = await res.json();
    expect(json.open).toBe(0);
    expect(json.total).toBe(0);
  });
});
