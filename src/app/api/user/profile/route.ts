import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

// GET /api/user/profile — Get current user profile with tier and transactions info
export async function GET() {
  const supabase = await createClient();
  const cookieStore = await cookies();
  const cookieUid = cookieStore.get('ulab_uid')?.value;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user && !cookieUid) {
    return NextResponse.json({ user: null });
  }

  const adminClient = createAdminClient();
  const targetId = user?.id || cookieUid;

  let { data: profile } = await adminClient
    .from('users')
    .select('*, tier:tiers(*)')
    .eq('id', targetId)
    .maybeSingle();

  if (!profile && user?.email) {
    const { data } = await adminClient
      .from('users')
      .select('*, tier:tiers(*)')
      .eq('email', user.email)
      .maybeSingle();
    profile = data;
  }

  if (!profile && user?.user_metadata?.phone) {
    const { data } = await adminClient
      .from('users')
      .select('*, tier:tiers(*)')
      .eq('phone', user.user_metadata.phone)
      .maybeSingle();
    profile = data;
  }

  if (!profile) {
    return NextResponse.json({ user: null });
  }

  // Get next tier info
  const { data: nextTier } = await adminClient
    .from('tiers')
    .select('*')
    .gt('min_spending', profile.total_spending || 0)
    .order('min_spending', { ascending: true })
    .limit(1)
    .maybeSingle();

  // Get recent point transactions
  const { data: recentTransactions } = await adminClient
    .from('point_transactions')
    .select('*')
    .eq('user_id', profile.id)
    .order('created_at', { ascending: false })
    .limit(10);

  return NextResponse.json({
    user: {
      ...profile,
      next_tier: nextTier || null,
      recent_transactions: recentTransactions || [],
    },
  });
}
