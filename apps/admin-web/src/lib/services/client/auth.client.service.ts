/*import type { SB } from '../_sb';
import { throwIfError } from '../_errors';

type User = import('@/lib/types/supabase').Database['public']['Tables']['app_users']['Row'];

export class AuthClientService {
  constructor(private sb: SB) {}

  async loginByNamePin(name: string, pin: string) {
    // para cliente existente (si lo modelas como app_users con role=client)
    const { data, error } = await this.sb
      .from('app_users')
      .select('*')
      .eq('role', 'client')
      .eq('name', name.trim())
      .eq('pin_code', pin.trim())
      .eq('active', true)
      .maybeSingle();

    throwIfError(error);
    return (data ?? null) as User | null;
  }
}
  */
