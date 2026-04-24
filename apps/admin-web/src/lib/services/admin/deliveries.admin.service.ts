import type { SB } from '../_sb';
import { throwIfError } from '../_errors';
import { isoDate } from '../_helpers';

type Delivery =
  import('@/lib/types/supabase').Database['public']['Tables']['deliveries']['Row'];

type DeliveryItem =
  import('@/lib/types/supabase').Database['public']['Tables']['delivery_items']['Row'];

export class DeliveriesAdminService {
  constructor(private sb: SB) {}

  /**
   * Lista entregas por fecha (basado en created_at)
   */
  async listByDate(date = isoDate()) {
    const { data, error } = await this.sb
      .from('deliveries')
      .select(`
        *,
        drivers:driver_id (
          id,
          first_name,
          last_name,
          verification_code,
          current_status
        )
      `)
      .gte('created_at', `${date}T00:00:00`)
      .lte('created_at', `${date}T23:59:59`)
      .order('created_at', { ascending: false });

    throwIfError(error);
    return data ?? [];
  }

  /**
   * Obtener una entrega con todos sus items
   */
  async getDetail(deliveryId: string) {
    const { data, error } = await this.sb
      .from('v_delivery_detail')
      .select('*')
      .eq('delivery_id', deliveryId)
      .single();

    throwIfError(error);
    return data;
  }

  /**
   * Obtener items crudos
   */
  async getItems(deliveryId: string) {
    const { data, error } = await this.sb
      .from('delivery_items')
      .select('*')
      .eq('delivery_id', deliveryId);

    throwIfError(error);
    return (data ?? []) as DeliveryItem[];
  }

  /**
   * Cancelar entrega (admin)
   */
  async cancel(deliveryId: string, reason?: string | null) {
    const now = new Date().toISOString();

    const { data, error } = await this.sb
      .from('deliveries')
      .update({
        status: 'cancelled',
        delivery_notes: reason ?? 'Cancelada por admin',
        updated_at: now,
      } as any)
      .eq('id', deliveryId)
      .select('*')
      .single();

    throwIfError(error);
    return data as Delivery;
  }

  /**
   * Reporte simple usando v_delivery_detail (filtrado por fecha)
   */
  async reportByDate(date = isoDate()) {
    const { data, error } = await this.sb
      .from('v_delivery_detail')
      .select('*')
      .gte('assigned_at', `${date}T00:00:00`)
      .lte('assigned_at', `${date}T23:59:59`);

    throwIfError(error);
    return data ?? [];
  }

  /**
   * Cambiar status manualmente (admin override)
   */
  async setStatus(deliveryId: string, status: Delivery['status']) {
    const now = new Date().toISOString();

    const { data, error } = await this.sb
      .from('deliveries')
      .update({
        status,
        updated_at: now,
      } as any)
      .eq('id', deliveryId)
      .select('*')
      .single();

    throwIfError(error);
    return data as Delivery;
  }

  /**
   * Recalcular totales manual (si necesitas forzar)
   * Tu trigger ya lo hace automático al actualizar delivery_items.
   */
  async recalc(deliveryId: string) {
    const { data, error } = await this.sb
      .from('deliveries')
      .select('*')
      .eq('id', deliveryId)
      .single();

    throwIfError(error);
    return data as Delivery;
  }
}