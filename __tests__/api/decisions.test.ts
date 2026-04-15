import { NextRequest } from "next/server";
import { createChainMock } from "@/__tests__/mocks/supabase";

// ── Shared mock state ───────────────────────────────────────────────────────

let adminInsertResult: { data: unknown; error: unknown } = { data: null, error: null };

// ── supabaseAdmin mock ──────────────────────────────────────────────────────

const mockAdminFrom = jest.fn().mockImplementation(() =>
  createChainMock(adminInsertResult),
);

jest.mock("@/lib/supabaseAdmin", () => ({
  supabaseAdmin: { from: (...args: unknown[]) => mockAdminFrom(...args) },
}));

// ── makeTGServerClient mock ─────────────────────────────────────────────────

let rpcQueryResult: { data: unknown; error: unknown } = { data: [], error: null };
let rpcUpdateResult: { data: unknown; error: unknown } = { data: null, error: null };
let rpcDeleteResult: { data: unknown; error: unknown } = { data: null, error: null };
let rpcSelectResult: { data: unknown; error: unknown } = { data: null, error: null };

const mockRpcFrom = jest.fn().mockImplementation((table: string) => {
  // Return a proxy chain that resolves based on context.
  // We use a counter to distinguish select-check vs delete calls.
  return createChainMock(rpcQueryResult);
});

jest.mock("@/lib/truly-govern/supabase", () => ({
  makeTGServerClient: () => ({ from: (...args: unknown[]) => mockRpcFrom(...args) }),
}));

// ── Notifications mock ──────────────────────────────────────────────────────

const mockNotify = jest.fn().mockResolvedValue(undefined);
jest.mock("@/lib/truly-govern/notifications", () => ({
  notify: (...args: unknown[]) => mockNotify(...args),
}));

// ── withAuth mock ───────────────────────────────────────────────────────────

const fakeCtx = {
  user: { id: "user-1", email: "a@b.com" },
  orgId: "org-1",
  role: "admin" as const,
  token: "tok",
};

jest.mock("@/lib/api-auth", () => ({
  withAuth: (handler: Function) => (req: NextRequest) => handler(req, fakeCtx),
}));

// ── Import routes ───────────────────────────────────────────────────────────

import { GET, POST, PATCH, DELETE } from "@/app/api/truly-govern/decisions/route";

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeReq(url: string, init?: RequestInit) {
  return new NextRequest(new URL(url, "http://localhost"), init);
}

beforeEach(() => {
  jest.clearAllMocks();
  adminInsertResult = { data: null, error: null };
  rpcQueryResult = { data: [], error: null };
  rpcUpdateResult = { data: null, error: null };
  rpcDeleteResult = { data: null, error: null };
  rpcSelectResult = { data: null, error: null };

  // Reset mockRpcFrom to default behavior
  mockRpcFrom.mockImplementation(() => createChainMock(rpcQueryResult));
});

// ── GET ─────────────────────────────────────────────────────────────────────

describe("GET /api/truly-govern/decisions", () => {
  it("returns decisions with joined arb_boards", async () => {
    rpcQueryResult = {
      data: [
        { id: "dr1", title: "Use Kafka", arb_boards: { id: "b1", name: "Board A" } },
      ],
      error: null,
    };
    mockRpcFrom.mockImplementation(() => createChainMock(rpcQueryResult));

    const res = await GET(makeReq("http://localhost/api/truly-govern/decisions"));
    const json = await res.json();
    expect(json.data).toHaveLength(1);
    expect(json.data[0].arb_boards.name).toBe("Board A");
  });

  it("supports board_id and submitted_by filters", async () => {
    rpcQueryResult = { data: [], error: null };
    mockRpcFrom.mockImplementation(() => createChainMock(rpcQueryResult));

    const res = await GET(
      makeReq(
        "http://localhost/api/truly-govern/decisions?board_id=b1&submitted_by=u2",
      ),
    );
    expect(res.status).toBe(200);
  });
});

// ── POST ────────────────────────────────────────────────────────────────────

