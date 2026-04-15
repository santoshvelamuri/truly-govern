import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// ─── Types ───────────────────────────────────────────────────────────────────

export type UserRole = "owner" | "admin" | "member" | "viewer";

export interface AuthContext {
  user: { id: string; email: string };
  orgId: string;
  role: UserRole;
  token: string;
}

interface WithAuthOptions {
  /** Restrict to specific roles. If omitted, any authenticated user is allowed. */
  roles?: UserRole[];
}

type AuthenticatedHandler = (
  req: NextRequest,
  ctx: AuthContext,
) => Promise<NextResponse> | NextResponse;

// ─── Rate Limiter ────────────────────────────────────────────────────────────
// Simple in-memory token bucket. Suitable for single-instance deployments.
// For multi-instance, replace with Redis-backed rate limiting.

interface RateBucket {
  count: number;
  resetAt: number;
}

const rateBuckets = new Map<string, RateBucket>();
const RATE_WINDOW_MS = 60_000; // 1 minute
const DEFAULT_RATE_LIMIT = 100; // requests per window
const AI_RATE_LIMIT = 10; // stricter for AI/streaming endpoints

// Cleanup stale buckets every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of rateBuckets) {
    if (now > bucket.resetAt) rateBuckets.delete(key);
  }
}, 300_000);

function getClientIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown"
  );
}

function checkRateLimit(ip: string, limit: number): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const bucket = rateBuckets.get(ip);

  if (!bucket || now > bucket.resetAt) {
    rateBuckets.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return { allowed: true, remaining: limit - 1 };
  }

  bucket.count++;
  if (bucket.count > limit) {
    return { allowed: false, remaining: 0 };
  }
  return { allowed: true, remaining: limit - bucket.count };
}

// ─── withAuth Wrapper ────────────────────────────────────────────────────────
// Centralizes auth validation, role checking, and rate limiting for API routes.
//
// CSRF note: All mutations require a Bearer token in the Authorization header.
// Since browsers don't automatically attach Authorization headers (unlike cookies),
// this provides implicit CSRF protection. No additional CSRF tokens needed.

export function withAuth(handler: AuthenticatedHandler, options?: WithAuthOptions) {
  return async (req: NextRequest): Promise<NextResponse> => {
    // Rate limiting
    const ip = getClientIp(req);
    const isAiRoute = req.nextUrl.pathname.includes("/advisor/") || req.nextUrl.pathname.includes("/extract");
    const limit = isAiRoute ? AI_RATE_LIMIT : DEFAULT_RATE_LIMIT;
    const { allowed, remaining } = checkRateLimit(ip, limit);

    if (!allowed) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        {
          status: 429,
          headers: {
            "Retry-After": "60",
            "X-RateLimit-Limit": String(limit),
            "X-RateLimit-Remaining": "0",
          },
        },
      );
    }

    // Extract token
    const token = req.headers.get("authorization")?.replace("Bearer ", "");
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Validate user
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: `Bearer ${token}` } } },
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Fetch profile (role + org_id)
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("org_id, role")
      .eq("id", user.id)
      .single();

    if (!profile?.org_id) {
      return NextResponse.json({ error: "Organisation not found" }, { status: 401 });
    }

    const role = (profile.role ?? "member") as UserRole;

    // Role-based access check
    if (options?.roles && !options.roles.includes(role)) {
      return NextResponse.json(
        { error: `Forbidden: requires ${options.roles.join(" or ")} role` },
        { status: 403 },
      );
    }

    // Build context
    const ctx: AuthContext = {
      user: { id: user.id, email: user.email ?? "" },
      orgId: profile.org_id,
      role,
      token,
    };

    // Add rate limit headers to response
    const response = await handler(req, ctx);
    response.headers.set("X-RateLimit-Limit", String(limit));
    response.headers.set("X-RateLimit-Remaining", String(remaining));

    return response;
  };
}
