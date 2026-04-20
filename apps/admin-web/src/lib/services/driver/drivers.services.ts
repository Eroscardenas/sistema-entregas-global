'use client';

import type { DriverRow } from '@/lib/types/driver.types';

type ApiOk<T> = { ok: true; data: T };
type ApiErr = { ok: false; error: string };
type ApiResp<T> = ApiOk<T> | ApiErr;

/**
 * Parser robusto que evita errores cuando:
 * - el body viene vacío
 * - el servidor responde texto
 * - el servidor responde HTML
 */
async function parse<T>(res: Response): Promise<T> {
  const contentType = res.headers.get('content-type') || '';
  const text = await res.text();

  // Si no hay body
  if (!text) {
    if (!res.ok) {
      throw new Error(`Error ${res.status}`);
    }
    return {} as T;
  }

  // Si no es JSON
  if (!contentType.includes('application/json')) {
    throw new Error(text.slice(0, 200));
  }

  let json: ApiResp<T>;

  try {
    json = JSON.parse(text);
  } catch {
    throw new Error('Respuesta JSON inválida');
  }

  if (!res.ok || (json as any).ok === false) {
    throw new Error((json as any).error || `Error ${res.status}`);
  }

  return (json as any).data;
}

export class DriversService {

  async list(q?: string): Promise<DriverRow[]> {
    const url = `/api/admin/drivers${q ? `?q=${encodeURIComponent(q)}` : ''}`;

    const res = await fetch(url, {
      method: 'GET',
      credentials: 'include',
    });

    return parse<DriverRow[]>(res);
  }

  async create(input: {
    nombre: string;
    telefono: string;
    password: string;
    activo?: boolean;
  }): Promise<DriverRow> {

    const res = await fetch('/api/admin/drivers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(input),
    });

    return parse<DriverRow>(res);
  }

  async update(
    id: string,
    patch: {
      nombre?: string;
      telefono?: string;
      activo?: boolean;
      password?: string;
    }
  ): Promise<void> {

    const res = await fetch(`/api/admin/drivers/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(patch),
    });

    await parse(res);
  }

  async remove(id: string): Promise<void> {

    const res = await fetch(`/api/admin/drivers/${id}`, {
      method: 'DELETE',
      credentials: 'include',
    });

    await parse(res);
  }
}

export const driversService = new DriversService();