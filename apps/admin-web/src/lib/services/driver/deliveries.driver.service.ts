import type { SB } from '../_sb';
import { throwIfError } from '../_errors';

type Delivery =
  import('@/lib/types/supabase').Database['public']['Tables']['deliveries']['Row'];

type DeliveryItem =
  import('@/lib/types/supabase').Database['public']['Tables']['delivery_items']['Row'];

type DeliveryItemUpdate =
  import('@/lib/types/supabase').Database['public']['Tables']['delivery_items']['Update'];

export class DeliveriesDriverService {
  constructor(private sb: SB) {}

  /**
   * Entregas activas del chofer
   */
  async listActive(driverId: string) {
    const { data, error } = await this.sb
      .from('deliveries')
      .select('*')
      .eq('driver_id', driverId)
      .in('status', ['assigned', 'in_progress'])
      .order('delivery_order', { ascending: true });

    throwIfError(error);
    return (data ?? []) as Delivery[];
  }

  /**
   * Items de una entrega
   */
  async items(deliveryId: string) {
    const { data, error } = await this.sb
      .from('delivery_items')
      .select('*')
      .eq('delivery_id', deliveryId);

    throwIfError(error);
    return (data ?? []) as DeliveryItem[];
  }

  /**
   * Confirmar entrega:
   * En tu schema real usamos:
   * - qty_real (en vez de delivered_qty)
   *
   * Si quieres manejar "extra/missing" después, se calcula en UI
   * pero se guarda solo qty_real.
   */
  async confirm(input: {
    delivery_id: string;
    items: Array<{ id: string; qty_real: number }>;
    driver_comments?: string | null;
    client_comments?: string | null;
  }) {
    // 1) actualizar items
    for (const it of input.items) {
      const patch: DeliveryItemUpdate = {
        qty_real: it.qty_real,
      };

      const { error } = await this.sb
        .from('delivery_items')
        .update(patch)
        .eq('id', it.id);

      throwIfError(error);
    }

    // 2) marcar entrega completada
    const { data, error } = await this.sb
      .from('deliveries')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        driver_comments: input.driver_comments ?? null,
        client_comments: input.client_comments ?? null,
      })
      .eq('id', input.delivery_id)
      .select('*')
      .single();

    throwIfError(error);
    return data as Delivery;
  }

  /**
   * Poner entrega en progreso (cuando el chofer inicia)
   */
  async start(deliveryId: string) {
    const { data, error } = await this.sb
      .from('deliveries')
      .update({
        status: 'in_progress',
        started_at: new Date().toISOString(),
      })
      .eq('id', deliveryId)
      .select('*')
      .single();

    throwIfError(error);
    return data as Delivery;
  }
}
