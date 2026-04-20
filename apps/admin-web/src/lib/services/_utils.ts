import { AppError } from './_errors';

export function requireId(id: string, name = 'id') {
  if (!id) throw new AppError('VALIDATION', `Falta ${name}`, 400);
  return id;
}

export function ensureArray<T>(v: T[] | null | undefined): T[] {
  return Array.isArray(v) ? v : [];
}

export function todayISODate() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}
