/**
 * Tests for lib/api-auth.ts — the withAuth middleware wrapper.
 */
import { createMockSupabaseClient } from "@/__tests__/mocks/supabase";
import { createMockRequest } from "@/__tests__/mocks/next";

// --- Module-level mocks ---
const mockAdmin = createMockSupabaseClient();
jest.mock("@/lib/supabaseAdmin", () => ({
  supabaseAdmin: mockAdmin,
}));

const mockAnonClient = createMockSupabaseClient();
jest.mock("@supabase/supabase-js", () => ({
  createClient: jest.fn(() => mockAnonClient),
}));

import { withAuth, AuthContext } from "@/lib/api-auth";
import { NextRequest, NextResponse } from "next/server";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeHandler() {
  return jest.fn((_req: NextRequest, ctx: AuthContext) =>
    NextResponse.json({ ok: true, ctx }),
  );
}

function resetRateLimiter() {
  // Each test should use a unique IP so rate-limit state doesn't leak.
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("withAuth", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: valid user
    mockAnonClient.auth.getUser.mockResolvedValue({
      data: { user: { id: "u1", email: "u1@test.com" } },
      error: null,
    });
    // Default: profile with org_id and role
    mockAdmin._mockQuery.single.mockResolvedValue({
      data: { org_id: "org-1", role: "admin" },
      error: null,
    });
  });

  // ── Missing token ────────────────────────────────────────────────────
  it("returns 401 when Authorization header is missing", async () => {
    const handler = makeHandler();
    const wrapped = withAuth(handler);
    const req = createMockRequest("GET", "http://localhost:3000/api/test", {
      headers: { authorization: "" },
    }) as unknown as NextRequest;
    // Remove authorization to simulate missing
    (req.headers as Headers).delete("authorization");

    const res = await wrapped(req);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
    expect(handler).not.toHaveBeenCalled();
  });

  // ── Invalid user (auth fails) ────────────────────────────────────────
  it("returns 401 when supabase auth fails", async () => {
    mockAnonClient.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: { message: "invalid token" },
    });

    const handler = makeHandler();
    const wrapped = withAuth(handler);
    const req = createMockRequest("GET", "http://localhost:3000/api/test") as unknown as NextRequest;

    const res = await wrapped(req);
    expect(res.status).toBe(401);
    expect(handler).not.toHaveBeenCalled();
  });

  // ── Missing org_id in profile ────────────────────────────────────────
  it("returns 401 when profile has no org_id", async () => {
    mockAdmin._mockQuery.single.mockResolvedValue({
      data: { org_id: null, role: "member" },
      error: null,
    });

    const handler = makeHandler();
    const wrapped = withAuth(handler);
    const req = createMockRequest("GET", "http://localhost:3000/api/test") as unknown as NextRequest;

    const res = await wrapped(req);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Organisation not found");
  });

  // ── Valid auth → handler receives correct ctx ────────────────────────
  it("calls handler with correct AuthContext on valid auth", async () => {
    const handler = makeHandler();
    const wrapped = withAuth(handler);
    const req = createMockRequest("GET", "http://localhost:3000/api/test", {
      headers: { "x-forwarded-for": "10.0.0.1" },
    }) as unknown as NextRequest;

    const res = await wrapped(req);
    expect(res.status).toBe(200);
    expect(handler).toHaveBeenCalledTimes(1);

    const ctx: AuthContext = handler.mock.calls[0][1];
    expect(ctx.user).toEqual({ id: "u1", email: "u1@test.com" });
    expect(ctx.orgId).toBe("org-1");
    expect(ctx.role).toBe("admin");
    expect(ctx.token).toBe("test-token");
  });

  // ── Role restriction — forbidden ────────────────────────────────────
  it("returns 403 when user role is not in allowed list", async () => {
    mockAdmin._mockQuery.single.mockResolvedValue({
      data: { org_id: "org-1", role: "member" },
      error: null,
    });

    const handler = makeHandler();
    const wrapped = withAuth(handler, { roles: ["owner", "admin"] });
    const req = createMockRequest("GET", "http://localhost:3000/api/test", {
      headers: { "x-forwarded-for": "10.0.0.2" },
    }) as unknown as NextRequest;

    const res = await wrapped(req);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/requires owner or admin/);
    expect(handler).not.toHaveBeenCalled();
  });

  // ── Role restriction — allowed ──────────────────────────────────────
  it("allows user when role matches allowed list", async () => {
    mockAdmin._mockQuery.single.mockResolvedValue({
      data: { org_id: "org-1", role: "admin" },
      error: null,
    });

    const handler = makeHandler();
    const wrapped = withAuth(handler, { roles: ["owner", "admin"] });
    const req = createMockRequest("GET", "http://localhost:3000/api/test", {
      headers: { "x-forwarded-for": "10.0.0.3" },
    }) as unknown as NextRequest;

    const res = await wrapped(req);
    expect(res.status).toBe(200);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  // ── Rate limiting ───────────────────────────────────────────────────
  it("returns 429 when rate limit is exceeded", async () => {
    const handler = makeHandler();
    const wrapped = withAuth(handler);

    // Use a unique IP for this test to avoid collisions
    const ip = "192.168.99.99";

    // Fire 101 requests — the 101st should be rate-limited (limit is 100)
    let lastRes: Response | undefined;
    for (let i = 0; i < 101; i++) {
      const req = createMockRequest("GET", "http://localhost:3000/api/test", {
        headers: { "x-forwarded-for": ip },
      }) as unknown as NextRequest;
      lastRes = await wrapped(req);
    }

    expect(lastRes!.status).toBe(429);
    const body = await lastRes!.json();
    expect(body.error).toMatch(/Too many requests/);
  });

  // ── Default role when profile has null role ─────────────────────────
  it("defaults to 'member' role when profile.role is null", async () => {
    mockAdmin._mockQuery.single.mockResolvedValue({
      data: { org_id: "org-1", role: null },
      error: null,
    });

    const handler = makeHandler();
    const wrapped = withAuth(handler);
    const req = createMockRequest("GET", "http://localhost:3000/api/test", {
      headers: { "x-forwarded-for": "10.0.0.4" },
    }) as unknown as NextRequest;

    const res = await wrapped(req);
    expect(res.status).toBe(200);
    const ctx: AuthContext = handler.mock.calls[0][1];
    expect(ctx.role).toBe("member");
  });
});
