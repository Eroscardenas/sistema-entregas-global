import type { SB } from '../_sb';
import { throwIfError } from '../_errors';

type Row =
  import('@/lib/types/supabase').Database['public']['Tables']['products']['Row'];

type Insert =
  import('@/lib/types/supabase').Database['public']['Tables']['products']['Insert'];

type Update =
  import('@/lib/types/supabase').Database['public']['Tables']['products']['Update'];

/**
 * products (schema real)
 * - nombre: string
 * - kind: string            // ej: 'BOLSA' | 'BARRA'
 * - ice_type: string        // ej: 'GOURMET' | 'NORMAL' | etc
 * - kg_por_unidad: number   // ej: 5, 10, 20
 * - precio_base: number
 * - activo: boolean
 */
export class ProductsAdminService {
  constructor(private sb: SB) {}

  async list(params?: { activoOnly?: boolean; kind?: string; ice_type?: string }) {
    let q = this.sb.from('products').select('*').order('nombre', { ascending: true });

    if (params?.activoOnly) q = q.eq('activo', true);
    if (params?.kind) q = q.eq('kind', params.kind);
    if (params?.ice_type) q = q.eq('ice_type', params.ice_type);

    const { data, error } = await q;
    throwIfError(error);
    return (data ?? []) as Row[];
  }

  async create(input: {
    nombre: string;
    kind: string;
    ice_type: string;
    kg_por_unidad: number;
    precio_base?: number;
    activo?: boolean;
  }) {
    const payload: Insert = {
      nombre: input.nombre,
      kind: input.kind,
      ice_type: input.ice_type,
      kg_por_unidad: input.kg_por_unidad,
      precio_base: input.precio_base ?? 0,
      activo: input.activo ?? true,
    };

    const { data, error } = await this.sb
      .from('products')
      .insert(payload)
      .select('*')
      .single();

    throwIfError(error);
    return data as Row;
  }

  async update(id: string, patch: Update) {
    const { data, error } = await this.sb
      .from('products')
      .update(patch)
      .eq('id', id)
      .select('*')
      .single();

    throwIfError(error);
    return data as Row;
  }

  async setActivo(id: string, activo: boolean) {
    return this.update(id, { activo });
  }

  async delete(id: string) {
    // recomendado: soft delete con setActivo(false)
    const { error } = await this.sb.from('products').delete().eq('id', id);
    throwIfError(error);
  }
}
