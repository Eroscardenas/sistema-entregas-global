import type { SB } from '../_sb';
import { throwIfError } from '../_errors';

type RouteProgress =
  import('@/lib/types/supabase').Database['public']['Tables']['delivery_route_progress']['Row'];

type RouteProgressUpdate =
  import('@/lib/types/supabase').Database['public']['Tables']['delivery_route_progress']['Update'];

export class RouteDriverService {
  constructor(private sb: SB) {}

  /**
   * Iniciar ruta (RPC)
   * IMPORTANT: p_route_notes debe ser string | undefined (NO null)
   */
  async start(driverId: string, notes?: string | null) {
    if (!driverId) throw new Error('driverId requerido');

    const payload: { p_driver_id: string; p_route_notes?: string } = {
      p_driver_id: driverId,
    };

    const n = (notes ?? '').trim();
    if (n) payload.p_route_notes = n; // ✅ solo si hay texto

    const { data, error } = await this.sb.rpc('start_delivery_route', payload);

    throwIfError(error);
    // tu función retorna uuid/text, lo tratamos como string
    return data as string;
  }

  /**
   * Finalizar ruta
   */
  async finish(routeProgressId: string) {
    if (!routeProgressId) throw new Error('routeProgressId requerido');

    const patch: RouteProgressUpdate = {
      route_completed_at: new Date().toISOString(),
      // Si tu tabla tiene "status", esto funciona.
      // Si no la tiene, pégame el Row y lo quitamos.
      status: 'completed' as any,
    };

    const { data, error } = await this.sb
      .from('delivery_route_progress')
      .update(patch)
      .eq('id', routeProgressId)
      .select('*')
      .single();

    throwIfError(error);
    return data as RouteProgress;
  }

  /**
   * Obtener ruta del día (útil para reanudar si la app se cierra)
   */
  async today(driverId: string, dateISO: string) {
    const { data, error } = await this.sb
      .from('delivery_route_progress')
      .select('*')
      .eq('driver_id', driverId)
      .eq('route_date', dateISO)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    throwIfError(error);
    return (data ?? null) as RouteProgress | null;
  }
}
