import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

// POST /api/auth/logout
export async function POST() {
  try {
    const supabase = await createClient();
    await supabase.auth.signOut();
    const res = NextResponse.json({ success: true });
    res.cookies.delete('ulab_uid');
    res.cookies.delete('ulab_role');
    return res;
  } catch (err: any) {
    console.error('Logout error:', err);
    return NextResponse.json({ error: 'Lỗi đăng xuất' }, { status: 500 });
  }
}
