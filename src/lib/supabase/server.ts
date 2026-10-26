import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { resolveSupabaseUrl, resolveSupabaseAnonKey } from './client';

export function isSupabaseConfigured(): boolean {
  return true;
}

export async function createClient() {
  const cookieStore = await cookies();
  const url = resolveSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const anonKey = resolveSupabaseAnonKey(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

  return createServerClient(
    url,
    anonKey,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Called from a Server Component — ignore
          }
        },
      },
    }
  );
}
