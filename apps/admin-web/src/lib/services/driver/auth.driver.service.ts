import type { SB } from '../_sb';
import { throwIfError, AppError } from '../_errors';

type Driver =
  import('@/lib/types/supabase').Database['public']['Tables']['drivers']['Row'];

export class AuthDriverService {
  constructor(private sb: SB) {}

  /**
   * Login de chofer:
   * - NO compara pin_hash en el cliente
   * - Llama a API server-side que valida pin contra pin_hash
   */
  async login(input: { nombre: string; pin: string }) {
    const nombre = (input.nombre ?? '').trim();
    const pin = (input.pin ?? '').trim();

    if (!nombre) throw new AppError('VALIDATION', 'Nombre requerido', 400);
    if (!pin) throw new AppError('VALIDATION', 'PIN requerido', 400);

    const res = await fetch('/api/driver/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre, pin }),
    });

    if (!res.ok) {
      const msg = await res.text().catch(() => 'Login inválido');
      throw new AppError('LOGIN_FAILED', msg || 'Login inválido', res.status);
    }

    const data = (await res.json()) as { driver: Driver };
    return data.driver;
  }

  /**
   * Obtener driver por id (útil para refrescar sesión local)
   */
  async getById(id: string) {
    const { data, error } = await this.sb.from('drivers').select('*').eq('id', id).single();
    throwIfError(error);
    return data as Driver;
  }
}
