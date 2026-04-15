import { supabase } from '@/lib/supabaseClient';

export async function getOrgId(): Promise<string> {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData?.user?.id;
  if (!userId) throw new Error('User not authenticated');

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('org_id')
    .eq('id', userId)
    .single();

  if (error || !profile?.org_id) throw new Error('org_id not found');
  return profile.org_id;
}
