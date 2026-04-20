// src/lib/supabase/authedFetch.ts
import { supabaseBrowser } from '@/lib/supabase/client';

export async function authedFetch<T = any>(url: string, init: RequestInit = {}) {
  const { data } = await supabaseBrowser.auth.getSession();
  const token = data.session?.access_token;

  if (!token) {
    // Esto te dice claramente que NO hay sesión en el navegador
    throw new Error('No auth token (no session). Vuelve a iniciar sesión.');
  }

  const headers = new Headers(init.headers || {});
  headers.set('Authorization', `Bearer ${token}`);

  if (!headers.has('Content-Type') && init.body) {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(url, { ...init, headers });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json?.error || `HTTP ${res.status}`);
  }

  return json as T;
}