describe("POST /api/truly-govern/decisions", () => {
  it("creates decision with options", async () => {
    adminInsertResult = {
      data: { id: "dr-new", title: "Use Kafka" },
      error: null,
    };

    // Mock from() to differentiate decision_options vs decision_requests
    mockAdminFrom.mockImplementation((table: string) => {
      if (table === "decision_options") {
        return createChainMock({ data: null, error: null });
      }
      return createChainMock(adminInsertResult);
    });

    const res = await POST(
      makeReq("http://localhost/api/truly-govern/decisions", {
        method: "POST",
        body: JSON.stringify({
          title: "Use Kafka",
          type: "technology",
          problem_statement: "Need async messaging",
          risk_level: "high",
          options: [
            { label: "Kafka", description: "Event streaming" },
            { label: "RabbitMQ", description: "Message queue" },
          ],
        }),
      }),
    );

    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.data.id).toBe("dr-new");
  });

  it("triggers notification when submitted with board", async () => {
    adminInsertResult = {
      data: { id: "dr-notif", title: "Pick DB" },
      error: null,
    };
    mockAdminFrom.mockImplementation(() => createChainMock(adminInsertResult));

    await POST(
      makeReq("http://localhost/api/truly-govern/decisions", {
        method: "POST",
        body: JSON.stringify({
          title: "Pick DB",
          type: "technology",
          problem_statement: "Choose a database",
          risk_level: "medium",
          status: "submitted",
          resolved_arb_board_id: "board-1",
        }),
      }),
    );

    expect(mockNotify).toHaveBeenCalledWith(
      "decision.submitted",
      "dr-notif",
      "org-1",
      expect.objectContaining({
        title: "Pick DB",
        resolved_arb_board_id: "board-1",
      }),
    );
  });

  it("returns 400 when required fields are missing", async () => {
    const res = await POST(
      makeReq("http://localhost/api/truly-govern/decisions", {
        method: "POST",
        body: JSON.stringify({ title: "Incomplete" }),
      }),
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain("required");
  });
});

// ── PATCH ───────────────────────────────────────────────────────────────────

describe("PATCH /api/truly-govern/decisions", () => {
  it("updates decision", async () => {
    rpcUpdateResult = {
      data: { id: "dr1", title: "Updated" },
      error: null,
    };
    mockRpcFrom.mockImplementation(() => createChainMock(rpcUpdateResult));

    const res = await PATCH(
      makeReq("http://localhost/api/truly-govern/decisions", {
        method: "PATCH",
        body: JSON.stringify({ id: "dr1", title: "Updated" }),
      }),
    );

    const json = await res.json();
    expect(json.data.title).toBe("Updated");
  });

  it("returns 400 when id is missing", async () => {
    const res = await PATCH(
      makeReq("http://localhost/api/truly-govern/decisions", {
        method: "PATCH",
        body: JSON.stringify({ title: "No id" }),
      }),
    );
    expect(res.status).toBe(400);
  });
});

// ── DELETE ───────────────────────────────────────────────────────────────────

describe("DELETE /api/truly-govern/decisions", () => {
  it("only allows draft deletion", async () => {
    mockRpcFrom.mockImplementation(() =>
      createChainMock({ data: { status: "submitted" }, error: null }),
    );

    const res = await DELETE(
      makeReq("http://localhost/api/truly-govern/decisions", {
        method: "DELETE",
        body: JSON.stringify({ id: "dr1" }),
      }),
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain("draft");
  });

  it("deletes draft decision successfully", async () => {
    // First call: select status check → draft; subsequent calls: delete chains
    let callCount = 0;
    mockRpcFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return createChainMock({ data: { status: "draft" }, error: null });
      }
      return createChainMock({ data: null, error: null });
    });

    const res = await DELETE(
      makeReq("http://localhost/api/truly-govern/decisions", {
        method: "DELETE",
        body: JSON.stringify({ id: "dr-draft" }),
      }),
    );
    const json = await res.json();
    expect(json.success).toBe(true);
  });
});
