import { NextRequest } from "next/server";

// ── Shared mock state ───────────────────────────────────────────────────────

let adminInsertResult: { data: unknown; error: unknown } = { data: null, error: null };
let adminSelectResult: { data: unknown; error: unknown } = { data: null, error: null };
let rpcQueryResult: { data: unknown; error: unknown } = { data: [], error: null };
let rpcUpdateResult: { data: unknown; error: unknown } = { data: null, error: null };
let rpcDeleteResult: { error: unknown } = { error: null };

// ── supabaseAdmin mock ──────────────────────────────────────────────────────

const mockAdminFrom = jest.fn().mockImplementation((table: string) => {
  if (table === "technology_domains") {
    return {
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue(adminSelectResult),
        }),
      }),
    };
  }
  return {
    insert: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        single: jest.fn().mockResolvedValue(adminInsertResult),
      }),
    }),
  };
});

jest.mock("@/lib/supabaseAdmin", () => ({
  supabaseAdmin: { from: (...args: unknown[]) => mockAdminFrom(...args) },
}));

// ── makeTGServerClient mock ─────────────────────────────────────────────────

const mockRpcFrom = jest.fn().mockImplementation(() => ({
  select: jest.fn().mockReturnValue({
    eq: jest.fn().mockReturnValue({
      eq: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          order: jest.fn().mockResolvedValue(rpcQueryResult),
        }),
        order: jest.fn().mockResolvedValue(rpcQueryResult),
      }),
      order: jest.fn().mockResolvedValue(rpcQueryResult),
    }),
    order: jest.fn().mockResolvedValue(rpcQueryResult),
  }),
  update: jest.fn().mockReturnValue({
    eq: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        single: jest.fn().mockResolvedValue(rpcUpdateResult),
      }),
    }),
  }),
  delete: jest.fn().mockReturnValue({
    eq: jest.fn().mockResolvedValue(rpcDeleteResult),
  }),
}));

jest.mock("@/lib/truly-govern/supabase", () => ({
  makeTGServerClient: () => ({ from: (...args: unknown[]) => mockRpcFrom(...args) }),
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

import { GET, POST, PATCH, DELETE } from "@/app/api/truly-govern/policies/route";

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeReq(url: string, init?: RequestInit) {
  return new NextRequest(new URL(url, "http://localhost"), init);
}

beforeEach(() => {
  jest.clearAllMocks();
  adminInsertResult = { data: null, error: null };
  adminSelectResult = { data: null, error: null };
  rpcQueryResult = { data: [], error: null };
  rpcUpdateResult = { data: null, error: null };
  rpcDeleteResult = { error: null };
});

// ── GET ─────────────────────────────────────────────────────────────────────

describe("GET /api/truly-govern/policies", () => {
  it("returns policies for org", async () => {
    rpcQueryResult = {
      data: [
        { id: "p1", title: "No MongoDB", policy_id: "POL-ABC" },
        { id: "p2", title: "Use TLS", policy_id: "POL-DEF" },
      ],
      error: null,
    };

    const res = await GET(makeReq("http://localhost/api/truly-govern/policies"));
    const json = await res.json();
    expect(json.data).toHaveLength(2);
    expect(json.data[0].title).toBe("No MongoDB");
  });

  it("supports tech_domain_id and status filters", async () => {
    rpcQueryResult = { data: [], error: null };
    const res = await GET(
      makeReq(
        "http://localhost/api/truly-govern/policies?tech_domain_id=td1&status=active",
      ),
    );
    expect(res.status).toBe(200);
  });
});

// ── POST ────────────────────────────────────────────────────────────────────

describe("POST /api/truly-govern/policies", () => {
  it("creates policy", async () => {
    adminSelectResult = { data: { name: "Cloud" }, error: null };
    adminInsertResult = {
      data: { id: "p-new", title: "Use K8s", policy_id: "POL-XYZ" },
      error: null,
    };

    const res = await POST(
      makeReq("http://localhost/api/truly-govern/policies", {
        method: "POST",
        body: JSON.stringify({
          title: "Use K8s",
          tech_domain_id: "td-cloud",
          rule_statement: "All services must run on Kubernetes",
          rule_severity: "error",
        }),
      }),
    );

    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.data.title).toBe("Use K8s");
  });

  it("creates policy without tech_domain_id", async () => {
    adminInsertResult = {
      data: { id: "p-no-domain", title: "General Policy" },
      error: null,
    };

    const res = await POST(
      makeReq("http://localhost/api/truly-govern/policies", {
        method: "POST",
        body: JSON.stringify({ title: "General Policy" }),
      }),
    );

    expect(res.status).toBe(201);
  });

  it("returns 400 on insert error", async () => {
    adminInsertResult = { data: null, error: { message: "duplicate key" } };

    const res = await POST(
      makeReq("http://localhost/api/truly-govern/policies", {
        method: "POST",
        body: JSON.stringify({ title: "Dup" }),
      }),
    );

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("duplicate key");
  });
});

// ── PATCH ───────────────────────────────────────────────────────────────────

describe("PATCH /api/truly-govern/policies", () => {
  it("updates policy", async () => {
    rpcUpdateResult = {
      data: { id: "p1", title: "Updated Title", status: "active" },
      error: null,
    };

    const res = await PATCH(
      makeReq("http://localhost/api/truly-govern/policies", {
        method: "PATCH",
        body: JSON.stringify({ id: "p1", title: "Updated Title" }),
      }),
    );

    const json = await res.json();
    expect(json.data.title).toBe("Updated Title");
  });

  it("returns 400 when id is missing", async () => {
    const res = await PATCH(
      makeReq("http://localhost/api/truly-govern/policies", {
        method: "PATCH",
        body: JSON.stringify({ title: "No id" }),
      }),
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("id is required");
  });
});

// ── DELETE ───────────────────────────────────────────────────────────────────

describe("DELETE /api/truly-govern/policies", () => {
  it("deletes policy", async () => {
    rpcDeleteResult = { error: null };

    const res = await DELETE(
      makeReq("http://localhost/api/truly-govern/policies", {
        method: "DELETE",
        body: JSON.stringify({ id: "p1" }),
      }),
    );

    const json = await res.json();
    expect(json.success).toBe(true);
  });

  it("returns 400 on delete error", async () => {
    rpcDeleteResult = { error: { message: "foreign key violation" } };

    const res = await DELETE(
      makeReq("http://localhost/api/truly-govern/policies", {
        method: "DELETE",
        body: JSON.stringify({ id: "p1" }),
      }),
    );

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("foreign key violation");
  });
});
