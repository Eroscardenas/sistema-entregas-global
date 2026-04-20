import type { SB } from '../_sb';
import { throwIfError } from '../_errors';

type Row =
  import('@/lib/types/supabase').Database['public']['Tables']['client_requests']['Row'];

type Insert =
  import('@/lib/types/supabase').Database['public']['Tables']['client_requests']['Insert'];

type Update =
  import('@/lib/types/supabase').Database['public']['Tables']['client_requests']['Update'];

export class ClientRequestsService {
  constructor(private sb: SB) {}

  /**
   * Crear solicitud de nuevo cliente
   */
  async create(input: {
    name: string;
    phone: string;
    address: string; // puede ser link de Google Maps
    company_name?: string | null;
    email?: string | null;

    requires_invoice?: boolean;
    tax_name?: string | null;
    tax_address?: string | null;
    tax_rfc?: string | null;
    tax_email?: string | null;
    tax_phone?: string | null;

    notes?: string | null;
  }) {
    if (!input.name?.trim()) {
      throw new Error('El nombre es obligatorio');
    }

    if (!input.phone?.trim()) {
      throw new Error('El teléfono es obligatorio');
    }

    if (!input.address?.trim()) {
      throw new Error('La dirección es obligatoria');
    }

    const payload: Insert = {
      name: input.name.trim(),
      phone: input.phone.trim(),
      address: input.address.trim(),
      company_name: input.company_name ?? null,
      email: input.email ?? null,

      requires_invoice: input.requires_invoice ?? false,
      tax_name: input.tax_name ?? null,
      tax_address: input.tax_address ?? null,
      tax_rfc: input.tax_rfc ?? null,
      tax_email: input.tax_email ?? null,
      tax_phone: input.tax_phone ?? null,

      notes: input.notes ?? null,
      status: 'pending',
    };

    const { data, error } = await this.sb
      .from('client_requests')
      .insert(payload)
      .select('*')
      .single();

    throwIfError(error);
    return data as Row;
  }

  /**
   * Obtener solicitud por ID
   */
  async getById(id: string) {
    const { data, error } = await this.sb
      .from('client_requests')
      .select('*')
      .eq('id', id)
      .single();

    throwIfError(error);
    return data as Row;
  }

  /**
   * Consultar solicitudes por teléfono
   * (por si luego quieres que el cliente vea el estado)
   */
  async getByPhone(phone: string) {
    const { data, error } = await this.sb
      .from('client_requests')
      .select('*')
      .eq('phone', phone.trim())
      .order('created_at', { ascending: false });

    throwIfError(error);
    return (data ?? []) as Row[];
  }

  /**
   * Cancelar solicitud (si el cliente quiere retractarse)
   */
  async cancel(id: string) {
    const payload: Update = {
      status: 'rejected',
      processed_at: new Date().toISOString(),
    };

    const { data, error } = await this.sb
      .from('client_requests')
      .update(payload)
      .eq('id', id)
      .select('*')
      .single();

    throwIfError(error);
    return data as Row;
  }
}
