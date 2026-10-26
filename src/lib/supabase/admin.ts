import { createClient } from '@supabase/supabase-js';

const DEFAULT_SUPABASE_URL = 'https://ivrcvfvapczjypbbbegj.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY = 'sb_publishable_ltadW13tLk7edng2qEcFrg_YyO67LwW';

function sanitizeEnv(val: string | undefined, fallback: string): string {
  const cleaned = (val || '').trim().replace(/^["']|["']$/g, '');
  if (!cleaned || cleaned.includes('placeholder')) return fallback;
  return cleaned;
}

// Service role client to perform privileged database operations and bypass RLS
export function createAdminClient() {
  const url = sanitizeEnv(process.env.NEXT_PUBLIC_SUPABASE_URL, DEFAULT_SUPABASE_URL);
  const anonFallback = sanitizeEnv(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, DEFAULT_SUPABASE_ANON_KEY);
  const key = sanitizeEnv(process.env.SUPABASE_SERVICE_ROLE_KEY, anonFallback);
  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
