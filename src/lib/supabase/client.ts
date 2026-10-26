import { createBrowserClient } from '@supabase/ssr';

const DEFAULT_SUPABASE_URL = 'https://ivrcvfvapczjypbbbegj.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY = 'sb_publishable_ltadW13tLk7edng2qEcFrg_YyO67LwW';

export function resolveSupabaseUrl(val?: string): string {
  const cleaned = (val || '').trim().replace(/^["']|["']$/g, '');
  if (cleaned.startsWith('https://') && cleaned.includes('ivrcvfvapczjypbbbegj.supabase.co')) {
    return cleaned;
  }
  return DEFAULT_SUPABASE_URL;
}

export function resolveSupabaseAnonKey(val?: string): string {
  const cleaned = (val || '').trim().replace(/^["']|["']$/g, '');
  if (cleaned.startsWith('sb_publishable_ltadW13tLk7edng2qEcFrg')) {
    return cleaned;
  }
  return DEFAULT_SUPABASE_ANON_KEY;
}

export function isSupabaseConfigured(): boolean {
  return true;
}

export function createClient() {
  const url = resolveSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const anonKey = resolveSupabaseAnonKey(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

  return createBrowserClient(url, anonKey);
}
