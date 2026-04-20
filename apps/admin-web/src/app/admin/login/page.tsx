'use client';

// app/admin/login/page.tsx
// ✅ LOGIN ADMIN (solo módulo admin)
// ✅ Supabase Auth + validación en public.profiles (role/admin + activo)
// ✅ UI PRO glass + motion
// ✅ Redirect: PATHS.admin.dashboard
// ✅ Logo: /public/global_ice.png -> src="/global_ice.png"
// ✅ Fondo: /public/admin.jpg -> bg image
// ✅ FIX CRÍTICO: useAdminAuth().signIn retorna { ok: boolean }, NO boolean

import React, { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';

import { PATHS } from '@/lib/constants/paths';
import { useAdminAuth } from '@/lib/hooks/useAdminAuth';
import { useAdminGuard } from '@/lib/hooks/useAdminGuard';

import { Mail, Lock, Eye, EyeOff, AlertCircle, ShieldCheck, ArrowRight } from 'lucide-react';

/* =====================================================
   UTIL
===================================================== */

function cx(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(' ');
}

function safeMsg(err: unknown) {
  if (!err) return '';
  if (typeof err === 'string') return err;
  if (err instanceof Error) return err.message || 'Error';
  try {
    return String(err);
  } catch {
    return 'Error';
  }
}

/* =====================================================
   PAGE
===================================================== */

export default function AdminLoginPage() {
  const router = useRouter();

  // ✅ Guard: si ya hay sesión admin válida, (idealmente) te redirige al dashboard
  const guard = useAdminGuard();

  const { signIn, loading, error } = useAdminAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [localError, setLocalError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);

  const [showPassword, setShowPassword] = useState(false);

  const canSubmit = useMemo(() => {
    return (
      email.trim().length > 3 &&
      password.length >= 6 &&
      !loading &&
      !loginLoading &&
      !guard.loading
    );
  }, [email, password, loading, loginLoading, guard.loading]);

  useEffect(() => {
    if (localError) setLocalError('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [email, password]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    setLocalError('');
    setLoginLoading(true);

    const res = await signIn(email.trim(), password);

    setLoginLoading(false);

    if (res.ok) {
      router.replace(PATHS.admin.dashboard);
      return;
    }

    setLocalError(res.error || 'Credenciales incorrectas');
  };

  const uiError = localError || safeMsg(error);

  return (
    <div className="relative min-h-[100svh] overflow-hidden bg-[#070B18] text-white">
      <BackgroundImage />
      <BackgroundFX />

      <div className="relative z-10 mx-auto flex min-h-[100svh] max-w-6xl items-center justify-center px-4 py-12">
        <motion.div
          initial={{ opacity: 0, y: 18, scale: 0.985 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.55, ease: 'easeOut' }}
          className="w-full max-w-md"
        >
          <GlassCard>
            <Header />

            <div className="mt-6">
              <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-[#4DADFF]" />
                  <span className="text-sm text-white/80">Módulo de Administración</span>
                </div>
                <div className="text-xs text-white/50">
                  {guard.loading ? 'Verificando sesión…' : 'Acceso seguro'}
                </div>
              </div>
            </div>

            <form onSubmit={onSubmit} className="mt-5 space-y-4">
              <Field
                label="Correo"
                value={email}
                onChange={setEmail}
                type="email"
                placeholder="admin@globalice.com"
                autoComplete="email"
                icon={<Mail className="h-4 w-4 text-white/55" />}
                disabled={loading || loginLoading || guard.loading}
              />

              <PasswordField
                label="Contraseña"
                value={password}
                onChange={setPassword}
                placeholder="••••••••"
                autoComplete="current-password"
                show={showPassword}
                onToggle={() => setShowPassword((s) => !s)}
                disabled={loading || loginLoading || guard.loading}
              />

              <motion.button
                type="submit"
                disabled={!canSubmit}
                whileHover={{ scale: canSubmit ? 1.01 : 1 }}
                whileTap={{ scale: canSubmit ? 0.985 : 1 }}
                className={cx(
                  'mt-2 w-full rounded-2xl px-4 py-3 font-semibold transition',
                  'shadow-[0_18px_50px_rgba(0,0,0,0.35)]',
                  canSubmit
                    ? 'bg-gradient-to-r from-[#0B1C3A] via-[#144078] to-[#4DADFF] hover:brightness-110'
                    : 'cursor-not-allowed bg-white/10 text-white/40'
                )}
              >
                <span className="inline-flex items-center justify-center gap-2">
                  {loading || loginLoading || guard.loading ? (
                    <>
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/70 border-t-transparent" />
                      Verificando…
                    </>
                  ) : (
                    <>
                      Entrar
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </span>
              </motion.button>

              <AnimatePresence>
                {uiError ? (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 8 }}
                    className="mt-3 rounded-2xl border border-red-400/25 bg-red-500/10 px-4 py-3 text-sm text-red-100"
                  >
                    <div className="flex items-start gap-3">
                      <AlertCircle className="mt-0.5 h-5 w-5 text-red-200" />
                      <div className="flex-1">
                        <div className="font-semibold text-red-100">No se pudo iniciar sesión</div>
                        <div className="mt-1 text-red-100/90">{uiError}</div>
                      </div>
                    </div>
                  </motion.div>
                ) : null}
              </AnimatePresence>

              <div className="pt-2 text-center text-xs text-white/45">
                © {new Date().getFullYear()} Global Ice de México
              </div>
            </form>
          </GlassCard>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.25 }}
            className="mt-4 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-xs text-white/60"
          >
            Tu usuario debe existir en <span className="font-semibold text-white/80">profiles</span> con rol{' '}
            <span className="font-semibold text-white/80">admin</span> y estar activo.
          </motion.div>
        </motion.div>
      </div>
    </div>
  );
}

/* =====================================================
   UI PIECES
===================================================== */

function BackgroundImage() {
  return (
    <div className="pointer-events-none absolute inset-0">
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: 'url(/login.jpg)' }}
      />
      <div className="absolute inset-0 bg-black/65" />
      <div className="absolute inset-0 bg-[radial-gradient(900px_520px_at_30%_20%,rgba(77,173,255,0.14),transparent_60%),radial-gradient(900px_520px_at_80%_85%,rgba(133,40,56,0.12),transparent_60%)]" />
    </div>
  );
}

