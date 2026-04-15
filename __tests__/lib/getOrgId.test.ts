import { getOrgId } from "@/lib/getOrgId";

// ── Mock supabase client ────────────────────────────────────────────────────

const mockGetUser = jest.fn();
const mockSingle = jest.fn();

jest.mock("@/lib/supabaseClient", () => ({
  supabase: {
    auth: { getUser: (...args: unknown[]) => mockGetUser(...args) },
    from: () => ({
      select: () => ({
        eq: () => ({
          single: () => mockSingle(),
        }),
      }),
    }),
  },
}));

beforeEach(() => {
  jest.clearAllMocks();
});

// ── Tests ───────────────────────────────────────────────────────────────────

describe("getOrgId", () => {
  it("returns org_id when profile exists", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    mockSingle.mockResolvedValue({ data: { org_id: "org-abc" }, error: null });

    const orgId = await getOrgId();
    expect(orgId).toBe("org-abc");
  });

  it('throws "User not authenticated" when no user', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    await expect(getOrgId()).rejects.toThrow("User not authenticated");
  });

  it('throws "org_id not found" when profile has no org_id', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u2" } } });
    mockSingle.mockResolvedValue({ data: { org_id: null }, error: null });

    await expect(getOrgId()).rejects.toThrow("org_id not found");
  });

  it('throws "org_id not found" when profile query errors', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u3" } } });
    mockSingle.mockResolvedValue({
      data: null,
      error: { message: "row not found" },
    });

    await expect(getOrgId()).rejects.toThrow("org_id not found");
  });
});
