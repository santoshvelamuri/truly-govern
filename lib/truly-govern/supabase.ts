import { createClient, SupabaseClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";

export function makeTGServerClient(accessToken: string): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${accessToken}` } } },
  );
}

export function extractToken(req: NextRequest): string | null {
  return req.headers.get("authorization")?.replace("Bearer ", "") ?? null;
}

export async function getOrgId(
  supabase: SupabaseClient,
): Promise<string | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id")
    .eq("id", user.id)
    .single();
  return profile?.org_id ?? null;
}

export async function tgQuery<T = Record<string, unknown>>(
  supabase: SupabaseClient,
  table: string,
  orgId: string,
  select = "*",
): Promise<{ data: T[] | null; error: Error | null }> {
  const { data, error } = await supabase
    .from(table)
    .select(select)
    .eq("org_id", orgId);
  return { data: data as T[] | null, error };
}

export async function tgQuerySingle<T = Record<string, unknown>>(
  supabase: SupabaseClient,
  table: string,
  id: string,
  select = "*",
): Promise<{ data: T | null; error: Error | null }> {
  const { data, error } = await supabase
    .from(table)
    .select(select)
    .eq("id", id)
    .single();
  return { data: data as T | null, error };
}

export async function tgInsert<T = Record<string, unknown>>(
  supabase: SupabaseClient,
  table: string,
  row: Record<string, unknown>,
): Promise<{ data: T | null; error: Error | null }> {
  const { data, error } = await supabase
    .from(table)
    .insert([row])
    .select()
    .single();
  return { data: data as T | null, error };
}

export async function tgUpdate<T = Record<string, unknown>>(
  supabase: SupabaseClient,
  table: string,
  id: string,
  updates: Record<string, unknown>,
): Promise<{ data: T | null; error: Error | null }> {
  const { data, error } = await supabase
    .from(table)
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();
  return { data: data as T | null, error };
}

export async function tgDelete(
  supabase: SupabaseClient,
  table: string,
  id: string,
): Promise<{ error: Error | null }> {
  const { error } = await supabase.from(table).delete().eq("id", id);
  return { error };
}
