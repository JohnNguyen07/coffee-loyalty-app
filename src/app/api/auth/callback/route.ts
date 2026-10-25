import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

// POST /api/auth/callback — Handle Google OAuth callback
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/';

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error && data.user) {
      // Check if user profile exists in our users table
      const { data: existingUser } = await supabase
        .from('users')
        .select('id')
        .eq('google_id', data.user.id)
        .single();

      if (!existingUser) {
        // Get default MEMBER tier
        const { data: memberTier } = await supabase
          .from('tiers')
          .select('id')
          .eq('code', 'MEMBER')
          .single();

        if (memberTier) {
          // Create user profile with welcome bonus
          const { data: newUser } = await supabase
            .from('users')
            .insert({
              google_id: data.user.id,
              email: data.user.email,
              full_name: data.user.user_metadata?.full_name || data.user.user_metadata?.name,
              avatar_url: data.user.user_metadata?.avatar_url,
              current_tier_id: memberTier.id,
              point_balance: 10000, // Welcome bonus
              received_welcome_10k: true,
            })
            .select('id')
            .single();

          // Log welcome bonus transaction
          if (newUser) {
            await supabase.from('point_transactions').insert({
              user_id: newUser.id,
              type: 'WELCOME_BONUS',
              amount: 10000,
              balance_after: 10000,
              description: 'Thưởng chào mừng thành viên mới',
            });
          }
        }
      }

      // Redirect with the next URL
      const forwardedHost = request.headers.get('x-forwarded-host');
      const isLocalEnv = process.env.NODE_ENV === 'development';

      if (isLocalEnv) {
        return NextResponse.redirect(`${origin}${next}`);
      } else if (forwardedHost) {
        return NextResponse.redirect(`https://${forwardedHost}${next}`);
      } else {
        return NextResponse.redirect(`${origin}${next}`);
      }
    }
  }

  // Auth error — redirect to error page
  return NextResponse.redirect(`${origin}/login?error=auth_failed`);
}
