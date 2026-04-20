// src/lib/supabase/requireAdmin.ts
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/types/db.types';
import { getServerEnv } from './env';

type ProfileRow = {
  role: 'admin' | 'driver' | 'customer';
  activo: boolean;
};

export async function requireAdmin(req: Request) {
  const { NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY } = getServerEnv();

  const authHeader = req.headers.get('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) throw new Error('No auth token');

  const sb = createClient<Database>(
    NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );

  const { data: u, error: uerr } = await sb.auth.getUser();
  if (uerr || !u.user) throw new Error('No session');

  // 👇 Tipado manual para evitar "never"
  const { data: prof, error: perr } = (await sb
    .from('profiles')
    .select('role,activo')
    .eq('id', u.user.id)
    .single()) as { data: ProfileRow | null; error: any };

  if (perr || !prof) throw new Error('No profile');
  if (!prof.activo) throw new Error('Inactive profile');
  if (prof.role !== 'admin') throw new Error('Not admin');

  return { uid: u.user.id };
}