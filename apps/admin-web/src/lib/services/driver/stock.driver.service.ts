import type { SB } from '../_sb';
import { throwIfError } from '../_errors';

type DriverStockRow =
  import('@/lib/types/supabase').Database['public']['Tables']['driver_stock']['Row'];

type StockMovementRow =
  import('@/lib/types/supabase').Database['public']['Tables']['stock_movements']['Row'];

export class StockDriverService {
  constructor(private sb: SB) {}

  /**
   * Stock del chofer (crudo)
   */
  async myStock(driverId: string) {
    if (!driverId) throw new Error('driverId requerido');

    const { data, error } = await this.sb
      .from('driver_stock')
      .select('*')
      .eq('driver_id', driverId);

    throwIfError(error);
    return (data ?? []) as DriverStockRow[];
  }

  /**
   * Stock del chofer con info de producto (para UI)
   */
  async myStockWithProduct(driverId: string) {
    if (!driverId) throw new Error('driverId requerido');

    const { data, error } = await this.sb
      .from('driver_stock')
      .select(
        `
        *,
        products:product_id (
          id,
          nombre,
          kind,
          ice_type,
          kg_por_unidad,
          precio_base,
          activo
        )
      `
      )
      .eq('driver_id', driverId);

    throwIfError(error);
    return data ?? [];
  }

  /**
   * Movimientos del chofer
   */
  async movements(driverId: string, limit = 200) {
    if (!driverId) throw new Error('driverId requerido');

    const { data, error } = await this.sb
      .from('stock_movements')
      .select('*')
      .eq('driver_id', driverId)
      .order('created_at', { ascending: false })
      .limit(limit);

    throwIfError(error);
    return (data ?? []) as StockMovementRow[];
  }

  /**
   * Resumen rápido para dashboard del chofer
   */
  async summary(driverId: string) {
    const stock = await this.myStock(driverId);

    // Intento ser agnóstico a tu schema:
    // si tienes assigned_quantity/used_quantity/available_quantity, los uso;
    // si no, solo cuento filas.
    const totalAssigned = stock.reduce((sum, r: any) => sum + Number(r.assigned_quantity ?? 0), 0);
    const totalUsed = stock.reduce((sum, r: any) => sum + Number(r.used_quantity ?? 0), 0);
    const totalAvailable = stock.reduce((sum, r: any) => sum + Number(r.available_quantity ?? (Number(r.assigned_quantity ?? 0) - Number(r.used_quantity ?? 0))), 0);

    return {
      products_count: stock.length,
      total_assigned: totalAssigned,
      total_used: totalUsed,
      total_available: totalAvailable,
    };
  }
}
