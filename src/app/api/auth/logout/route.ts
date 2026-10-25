import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

// POST /api/auth/logout
export async function POST() {
  try {
    const supabase = await createClient();
    await supabase.auth.signOut();
    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('Logout error:', err);
    return NextResponse.json({ error: 'Lỗi đăng xuất' }, { status: 500 });
  }
}
