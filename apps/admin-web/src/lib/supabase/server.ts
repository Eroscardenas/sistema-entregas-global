// src/lib/supabase/server.ts
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/types/db.types';
import { getPublicEnv } from './env';

const { NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY } = getPublicEnv();

export function supabaseServerAnon() {
  return createClient<Database>(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
