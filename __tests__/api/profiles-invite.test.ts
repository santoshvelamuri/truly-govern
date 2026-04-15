/**
 * Tests for app/api/profiles/invite/route.ts
 */
import { createChainMock } from "@/__tests__/mocks/supabase";
import { createMockRequest } from "@/__tests__/mocks/next";

// --- Module-level mocks ---
const mockFrom = jest.fn(() => createChainMock({ data: null, error: null }));
const mockAuth = {
  admin: {
    inviteUserByEmail: jest.fn().mockResolvedValue({
      data: { user: { id: "invited-user-id" } },
      error: null,
    }),
  },
};

jest.mock("@/lib/supabaseAdmin", () => ({
  supabaseAdmin: {
    from: (...args: unknown[]) => mockFrom(...args),
    auth: mockAuth,
  },
}));

// Mock withAuth to bypass actual auth — inject ctx directly
jest.mock("@/lib/api-auth", () => ({
  withAuth: (handler: Function, opts?: { roles?: string[] }) => {
    return async (req: any) => {
      // Simulate role checking
      const ctx = (req as any).__ctx ?? {
        user: { id: "admin-1", email: "admin@test.com" },
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

import { POST } from "@/app/api/profiles/invite/route";
import { NextRequest } from "next/server";

describe("POST /api/profiles/invite", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Defaults
    mockAuth.admin.inviteUserByEmail.mockResolvedValue({
      data: { user: { id: "invited-user-id" } },
      error: null,
    });
    mockFrom.mockImplementation(() =>
      createChainMock({ data: null, error: null }),
    );
  });

  // ── Non-admin user → 403 ─────────────────────────────────────────────
  it("returns 403 for non-admin/non-owner user", async () => {
    const req = createMockRequest("POST", "http://localhost:3000/api/profiles/invite", {
      body: { email: "new@test.com" },
    }) as any;
    req.__ctx = {
      user: { id: "member-1", email: "member@test.com" },
      orgId: "org-1",
      role: "member",
      token: "test-token",
    };

    const res = await POST(req as unknown as NextRequest);
    expect(res.status).toBe(403);
  });

  // ── Missing email → 400 ──────────────────────────────────────────────
  it("returns 400 when email is missing", async () => {
    const req = createMockRequest("POST", "http://localhost:3000/api/profiles/invite", {
      body: {},
    }) as unknown as NextRequest;

    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/email is required/);
  });

  // ── Successful invite ────────────────────────────────────────────────
  it("creates profile and org_members on successful invite", async () => {
    const req = createMockRequest("POST", "http://localhost:3000/api/profiles/invite", {
      body: { email: "new@test.com", full_name: "New User", role: "member" },
    }) as unknown as NextRequest;

    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.userId).toBe("invited-user-id");

    // Verify invite was called
    expect(mockAuth.admin.inviteUserByEmail).toHaveBeenCalledWith(
      "new@test.com",
      expect.objectContaining({
        data: expect.objectContaining({ full_name: "New User", role: "member" }),
      }),
    );

    // Verify profile upsert was called
    expect(mockFrom).toHaveBeenCalledWith("profiles");
    // Verify org_members upsert was called
    expect(mockFrom).toHaveBeenCalledWith("org_members");
  });

  // ── Invite error from Supabase → 400 ────────────────────────────────
  it("returns 400 when Supabase invite fails", async () => {
    mockAuth.admin.inviteUserByEmail.mockResolvedValue({
      data: null,
      error: { message: "User already registered" },
    });

    const req = createMockRequest("POST", "http://localhost:3000/api/profiles/invite", {
      body: { email: "existing@test.com" },
    }) as unknown as NextRequest;

    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("User already registered");
  });
});
