// lib/services/admin/clients.admin.service.ts
// ✅ Admin Service (Supabase) — Clientes + Comedores + Precios por cliente
// ✅ Compatible con tu SQL real: diners.nombre, customers.nombre, products.activo, products.stock_actual, customer_products
// ✅ Listar / crear / editar / activar / eliminar + asignaciones de productos por cliente

export type AdminProduct = {
  id: string;
  nombre: string;
  precio_base: number;
  stock_actual: number;
  active: boolean; // compat temporal para UI vieja
  created_at?: string | null;
};

export type AdminDiner = {
  id: string;
  nombre: string;
  activo: boolean;
  cantidad_clientes: number;
  created_at?: string | null;
};

export type AdminCustomer = {
  id: string;
  diner_id: string | null;

  nombre: string;
  telefono: string | null;
  maps_url: string | null;

  capacidad_equipo: '20' | '40' | '50' | '60' | '100' | '150' | 'N/A';
  activo: boolean;

  created_at?: string | null;
};

export type AdminCustomerProduct = {
  id: string;
  customer_id: string;
  product_id: string;
  precio_override: number | null;
  activo: boolean;
};

function toStr(v: any) {
  return v === null || v === undefined ? '' : String(v);
}

function toNum(v: any, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function safeBool(v: any, fallback = true) {
  return typeof v === 'boolean' ? v : fallback;
}

export class ClientsAdminService {
  constructor(private sb: any) {}

  // ---------------------------
  // READ
  // ---------------------------

  async listProductsActive(): Promise<AdminProduct[]> {
    const { data, error } = await this.sb
      .from('products')
      .select('id,nombre,precio_base,stock_actual,activo,created_at')
      .eq('activo', true)
      .order('nombre', { ascending: true });

    if (error) throw error;

    return (data ?? []).map((r: any) => ({
      id: String(r.id),
      nombre: toStr(r.nombre),
      precio_base: toNum(r.precio_base, 0),
      stock_actual: toNum(r.stock_actual, 0),
      active: safeBool(r.activo, true),
      created_at: r.created_at ?? null,
    }));
  }

  async listDiners(): Promise<AdminDiner[]> {
    const { data, error } = await this.sb
      .from('diners')
      .select('id,nombre,activo,cantidad_clientes,created_at')
      .order('nombre', { ascending: true });

    if (error) throw error;

    return (data ?? []).map((r: any) => ({
      id: String(r.id),
      nombre: toStr(r.nombre),
      activo: safeBool(r.activo, true),
      cantidad_clientes: toNum(r.cantidad_clientes, 0),
      created_at: r.created_at ?? null,
    }));
  }

  async listCustomers(): Promise<AdminCustomer[]> {
    const { data, error } = await this.sb
      .from('customers')
      .select('id,diner_id,nombre,telefono,maps_url,capacidad_equipo,activo,created_at')
      .order('created_at', { ascending: false });

    if (error) throw error;

    return (data ?? []).map((r: any) => ({
      id: String(r.id),
      diner_id: r.diner_id ? String(r.diner_id) : null,
      nombre: toStr(r.nombre),
      telefono: r.telefono ?? null,
      maps_url: r.maps_url ?? null,
      capacidad_equipo: (r.capacidad_equipo ?? 'N/A') as any,
      activo: safeBool(r.activo, true),
      created_at: r.created_at ?? null,
    }));
  }

  async listCustomerProducts(): Promise<AdminCustomerProduct[]> {
    const { data, error } = await this.sb
      .from('customer_products')
      .select('id,customer_id,product_id,precio_override,activo');

    if (error) throw error;

    return (data ?? []).map((r: any) => ({
      id: String(r.id),
      customer_id: String(r.customer_id),
      product_id: String(r.product_id),
      precio_override:
        r.precio_override === null || r.precio_override === undefined
          ? null
          : toNum(r.precio_override, 0),
      activo: safeBool(r.activo, true),
    }));
  }

  // ---------------------------
  // DINERS CRUD
  // ---------------------------

  async createDiner(payload: { nombre: string; activo: boolean }) {
    const { error } = await this.sb.from('diners').insert({
      nombre: String(payload.nombre).trim(),
      activo: Boolean(payload.activo),
    });
    if (error) throw error;
  }

  async updateDiner(id: string, payload: { nombre: string; activo: boolean }) {
    const { error } = await this.sb
      .from('diners')
      .update({
        nombre: String(payload.nombre).trim(),
        activo: Boolean(payload.activo),
      })
      .eq('id', id);

    if (error) throw error;
  }

  async toggleDiner(id: string, activo: boolean) {
    const { error } = await this.sb
      .from('diners')
      .update({ activo: Boolean(activo) })
      .eq('id', id);

    if (error) throw error;
  }

  async deleteDiner(id: string) {
    const { error } = await this.sb.from('diners').delete().eq('id', id);
    if (error) throw error;
  }

  // ---------------------------
  // CUSTOMERS CRUD
  // ---------------------------

  async createCustomer(payload: {
    nombre: string;
    diner_id: string | null;
    telefono: string | null;
    maps_url: string | null;
    capacidad_equipo: AdminCustomer['capacidad_equipo'];
    activo: boolean;
  }): Promise<{ id: string }> {
    const { data, error } = await this.sb
      .from('customers')
      .insert({
        nombre: String(payload.nombre).trim(),
        diner_id: payload.diner_id ?? null,
        telefono: payload.telefono ? String(payload.telefono).trim() : null,
        maps_url: payload.maps_url ? String(payload.maps_url).trim() : null,
        capacidad_equipo: payload.capacidad_equipo ?? 'N/A',
        activo: Boolean(payload.activo),
      })
      .select('id')
      .maybeSingle();

    if (error) throw error;
    return { id: String(data?.id) };
  }

  async updateCustomer(
    id: string,
    payload: {
      nombre: string;
      diner_id: string | null;
      telefono: string | null;
      maps_url: string | null;
      capacidad_equipo: AdminCustomer['capacidad_equipo'];
      activo: boolean;
    }
  ) {
    const { error } = await this.sb
      .from('customers')
      .update({
        nombre: String(payload.nombre).trim(),
        diner_id: payload.diner_id ?? null,
        telefono: payload.telefono ? String(payload.telefono).trim() : null,
        maps_url: payload.maps_url ? String(payload.maps_url).trim() : null,
        capacidad_equipo: payload.capacidad_equipo ?? 'N/A',
        activo: Boolean(payload.activo),
      })
      .eq('id', id);

    if (error) throw error;
  }

  async toggleCustomer(id: string, activo: boolean) {
    const { error } = await this.sb
      .from('customers')
      .update({ activo: Boolean(activo) })
      .eq('id', id);

    if (error) throw error;
  }

  async deleteCustomer(id: string) {
    const { error } = await this.sb.from('customers').delete().eq('id', id);
    if (error) throw error;
  }

  // ---------------------------
  // CUSTOMER_PRODUCTS (precios por cliente)
  // ---------------------------

  async setCustomerProducts(
    customerId: string,
    items: Array<{
      product_id: string;
      selected: boolean;
      precio_override: number | null;
      activo: boolean;
    }>
  ) {
    const selected = items.filter((x) => x.selected);

    if (selected.length === 0) {
      const { error } = await this.sb
        .from('customer_products')
        .delete()
        .eq('customer_id', customerId);

      if (error) throw error;
      return;
    }

    const keepIds = selected.map((x) => x.product_id);
    const notInSql = `(${keepIds.map((x) => `'${x}'`).join(',')})`;

    const { error: delErr } = await this.sb
      .from('customer_products')
      .delete()
      .eq('customer_id', customerId)
      .not('product_id', 'in', notInSql);

    if (delErr) throw delErr;

    const upserts = selected.map((x) => ({
      customer_id: customerId,
      product_id: x.product_id,
      precio_override: x.precio_override,
      activo: Boolean(x.activo),
    }));

    const { error: upErr } = await this.sb
      .from('customer_products')
      .upsert(upserts, { onConflict: 'customer_id,product_id' });

    if (upErr) throw upErr;
  }
}