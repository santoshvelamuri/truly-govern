import { createClient } from '@supabase/supabase-js';
import type { NextRequest } from 'next/server';

/** Creates an authenticated Supabase client for use in API routes. */
export function makeServerClient(accessToken: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${accessToken}` } } },
  );
}

/** Extracts the Bearer token from an API route request. Returns null if missing. */
export function extractToken(req: NextRequest): string | null {
  return req.headers.get('authorization')?.replace('Bearer ', '') ?? null;
}