function BackgroundFX() {
  return (
    <div className="pointer-events-none absolute inset-0">
      <div className="absolute inset-0 bg-[radial-gradient(900px_520px_at_18%_22%,rgba(77,173,255,0.18),transparent_60%),radial-gradient(780px_520px_at_85%_15%,rgba(133,40,56,0.14),transparent_60%),radial-gradient(900px_560px_at_50%_95%,rgba(20,64,120,0.18),transparent_60%)]" />

      <motion.div
        animate={{ opacity: [0.14, 0.26, 0.14] }}
        transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut' }}
        className="absolute left-1/2 top-[-320px] h-[820px] w-[820px] -translate-x-1/2 rounded-full bg-white/10 blur-3xl"
      />

      <div className="absolute inset-0 opacity-[0.10] [background-image:linear-gradient(to_right,rgba(255,255,255,0.07)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.07)_1px,transparent_1px)] [background-size:72px_72px]" />
    </div>
  );
}

function GlassCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative overflow-hidden rounded-3xl border border-white/12 bg-white/6 p-7 shadow-[0_28px_90px_rgba(0,0,0,0.55)] backdrop-blur-xl">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-24 left-1/2 h-64 w-[520px] -translate-x-1/2 rounded-full bg-white/10 blur-2xl" />
        <div className="absolute bottom-[-140px] right-[-140px] h-80 w-80 rounded-full bg-[#4DADFF]/12 blur-3xl" />
        <div className="absolute top-[-140px] left-[-140px] h-80 w-80 rounded-full bg-[#852838]/10 blur-3xl" />
      </div>
      <div className="relative">{children}</div>
    </div>
  );
}

function Header() {
  return (
    <div className="flex items-center gap-4">
      <div className="relative h-20 w-20 overflow-hidden rounded-2xl border border-white/12 bg-white/8 shadow-[0_12px_30px_rgba(0,0,0,0.35)]">
        <Image src="/global_ice.png" alt="Global Ice" fill priority className="object-contain p-2" />
      </div>

      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight">Sistema de Entregas</h1>
        <p className="mt-1 text-sm text-white/70 truncate">Global Ice de México SA. de CV.</p>
      </div>
    </div>
  );
}

type FieldProps = {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type: React.HTMLInputTypeAttribute;
  placeholder?: string;
  autoComplete?: string;
  icon?: React.ReactNode;
  disabled?: boolean;
};

function Field({ label, value, onChange, type, placeholder, autoComplete, icon, disabled }: FieldProps) {
  return (
    <div className="space-y-2">
      <label className="text-sm text-white/80">{label}</label>

      <div className="relative">
        <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2">{icon}</div>

        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          type={type}
          autoComplete={autoComplete}
          placeholder={placeholder}
          disabled={disabled}
          className={cx(
            'w-full rounded-2xl border bg-white/5 px-4 py-3 pl-10 outline-none transition',
            'border-white/12 text-white placeholder:text-white/35',
            'focus:border-[#4DADFF]/60 focus:ring-2 focus:ring-[#4DADFF]/20',
            disabled && 'opacity-60'
          )}
        />
      </div>
    </div>
  );
}

type PasswordFieldProps = {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoComplete?: string;
  show: boolean;
  onToggle: () => void;
  disabled?: boolean;
};

function PasswordField({
  label,
  value,
  onChange,
  placeholder,
  autoComplete,
  show,
  onToggle,
  disabled,
}: PasswordFieldProps) {
  return (
    <div className="space-y-2">
      <label className="text-sm text-white/80">{label}</label>

      <div className="relative">
        <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2">
          <Lock className="h-4 w-4 text-white/55" />
        </div>

        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          type={show ? 'text' : 'password'}
          autoComplete={autoComplete}
          placeholder={placeholder}
          disabled={disabled}
          className={cx(
            'w-full rounded-2xl border bg-white/5 px-4 py-3 pl-10 pr-12 outline-none transition',
            'border-white/12 text-white placeholder:text-white/35',
            'focus:border-[#4DADFF]/60 focus:ring-2 focus:ring-[#4DADFF]/20',
            disabled && 'opacity-60'
          )}
        />

        <button
          type="button"
          onClick={onToggle}
          disabled={disabled}
          className={cx(
            'absolute right-3 top-1/2 -translate-y-1/2 rounded-xl p-2',
            'text-white/55 hover:text-white/85 hover:bg-white/5 transition',
            disabled && 'opacity-50 cursor-not-allowed'
          )}
          aria-label={show ? 'Ocultar contraseña' : 'Mostrar contraseña'}
        >
          {show ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
        </button>
      </div>
    </div>
  );
}