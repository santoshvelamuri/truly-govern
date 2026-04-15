import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { withAuth } from "@/lib/api-auth";

export const POST = withAuth(async (req, ctx) => {
  const { email, full_name, role } = await req.json();
  if (!email) {
    return NextResponse.json({ error: "email is required" }, { status: 400 });
  }

  // 1. Invite user via Supabase Admin (sends invitation email)
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  const { data: invite, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
    data: {
      org_id: ctx.orgId,
      full_name: full_name || email,
      role: role || "member",
    },
    redirectTo: `${siteUrl}/auth/callback`,
  });
  if (inviteError) {
    console.error("[profiles/invite POST]", inviteError);
    return NextResponse.json({ error: inviteError.message }, { status: 400 });
  }

  // 2. Upsert profile row
  const { error: profileError } = await supabaseAdmin.from("profiles").upsert({
    id: invite.user.id,
    org_id: ctx.orgId,
    full_name: full_name || null,
    role: role || "member",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }, { onConflict: "id" });
  if (profileError) {
    console.error("[profiles/invite POST — profile upsert]", profileError);
    return NextResponse.json({ error: profileError.message }, { status: 400 });
  }

  // 3. Insert org_members row — required for RLS
  const { error: memberError } = await supabaseAdmin.from("org_members").upsert({
    org_id: ctx.orgId,
    user_id: invite.user.id,
    role: role || "member",
    created_at: new Date().toISOString(),
  }, { onConflict: "org_id,user_id" });
  if (memberError) {
    console.error("[profiles/invite POST — org_members upsert]", memberError);
  }

  return NextResponse.json({ success: true, userId: invite.user.id });
}, { roles: ["owner", "admin"] });
