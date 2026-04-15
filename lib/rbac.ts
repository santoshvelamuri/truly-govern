// Types for user and profile
export interface UserProfile {
  id: string;
  email: string;
  role: string;
}

import { supabase } from './supabaseClient';


// Fetch the current user's role from the profiles table
export async function getCurrentUserRole(): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data, error } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();
  if (error || !data) return null;
  return data.role;
}

// Role check helper
export function hasRole(profile: UserProfile | null, role: string | string[]): boolean {
  if (!profile) return false;
  if (Array.isArray(role)) return role.includes(profile.role);
  return profile.role === role;
}
