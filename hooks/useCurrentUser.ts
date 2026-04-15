"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";

interface CurrentUser {
  userId: string | null;
  role: string | null;
  isAdmin: boolean;
  loading: boolean;
}

export function useCurrentUser(): CurrentUser {
  const [userId, setUserId] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }
      setUserId(user.id);
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();
      setRole(profile?.role ?? "member");
      setLoading(false);
    }
    load();
  }, []);

  return {
    userId,
    role,
    isAdmin: role === "owner" || role === "admin",
    loading,
  };
}
