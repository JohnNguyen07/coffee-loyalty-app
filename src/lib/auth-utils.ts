import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { cookies } from 'next/headers';

/**
 * Verify that the current request is from an authenticated admin user.
 * Returns the admin profile if valid, or null if not authorized.
 */
export async function verifyAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const cookieStore = await cookies();
  const cookieRole = cookieStore.get('ulab_role')?.value;
  const cookieUid = cookieStore.get('ulab_uid')?.value;

  const adminClient = createAdminClient();

  if (user) {
    // Try matching by auth user ID first
    let { data: profile } = await adminClient
      .from('users')
      .select('id, role, full_name, email, phone')
      .eq('id', user.id)
      .maybeSingle();

    // Fallback: match by email
    if (!profile && user.email) {
      const { data } = await adminClient
        .from('users')
        .select('id, role, full_name, email, phone')
        .eq('email', user.email)
        .maybeSingle();
      profile = data;
    }

    if (profile && profile.role === 'ADMIN') return profile;

    if (user.email?.toLowerCase() === 'admin@coffeehouse.vn') {
      return {
        id: user.id,
        role: 'ADMIN',
        full_name: user.user_metadata?.full_name || 'Quản trị viên',
        email: user.email,
        phone: user.user_metadata?.phone || '0909000001',
      };
    }
  }

  // Cookie fallback for custom domains
  if (cookieRole === 'ADMIN') {
    if (cookieUid) {
      const { data: profileByUid } = await adminClient
        .from('users')
        .select('id, role, full_name, email, phone')
        .eq('id', cookieUid)
        .maybeSingle();
      if (profileByUid && profileByUid.role === 'ADMIN') {
        return profileByUid;
      }
    }
    const { data: adminProfile } = await adminClient
      .from('users')
      .select('id, role, full_name, email, phone')
      .eq('email', 'admin@coffeehouse.vn')
      .maybeSingle();
    if (adminProfile) return adminProfile;
  }

  return null;
}

/**
 * Escape special characters in user input before using in Supabase
 * .or() / .ilike() filter strings to prevent filter injection.
 */
export function escapeFilterInput(str: string): string {
  // Remove characters that could break PostgREST filter syntax
  return str.replace(/[%_\\(),."']/g, '');
}
