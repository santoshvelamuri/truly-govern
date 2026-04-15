import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { userId, email, full_name, org_name, industry, slug } = body;

  if (!userId || !org_name) {
    return NextResponse.json({ error: "userId and org_name are required" }, { status: 400 });
  }

  // Validate that the userId exists in auth.users
  const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.getUserById(userId);
  if (authError || !authUser?.user) {
    return NextResponse.json({ error: "Invalid user" }, { status: 400 });
  }

  // Check if user already has a profile (already registered)
  const { data: existingProfile } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("id", userId)
    .single();
  if (existingProfile) {
    return NextResponse.json({ error: "An account with this email already exists. Please sign in instead." }, { status: 409 });
  }

  // Auto-generate slug from org name
  const orgSlug = slug || org_name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 50);

  // 1. Create organization
  const { data: org, error: orgError } = await supabaseAdmin
    .from("organizations")
    .insert([{
      name: org_name,
      slug: orgSlug,
      industry: industry || null,
      currency: "EUR",
    }])
    .select()
    .single();

  if (orgError) {
    console.error("[signup] org create error:", orgError);
    // If slug conflict, append random suffix
    if (orgError.code === "23505") {
      const retrySlug = `${orgSlug}-${Date.now().toString(36)}`;
      const { data: retryOrg, error: retryErr } = await supabaseAdmin
        .from("organizations")
        .insert([{ name: org_name, slug: retrySlug, industry: industry || null, currency: "EUR" }])
        .select()
        .single();
      if (retryErr) {
        return NextResponse.json({ error: retryErr.message }, { status: 400 });
      }
      return await createProfileAndMembers(retryOrg.id, userId, full_name, email);
    }
    return NextResponse.json({ error: orgError.message }, { status: 400 });
  }

  return await createProfileAndMembers(org.id, userId, full_name, email);
}

async function createProfileAndMembers(
  orgId: string,
  userId: string,
  fullName: string | null,
  email: string | null,
) {
  // 2. Create profile (owner role)
  const { error: profileError } = await supabaseAdmin
    .from("profiles")
    .upsert({
      id: userId,
      org_id: orgId,
      full_name: fullName || email || null,
      role: "owner",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: "id" });

  if (profileError) {
    console.error("[signup] profile create error:", profileError);
    return NextResponse.json({ error: profileError.message }, { status: 400 });
  }

  // 3. Create org_members row (required for RLS)
  const { error: memberError } = await supabaseAdmin
    .from("org_members")
    .upsert({
      org_id: orgId,
      user_id: userId,
      role: "owner",
      created_at: new Date().toISOString(),
    }, { onConflict: "org_id,user_id" });

  if (memberError) {
    console.error("[signup] org_members create error:", memberError);
    // Non-fatal — profile exists, can be backfilled
  }

  return NextResponse.json({ orgId, success: true }, { status: 201 });
}
