// lib/hooks/useAdminClients.ts
// ✅ Hook reusable para cargar Clientes + Comedores + Productos + Precios (customer_products)
// ✅ Úsalo en este page y en cualquier otro

import { useCallback, useMemo, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';
import {
  ClientsAdminService,
  type AdminCustomer,
  type AdminDiner,
  type AdminProduct,
  type AdminCustomerProduct,
} from '@/lib/services/admin/clients.admin.service';

function safeErr(e: unknown) {
  const anyE = e as any;
  return (
    (typeof anyE?.message === 'string' && anyE.message) ||
    (typeof anyE?.error_description === 'string' && anyE.error_description) ||
    'Ocurrió un error.'
  );
}

export type PricingState = Record<
  string,
  { selected: boolean; price_override: string; activo: boolean }
>;

export type CustomerWithPricing = AdminCustomer & {
  diner_nombre?: string | null;
  diner_activo?: boolean | null;
  pricing: PricingState;
  product_count?: number;
  total_value?: number;
};

export function useAdminClients() {
  const sb = supabaseBrowser as unknown as any;
  const api = useMemo(() => new ClientsAdminService(sb), [sb]);

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [diners, setDiners] = useState<AdminDiner[]>([]);
  const [customers, setCustomers] = useState<AdminCustomer[]>([]);
  const [customerProducts, setCustomerProducts] = useState<AdminCustomerProduct[]>([]);

  const buildPricingBase = useCallback((prods: AdminProduct[]): PricingState => {
    const m: PricingState = {};
    for (const p of prods) m[p.id] = { selected: false, price_override: '', activo: true };
    return m;
  }, []);

  const loadAll = useCallback(async () => {
    setError('');
    setLoading(true);
    try {
      const [p, d, c, cp] = await Promise.all([
        api.listProductsActive(),
        api.listDiners(),
        api.listCustomers(),
        api.listCustomerProducts(),
      ]);

      setProducts(p);
      setDiners(d);
      setCustomers(c);
      setCustomerProducts(cp);
    } catch (e) {
      setProducts([]);
      setDiners([]);
      setCustomers([]);
      setCustomerProducts([]);
      setError(safeErr(e));
    } finally {
      setLoading(false);
    }
  }, [api]);

  const customersWithPricing = useMemo((): CustomerWithPricing[] => {
    const dinersById = new Map<string, AdminDiner>();
    for (const d of diners) dinersById.set(d.id, d);

    const byCustomer = new Map<string, AdminCustomerProduct[]>();
    for (const r of customerProducts) {
      if (!byCustomer.has(r.customer_id)) byCustomer.set(r.customer_id, []);
      byCustomer.get(r.customer_id)!.push(r);
    }

    return customers.map((c): CustomerWithPricing => {
      const diner = c.diner_id ? dinersById.get(c.diner_id) : null;

      const pricing = buildPricingBase(products);
      const rows = byCustomer.get(c.id) ?? [];

      let total = 0;
      for (const r of rows) {
        if (!pricing[r.product_id]) continue;
        pricing[r.product_id] = {
          selected: true,
          price_override: r.precio_override === null ? '' : String(r.precio_override),
          activo: Boolean(r.activo),
        };
        if (typeof r.precio_override === 'number') total += r.precio_override;
      }

      return {
        ...c,
        diner_nombre: diner?.nombre ?? null,
        diner_activo: diner?.activo ?? null,
        pricing,
        product_count: rows.length,
        total_value: total,
      };
    });
  }, [customers, customerProducts, diners, products, buildPricingBase]);

  // actions
  const createDiner = useCallback(
    async (payload: { nombre: string; activo: boolean }) => {
      setBusy(true);
      setError('');
      try {
        await api.createDiner(payload);
        await loadAll();
      } catch (e) {
        setError(safeErr(e));
      } finally {
        setBusy(false);
      }
    },
    [api, loadAll]
  );

  const updateDiner = useCallback(
    async (id: string, payload: { nombre: string; activo: boolean }) => {
      setBusy(true);
      setError('');
      try {
        await api.updateDiner(id, payload);
        await loadAll();
      } catch (e) {
        setError(safeErr(e));
      } finally {
        setBusy(false);
      }
    },
    [api, loadAll]
  );

  const toggleDiner = useCallback(
    async (id: string, activo: boolean) => {
      setBusy(true);
      setError('');
      try {
        await api.toggleDiner(id, activo);
        await loadAll();
      } catch (e) {
        setError(safeErr(e));
      } finally {
        setBusy(false);
      }
    },
    [api, loadAll]
  );

  const deleteDiner = useCallback(
    async (id: string) => {
      setBusy(true);
      setError('');
      try {
        await api.deleteDiner(id);
        await loadAll();
      } catch (e) {
        setError(safeErr(e));
      } finally {
        setBusy(false);
      }
    },
    [api, loadAll]
  );

  const saveCustomer = useCallback(
    async (payload: Omit<AdminCustomer, 'id' | 'created_at'> & { id?: string } & { pricing: PricingState }) => {
      setBusy(true);
      setError('');
      try {
        let customerId = payload.id ?? null;

        if (customerId) {
          await api.updateCustomer(customerId, payload);
        } else {
          const created = await api.createCustomer(payload);
          customerId = created.id;
        }

        if (!customerId) throw new Error('No se pudo obtener el ID del cliente.');

        const items = Object.entries(payload.pricing).map(([product_id, st]) => {
          const raw = String(st.price_override ?? '').trim();
          const num = raw === '' ? null : Number(raw);
          return {
            product_id,
            selected: Boolean(st.selected),
            precio_override: Number.isFinite(num as any) ? (num as number) : null,
            activo: Boolean(st.activo),
          };
        });

        await api.setCustomerProducts(customerId, items);
        await loadAll();
      } catch (e) {
        setError(safeErr(e));
      } finally {
        setBusy(false);
      }
    },
    [api, loadAll]
  );

  const toggleCustomer = useCallback(
    async (id: string, activo: boolean) => {
      setBusy(true);
      setError('');
      try {
        await api.toggleCustomer(id, activo);
        await loadAll();
      } catch (e) {
        setError(safeErr(e));
      } finally {
        setBusy(false);
      }
    },
    [api, loadAll]
  );

  const deleteCustomer = useCallback(
    async (id: string) => {
      setBusy(true);
      setError('');
      try {
        await api.deleteCustomer(id);
        await loadAll();
      } catch (e) {
        setError(safeErr(e));
      } finally {
        setBusy(false);
      }
    },
    [api, loadAll]
  );

  return {
    // state
    loading,
    busy,
    error,

    // data
    products,
    diners,
    customers,
    customersWithPricing,

    // helpers
    buildPricingBase,

    // actions
    loadAll,
    createDiner,
    updateDiner,
    toggleDiner,
    deleteDiner,

    saveCustomer,
    toggleCustomer,
    deleteCustomer,
  };
}