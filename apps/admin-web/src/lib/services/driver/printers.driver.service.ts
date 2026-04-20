import type { SB } from '../_sb';
import { throwIfError } from '../_errors';

type Row =
  import('@/lib/types/supabase').Database['public']['Tables']['thermal_printers']['Row'];

type Insert =
  import('@/lib/types/supabase').Database['public']['Tables']['thermal_printers']['Insert'];

type Update =
  import('@/lib/types/supabase').Database['public']['Tables']['thermal_printers']['Update'];

export class PrintersDriverService {
  constructor(private sb: SB) {}

  async myPrinter(driverId: string) {
    if (!driverId) throw new Error('driverId requerido');

    const { data, error } = await this.sb
      .from('thermal_printers')
      .select('*')
      .eq('driver_id', driverId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    throwIfError(error);
    return (data ?? null) as Row | null;
  }

  /**
   * Guarda o actualiza la impresora del chofer (robusto, sin depender de UNIQUE)
   * - Usa "activo" boolean (tu columna real)
   * - NO usa printer_type ni status (no existen)
   */
  async saveMyPrinter(
    driverId: string,
    input: {
      printer_name: string;
      mac_address?: string | null;
      connection_type?: 'bluetooth' | 'usb' | 'wifi';
    }
  ) {
    if (!driverId) throw new Error('driverId requerido');

    const printer_name = (input.printer_name ?? '').trim();
    if (!printer_name) throw new Error('printer_name requerido');

    const existing = await this.myPrinter(driverId);

    const base: Insert = {
      driver_id: driverId,
      printer_name,
      mac_address: input.mac_address ?? null,
      connection_type: input.connection_type ?? 'bluetooth',
      activo: true,
      last_connection: new Date().toISOString(),
    };

    if (existing?.id) {
      const patch: Update = {
        printer_name: base.printer_name,
        mac_address: base.mac_address,
        connection_type: base.connection_type,
        activo: true,
        last_connection: base.last_connection,
      };

      const { data, error } = await this.sb
        .from('thermal_printers')
        .update(patch)
        .eq('id', existing.id)
        .select('*')
        .single();

      throwIfError(error);
      return data as Row;
    }

    const { data, error } = await this.sb
      .from('thermal_printers')
      .insert(base)
      .select('*')
      .single();

    throwIfError(error);
    return data as Row;
  }

  async setActivo(printerId: string, activo: boolean) {
    const patch: Update = { activo };

    const { data, error } = await this.sb
      .from('thermal_printers')
      .update(patch)
      .eq('id', printerId)
      .select('*')
      .single();

    throwIfError(error);
    return data as Row;
  }

  /**
   * Actualiza last_connection para saber que está viva la conexión
   */
  async touch(printerId: string) {
    const patch: Update = {
      last_connection: new Date().toISOString(),
    };

    const { data, error } = await this.sb
      .from('thermal_printers')
      .update(patch)
      .eq('id', printerId)
      .select('*')
      .single();

    throwIfError(error);
    return data as Row;
  }

  async delete(printerId: string) {
    const { error } = await this.sb
      .from('thermal_printers')
      .delete()
      .eq('id', printerId);

    throwIfError(error);
  }
}
