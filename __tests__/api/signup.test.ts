/**
 * Tests for app/api/signup/route.ts
 */
import { createChainMock } from "@/__tests__/mocks/supabase";

// --- Module-level mocks ---
const mockAuth = {
  admin: {
    getUserById: jest.fn().mockResolvedValue({
      data: { user: { id: "test-user-id" } },
      error: null,
    }),
  },
};

const mockFrom = jest.fn();

jest.mock("@/lib/supabaseAdmin", () => ({
  supabaseAdmin: {
    from: (...args: unknown[]) => mockFrom(...args),
    auth: mockAuth,
  },
}));

import { POST } from "@/app/api/signup/route";
import { NextRequest } from "next/server";

function makeReq(body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost:3000/api/signup", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/signup", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Defaults: valid auth user
    mockAuth.admin.getUserById.mockResolvedValue({
      data: { user: { id: "u1" } },
      error: null,
    });
    // Default from() — returns a chain that resolves { data: null, error: null }
    mockFrom.mockImplementation(() =>
      createChainMock({ data: null, error: null }),
    );
  });

  // ── Missing userId → 400 ─────────────────────────────────────────────
  it("returns 400 when userId is missing", async () => {
    const res = await POST(makeReq({ org_name: "Acme" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/userId and org_name are required/);
  });

  // ── Missing org_name → 400 ───────────────────────────────────────────
  it("returns 400 when org_name is missing", async () => {
    const res = await POST(makeReq({ userId: "u1" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/userId and org_name are required/);
  });

  // ── Invalid userId → 400 ─────────────────────────────────────────────
  it("returns 400 when userId is not found in auth.users", async () => {
    mockAuth.admin.getUserById.mockResolvedValue({
      data: { user: null },
      error: { message: "User not found" },
    });

    const res = await POST(makeReq({ userId: "bad-id", org_name: "Acme" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Invalid user");
  });

  // ── Existing profile → 409 ───────────────────────────────────────────
  it("returns 409 when user already has a profile", async () => {
    // profiles check returns existing profile via .single()
    mockFrom.mockImplementation(() =>
      createChainMock({ data: { id: "u1" }, error: null }),
    );

    const res = await POST(makeReq({ userId: "u1", org_name: "Acme" }));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/already exists/);
  });

  // ── Successful signup ────────────────────────────────────────────────
  it("creates org, profile, and org_members on success", async () => {
    // Route calls from() for: profiles (check), organizations (insert), profiles (upsert), org_members (upsert)
    let callCount = 0;
    mockFrom.mockImplementation((table: string) => {
      callCount++;
      if (callCount === 1) {
        // profiles check → no existing profile
        return createChainMock({ data: null, error: null });
      }
      if (callCount === 2) {
        // org insert → success
        return createChainMock({ data: { id: "org-new" }, error: null });
      }
      // profile upsert, org_members upsert → success
      return createChainMock({ data: null, error: null });
    });

    const res = await POST(makeReq({
      userId: "u1",
      email: "u1@test.com",
      full_name: "User One",
      org_name: "Acme Corp",
      industry: "tech",
    }));

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.orgId).toBe("org-new");

    // Verify org was inserted
    expect(mockFrom).toHaveBeenCalledWith("organizations");
    // Verify profile was upserted
    expect(mockFrom).toHaveBeenCalledWith("profiles");
    // Verify org_members was upserted
    expect(mockFrom).toHaveBeenCalledWith("org_members");
  });

  // ── Slug conflict retry ──────────────────────────────────────────────
  it("retries with suffixed slug on unique constraint violation", async () => {
    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        // profiles check → no existing profile
        return createChainMock({ data: null, error: null });
      }
      if (callCount === 2) {
        // first org insert → duplicate slug error
        return createChainMock({ data: null, error: { code: "23505", message: "duplicate slug" } });
      }
      if (callCount === 3) {
        // retry org insert → success
        return createChainMock({ data: { id: "org-retry" }, error: null });
      }
      // profile upsert, org_members upsert → success
      return createChainMock({ data: null, error: null });
    });

    const res = await POST(makeReq({
      userId: "u1",
      org_name: "Acme",
    }));

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.orgId).toBe("org-retry");
  });
});
