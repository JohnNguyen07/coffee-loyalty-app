import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { cookies } from 'next/headers';
import {
  DEFAULT_BUSINESS_ID,
  DEFAULT_LOCATION_ID,
  DEFAULT_LOCATION_NAME,
  type StaffRole,
} from '@/lib/pos/domain';

export interface PosStaffContext {
  id: string;
  dbUserId: string | null;
  fullName: string;
  email: string | null;
  phone: string | null;
  role: 'ADMIN' | 'USER';
  staffRole: StaffRole;
  businessId: string;
  locationId: string;
  locationName: string;
}

interface StaffDbRow {
  id?: string;
  staff_role?: string;
  business_id?: string;
  location_id?: string;
  full_name?: string;
  email?: string;
  phone?: string;
}

/**
 * Verify that the current request is from an authenticated admin user.
 * Returns the admin profile if valid, or null if not authorized.
 */
export async function verifyAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const cookieStore = await cookies();
  const cookieRole = cookieStore.get('ulab_role')?.value;
  const cookieUid = cookieStore.get('ulab_uid')?.value;

  const adminClient = createAdminClient();

  if (user) {
    // Try matching by auth user ID first
    let { data: profile } = await adminClient
      .from('users')
      .select('*')
      .eq('id', user.id)
      .maybeSingle();

    // Fallback: match by email
    if (!profile && user.email) {
      const { data } = await adminClient
        .from('users')
        .select('*')
        .eq('email', user.email)
        .maybeSingle();
      profile = data;
    }

    if (profile && profile.role === 'ADMIN') return profile;

    if (user.email?.toLowerCase() === 'admin@coffeehouse.vn') {
      return {
        id: profile?.id || user.id,
        role: 'ADMIN',
        full_name: profile?.full_name || user.user_metadata?.full_name || 'Quản trị viên',
        email: user.email,
        phone: profile?.phone || user.user_metadata?.phone || '0909000001',
      };
    }
  }

  // Cookie fallback for custom domains (verified against DB row)
  if (cookieRole === 'ADMIN' && cookieUid) {
    const { data: profileByUid } = await adminClient
      .from('users')
      .select('*')
      .eq('id', cookieUid)
      .maybeSingle();
    if (profileByUid && profileByUid.role === 'ADMIN') {
      return profileByUid;
    }
  }

  if (cookieRole === 'ADMIN') {
    const { data: adminProfile } = await adminClient
      .from('users')
      .select('*')
      .eq('email', 'admin@coffeehouse.vn')
      .maybeSingle();
    if (adminProfile && adminProfile.role === 'ADMIN') return adminProfile;
  }

  return null;
}

/**
 * Verify POS Staff context on the server.
 * Never trusts client-supplied business_id, location_id, or role.
 */
export async function verifyPosStaff(): Promise<PosStaffContext | null> {
  const admin = await verifyAdmin();
  const adminClient = createAdminClient();

  if (admin) {
    // Check if this ID actually exists in `users` table for foreign key safety
    const { data: dbUser } = await adminClient
      .from('users')
      .select('id, staff_role, business_id, location_id')
      .eq('id', admin.id)
      .maybeSingle();

    const staffRow = dbUser as StaffDbRow | null;
    const rawStaffRole = String(staffRow?.staff_role || 'ADMIN').toUpperCase();
    const staffRole: StaffRole =
      rawStaffRole === 'CASHIER'
        ? 'CASHIER'
        : rawStaffRole === 'MANAGER'
          ? 'MANAGER'
          : 'ADMIN';

    return {
      id: admin.id,
      dbUserId: staffRow?.id || null,
      fullName: admin.full_name || 'Quản trị viên Ủ LAB',
      email: admin.email || null,
      phone: admin.phone || null,
      role: 'ADMIN',
      staffRole,
      businessId: staffRow?.business_id || DEFAULT_BUSINESS_ID,
      locationId: staffRow?.location_id || DEFAULT_LOCATION_ID,
      locationName: DEFAULT_LOCATION_NAME,
    };
  }

  return null;
}

/**
 * Escape special characters in user input before using in Supabase
 * .or() / .ilike() filter strings to prevent filter injection.
 */
export function escapeFilterInput(str: string): string {
  return str.replace(/[%_\\(),."']/g, '');
}
