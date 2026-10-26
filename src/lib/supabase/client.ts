import { createBrowserClient } from '@supabase/ssr';

const DEFAULT_SUPABASE_URL = 'https://ivrcvfvapczjypbbbegj.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY = 'sb_publishable_ltadW13tLk7edng2qEcFrg_YyO67LwW';

function sanitizeEnv(val: string | undefined, fallback: string): string {
  const cleaned = (val || '').trim().replace(/^["']|["']$/g, '');
  if (!cleaned || cleaned.includes('placeholder')) return fallback;
  return cleaned;
}

export function isSupabaseConfigured(): boolean {
  const url = sanitizeEnv(process.env.NEXT_PUBLIC_SUPABASE_URL, DEFAULT_SUPABASE_URL);
  const key = sanitizeEnv(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, DEFAULT_SUPABASE_ANON_KEY);
  return Boolean(url && key && !url.includes('placeholder'));
}

export function createClient() {
  const url = sanitizeEnv(process.env.NEXT_PUBLIC_SUPABASE_URL, DEFAULT_SUPABASE_URL);
  const anonKey = sanitizeEnv(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, DEFAULT_SUPABASE_ANON_KEY);

  return createBrowserClient(url, anonKey);
}
