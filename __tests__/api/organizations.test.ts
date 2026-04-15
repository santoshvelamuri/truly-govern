/**
 * Tests for app/api/organizations/route.ts
 */
import { createMockSupabaseClient } from "@/__tests__/mocks/supabase";
import { createMockRequest } from "@/__tests__/mocks/next";

// --- Module-level mocks ---
const mockAnonClient = createMockSupabaseClient();
jest.mock("@supabase/supabase-js", () => ({
  createClient: jest.fn(() => mockAnonClient),
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

import { GET, PUT } from "@/app/api/organizations/route";
import { NextRequest } from "next/server";

describe("GET /api/organizations", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns org data for authenticated user", async () => {
    mockAnonClient._mockQuery.single.mockResolvedValue({
      data: { id: "org-1", name: "Acme Corp", slug: "acme" },
      error: null,
    });

    const req = createMockRequest("GET", "http://localhost:3000/api/organizations") as unknown as NextRequest;
    const res = await GET(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual({ id: "org-1", name: "Acme Corp", slug: "acme" });
  });

  it("returns 400 when supabase query fails", async () => {
    mockAnonClient._mockQuery.single.mockResolvedValue({
      data: null,
      error: { message: "not found" },
    });

    const req = createMockRequest("GET", "http://localhost:3000/api/organizations") as unknown as NextRequest;
    const res = await GET(req);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("not found");
  });
});

describe("PUT /api/organizations", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAnonClient._mockQuery.eq.mockResolvedValue({
      data: [{ id: "org-1", name: "Updated" }],
      error: null,
    });
  });

  it("returns 403 when user is a member (not owner/admin)", async () => {
    const req = createMockRequest("PUT", "http://localhost:3000/api/organizations", {
      body: { name: "New Name" },
    }) as any;
    req.__ctx = {
      user: { id: "member-1", email: "member@test.com" },
      orgId: "org-1",
      role: "member",
      token: "test-token",
    };

    const res = await PUT(req as unknown as NextRequest);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/requires owner or admin/);
  });

  it("allows admin to update org settings", async () => {
    const req = createMockRequest("PUT", "http://localhost:3000/api/organizations", {
      body: { name: "Updated Corp" },
    }) as unknown as NextRequest;

    const res = await PUT(req);
    expect(res.status).toBe(200);

    // Verify update was called on organizations table
    expect(mockAnonClient.from).toHaveBeenCalledWith("organizations");
    expect(mockAnonClient._mockQuery.update).toHaveBeenCalled();
  });
});
