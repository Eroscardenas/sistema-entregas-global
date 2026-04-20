'use client';

import { useCallback, useMemo, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';

type AdminProfile = {
  id: string;
  role: string;
  nombre: string;
  activo: boolean;
};

type AdminAuthState = {
  loading: boolean;
  error: string | null;
};

function normalizeEmail(email: string) {
  return (email ?? '').trim().toLowerCase();
}

async function getAdminProfileById(userId: string) {
  const { data, error } = await supabaseBrowser
    .from('profiles')
    .select('id, role, nombre, activo')
    .eq('id', userId)
    .maybeSingle();

  if (error) throw error;
  return (data ?? null) as AdminProfile | null;
}

function isAdminRole(role: string | null | undefined) {
  return role === 'admin';
}

export function useAdminAuth() {
  const [state, setState] = useState<AdminAuthState>({
    loading: false,
    error: null,
  });

  const signIn = useCallback(async (email: string, password: string) => {
    setState({ loading: true, error: null });

    try {
      const cleanEmail = normalizeEmail(email);

      const { data, error } = await supabaseBrowser.auth.signInWithPassword({
        email: cleanEmail,
        password,
      });

      if (error) throw error;

      const userId = data.user?.id;
      if (!userId) {
        await supabaseBrowser.auth.signOut();
        throw new Error('No se pudo validar la sesión.');
      }

      const profile = await getAdminProfileById(userId);

      if (!profile) {
        await supabaseBrowser.auth.signOut();
        throw new Error('Tu usuario no está registrado en el sistema.');
      }

      if (profile.activo === false) {
        await supabaseBrowser.auth.signOut();
        throw new Error('Tu usuario está desactivado.');
      }

      if (!isAdminRole(profile.role)) {
        await supabaseBrowser.auth.signOut();
        throw new Error('No tienes permisos de administrador.');
      }

      setState({ loading: false, error: null });
      return { ok: true as const, user: profile };
    } catch (e: any) {
      const msg =
        typeof e?.message === 'string'
          ? e.message
          : 'No se pudo iniciar sesión. Intenta de nuevo.';
      setState({ loading: false, error: msg });
      return { ok: false as const, error: msg };
    }
  }, []);

  const signOut = useCallback(async () => {
    setState({ loading: true, error: null });

    try {
      await supabaseBrowser.auth.signOut();
      setState({ loading: false, error: null });
      return { ok: true as const };
    } catch (e: any) {
      const msg =
        typeof e?.message === 'string'
          ? e.message
          : 'No se pudo cerrar sesión.';
      setState({ loading: false, error: msg });
      return { ok: false as const, error: msg };
    }
  }, []);

  return useMemo(
    () => ({
      ...state,
      signIn,
      signOut,
    }),
    [state, signIn, signOut]
  );
}