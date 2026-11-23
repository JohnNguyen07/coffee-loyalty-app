import type { User } from '@supabase/supabase-js';
import type { createAdminClient } from '@/lib/supabase/admin';

type AdminSupabaseClient = ReturnType<typeof createAdminClient>;

/**
 * Validate member login password (minimum 6 characters).
 */
export function validateMemberPassword(rawPassword: unknown): string {
  const password = String(rawPassword ?? '').trim();
  if (password.length < 6) {
    throw new Error('Mật khẩu đăng nhập phải có ít nhất 6 ký tự.');
  }
  return password;
}

/**
 * Paginate through all Supabase Auth users.
 */
export async function listAllAuthUsers(adminClient: AdminSupabaseClient): Promise<User[]> {
  const collected: User[] = [];
  let page = 1;
  const perPage = 1000;

  while (true) {
    const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage });
    if (error) {
      throw new Error(error.message || 'Không thể tải danh sách tài khoản Auth.');
    }
    const batch = data?.users || [];
    collected.push(...batch);
    if (batch.length < perPage) {
      break;
    }
    page += 1;
  }

  return collected;
}

/**
 * Create a confirmed Supabase Auth user for a customer member.
 */
export async function createMemberAuthUser(
  adminClient: AdminSupabaseClient,
  params: {
    email: string;
    password: string;
    fullName: string;
    phone: string;
  }
): Promise<
  | { ok: true; authUserId: string }
  | { ok: false; status: number; error: string }
> {
  const targetEmail = params.email.trim().toLowerCase();

  try {
    const allUsers = await listAllAuthUsers(adminClient);
    const conflict = allUsers.find((u) => (u.email || '').toLowerCase() === targetEmail);
    if (conflict) {
      return {
        ok: false,
        status: 409,
        error: 'Email này đã được đăng ký bởi tài khoản khác.',
      };
    }

    const { data, error } = await adminClient.auth.admin.createUser({
      email: targetEmail,
      password: params.password,
      email_confirm: true,
      user_metadata: {
        full_name: params.fullName,
        phone: params.phone,
      },
    });

    if (error || !data?.user) {
      return {
        ok: false,
        status: 500,
        error: error?.message || 'Không thể tạo tài khoản đăng nhập cho thành viên.',
      };
    }

    return { ok: true, authUserId: data.user.id };
  } catch (err: unknown) {
    return {
      ok: false,
      status: 500,
      error: err instanceof Error ? err.message : 'Lỗi khởi tạo tài khoản đăng nhập.',
    };
  }
}

/**
 * Sync updated customer profile fields (name, phone, email) to Supabase Auth when linked.
 */
export async function syncMemberAuthProfile(
  adminClient: AdminSupabaseClient,
  params: {
    publicUserId: string;
    googleId?: string | null;
    oldEmail?: string | null;
    fullName: string;
    phone?: string | null;
    email?: string | null;
  }
): Promise<void> {
  try {
    let matchedUser: User | null = null;

    if (params.googleId) {
      const { data } = await adminClient.auth.admin.getUserById(params.googleId);
      if (data?.user) matchedUser = data.user;
    }

    if (!matchedUser && params.publicUserId && params.publicUserId !== params.googleId) {
      const { data } = await adminClient.auth.admin.getUserById(params.publicUserId);
      if (data?.user) matchedUser = data.user;
    }

    if (!matchedUser && params.oldEmail) {
      const oldLower = params.oldEmail.trim().toLowerCase();
      const allUsers = await listAllAuthUsers(adminClient);
      matchedUser = allUsers.find((u) => (u.email || '').toLowerCase() === oldLower) || null;
    }

    if (!matchedUser) return;

    const nextEmail = params.email?.trim().toLowerCase();
    const shouldUpdateEmail =
      Boolean(nextEmail) && nextEmail !== (matchedUser.email || '').toLowerCase();

    await adminClient.auth.admin.updateUserById(matchedUser.id, {
      ...(shouldUpdateEmail ? { email: nextEmail, email_confirm: true } : {}),
      user_metadata: {
        ...(matchedUser.user_metadata || {}),
        full_name: params.fullName,
        phone: params.phone || undefined,
      },
    });
  } catch (err) {
    console.warn('syncMemberAuthProfile non-fatal error:', err);
  }
}
