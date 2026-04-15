/**
 * Tests for app/api/truly-govern/reviews/route.ts
 */
import { createChainMock, createMockSupabaseClient } from "@/__tests__/mocks/supabase";

// --- Module-level mocks ---
const mockAdmin = createMockSupabaseClient();
jest.mock("@/lib/supabaseAdmin", () => ({
  supabaseAdmin: mockAdmin,
}));

// TG client uses proxy-based chain mocks so thenable chains resolve
const mockTGFrom = jest.fn(() => createChainMock({ data: [], error: null }));
jest.mock("@/lib/truly-govern/supabase", () => ({
  makeTGServerClient: jest.fn(() => ({
    from: (...args: unknown[]) => mockTGFrom(...args),
  })),
}));

jest.mock("@/lib/truly-govern/notifications", () => ({
  notify: jest.fn().mockResolvedValue(undefined),
}));

// Mock withAuth to bypass actual auth — inject ctx directly
jest.mock("@/lib/api-auth", () => ({
  withAuth: (handler: Function, opts?: { roles?: string[] }) => {
    return async (req: any) => {
      const ctx = (req as any).__ctx ?? {
        user: { id: "user-1", email: "user@test.com" },
        orgId: "org-1",
        role: "admin",
        token: "test-token",
      };
      if (opts?.roles && !opts.roles.includes(ctx.role)) {
        const { NextResponse } = require("next/server");
        return NextResponse.json(
          { error: `Forbidden: requires ${opts.roles.join(" or ")} role` },
          { status: 403 },
        );
      }
      return handler(req, ctx);
    };
  },
}));

import { GET, POST, PATCH, DELETE } from "@/app/api/truly-govern/reviews/route";
import { NextRequest } from "next/server";
import { createMockRequest } from "@/__tests__/mocks/next";

describe("GET /api/truly-govern/reviews", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns reviews list", async () => {
    const reviews = [
      { id: "r1", title: "Review 1", status: "pending" },
      { id: "r2", title: "Review 2", status: "approved" },
    ];
    mockTGFrom.mockImplementation(() =>
      createChainMock({ data: reviews, error: null }),
    );

    const req = createMockRequest("GET", "http://localhost:3000/api/truly-govern/reviews") as unknown as NextRequest;
    const res = await GET(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual(reviews);
    expect(mockTGFrom).toHaveBeenCalledWith("reviews");
  });

  it("applies status filter from search params", async () => {
    const chain = createChainMock({ data: [], error: null });
    mockTGFrom.mockImplementation(() => chain);

    const req = createMockRequest("GET", "http://localhost:3000/api/truly-govern/reviews", {
      searchParams: { status: "pending" },
    }) as unknown as NextRequest;
    const res = await GET(req);

    expect(res.status).toBe(200);
    // eq should have been called with "status", "pending" at some point
    expect(chain.eq).toHaveBeenCalledWith("status", "pending");
  });
});

describe("POST /api/truly-govern/reviews", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("creates review with submitted_by set to ctx.user.id", async () => {
    const created = { id: "r-new", title: "New Review", submitted_by: "user-1" };
    mockAdmin._mockQuery.single.mockResolvedValue({
      data: created,
      error: null,
    });

    const req = createMockRequest("POST", "http://localhost:3000/api/truly-govern/reviews", {
      body: { title: "New Review", risk_level: "high" },
    }) as unknown as NextRequest;
    const res = await POST(req);

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.submitted_by).toBe("user-1");

    // Verify insert was called on reviews table via admin
    expect(mockAdmin.from).toHaveBeenCalledWith("reviews");
    expect(mockAdmin._mockQuery.insert).toHaveBeenCalledWith([
      expect.objectContaining({
        title: "New Review",
        submitted_by: "user-1",
        org_id: "org-1",
        risk_level: "high",
      }),
    ]);
  });

  it("returns 400 when title is missing", async () => {
    const req = createMockRequest("POST", "http://localhost:3000/api/truly-govern/reviews", {
      body: { description: "no title" },
    }) as unknown as NextRequest;
    const res = await POST(req);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/title is required/);
  });
});

describe("PATCH /api/truly-govern/reviews", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns 403 when non-reviewer tries to approve", async () => {
    // Review is assigned to a different reviewer
    mockTGFrom.mockImplementation(() =>
      createChainMock({ data: { assigned_reviewer_id: "other-reviewer" }, error: null }),
    );

    const req = createMockRequest("PATCH", "http://localhost:3000/api/truly-govern/reviews", {
      body: { id: "r1", status: "approved" },
    }) as unknown as NextRequest;
    const res = await PATCH(req);

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/Only the assigned reviewer/);
  });

  it("allows assigned reviewer to approve", async () => {
    // First call: fetch review, second call: update
    let callCount = 0;
    mockTGFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return createChainMock({ data: { assigned_reviewer_id: "user-1" }, error: null });
      }
      return createChainMock({
        data: { id: "r1", status: "approved", org_id: "org-1", title: "T", domain_id: null, risk_level: null },
        error: null,
      });
    });

    const req = createMockRequest("PATCH", "http://localhost:3000/api/truly-govern/reviews", {
      body: { id: "r1", status: "approved" },
    }) as unknown as NextRequest;
    const res = await PATCH(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.status).toBe("approved");
  });

  it("returns 400 when id is missing", async () => {
    const req = createMockRequest("PATCH", "http://localhost:3000/api/truly-govern/reviews", {
      body: { status: "approved" },
    }) as unknown as NextRequest;
    const res = await PATCH(req);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/id is required/);
  });
});

describe("DELETE /api/truly-govern/reviews", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns 400 when trying to delete non-draft review", async () => {
    mockTGFrom.mockImplementation(() =>
      createChainMock({ data: { status: "approved" }, error: null }),
    );

    const req = createMockRequest("DELETE", "http://localhost:3000/api/truly-govern/reviews", {
      body: { id: "r1" },
    }) as unknown as NextRequest;
    const res = await DELETE(req);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/Only draft reviews/);
  });

  it("returns 403 when member tries to delete (restricted to owner/admin)", async () => {
    const req = createMockRequest("DELETE", "http://localhost:3000/api/truly-govern/reviews", {
      body: { id: "r1" },
    }) as any;
    req.__ctx = {
      user: { id: "member-1", email: "member@test.com" },
      orgId: "org-1",
      role: "member",
      token: "test-token",
    };

    const res = await DELETE(req as unknown as NextRequest);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/requires owner or admin/);
  });

  it("successfully deletes a pending/draft review as admin", async () => {
    // First from() call: select status → pending, second: delete
    let callCount = 0;
    mockTGFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return createChainMock({ data: { status: "pending" }, error: null });
      }
      return createChainMock({ data: null, error: null });
    });

    const req = createMockRequest("DELETE", "http://localhost:3000/api/truly-govern/reviews", {
      body: { id: "r1" },
    }) as unknown as NextRequest;
    const res = await DELETE(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });
});
