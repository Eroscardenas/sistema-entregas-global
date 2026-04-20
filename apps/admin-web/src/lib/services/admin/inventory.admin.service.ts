import type { SB } from '../_sb';
import { throwIfError } from '../_errors';

type Product =
  import('@/lib/types/supabase').Database['public']['Tables']['products']['Row'];

type StockMovement =
  import('@/lib/types/supabase').Database['public']['Tables']['stock_movements']['Row'];

type Shrinkage =
  import('@/lib/types/supabase').Database['public']['Tables']['shrinkage']['Row'];

type Return =
  import('@/lib/types/supabase').Database['public']['Tables']['returns']['Row'];

export class InventoryAdminService {
  constructor(private sb: SB) {}

  /**
   * Stock actual desde tabla products
   */
  async currentStock() {
    const { data, error } = await this.sb
      .from('products')
      .select('*')
      .order('name', { ascending: true });

    throwIfError(error);
    return (data ?? []) as Product[];
  }

  /**
   * Resumen de stock por chofer (tabla driver_stock)
   */
  async driverStockSummary() {
    const { data, error } = await this.sb
      .from('driver_stock')
      .select(`
        *,
        drivers:driver_id ( id, nombre, current_status ),
        products:product_id ( id, name, unit_price )
      `);

    throwIfError(error);
    return data ?? [];
  }

  /**
   * Movimientos de inventario
   */
  async stockMovements(limit = 200) {
    const { data, error } = await this.sb
      .from('stock_movements')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    throwIfError(error);
    return (data ?? []) as StockMovement[];
  }

  /**
   * Dashboard simple calculado desde tablas reales
   */
  async inventoryDashboard() {
    const { data: products, error: pErr } = await this.sb
      .from('products')
      .select('stock, min_stock');

    throwIfError(pErr);

    const { data: shrink, error: sErr } = await this.sb
      .from('shrinkage')
      .select('quantity');

    throwIfError(sErr);

    const { data: returns, error: rErr } = await this.sb
      .from('returns')
      .select('quantity');

    throwIfError(rErr);

    const lowStock = (products ?? []).filter(
      (p: any) => p.stock <= p.min_stock
    ).length;

    const totalShrinkage =
      (shrink ?? []).reduce((sum: number, s: any) => sum + Number(s.quantity || 0), 0);

    const totalReturns =
      (returns ?? []).reduce((sum: number, r: any) => sum + Number(r.quantity || 0), 0);

    return {
      total_products: products?.length ?? 0,
      low_stock_products: lowStock,
      total_shrinkage: totalShrinkage,
      total_returns: totalReturns,
    };
  }

  /**
   * Mermas
   */
  async shrinkageReports() {
    const { data, error } = await this.sb
      .from('shrinkage')
      .select('*')
      .order('created_at', { ascending: false });

    throwIfError(error);
    return (data ?? []) as Shrinkage[];
  }

  /**
   * Devoluciones
   */
  async returnsReports() {
    const { data, error } = await this.sb
      .from('returns')
      .select('*')
      .order('created_at', { ascending: false });

    throwIfError(error);
    return (data ?? []) as Return[];
  }
}
