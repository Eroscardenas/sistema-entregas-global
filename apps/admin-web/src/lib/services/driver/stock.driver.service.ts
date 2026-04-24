import type { SB } from '../_sb';
import { throwIfError } from '../_errors';

type StockMovement =
  import('@/lib/types/supabase').Database['public']['Tables']['stock_movements']['Row'];

export class StockDriverService {
  constructor(private sb: SB) {}

  async listMovements(_driverId: string, limit = 50) {
    const { data, error } = await this.sb
      .from('stock_movements')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    throwIfError(error);
    return (data ?? []) as StockMovement[];
  }

  async listRecent(limit = 50) {
    const { data, error } = await this.sb
      .from('stock_movements')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    throwIfError(error);
    return (data ?? []) as StockMovement[];
  }
}
