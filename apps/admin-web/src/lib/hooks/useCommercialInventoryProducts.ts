'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';
import {
  useInventoryProductsRealtime,
  type InventoryProductRealtime,
} from '@/lib/hooks/useInventoryProductsRealtime';

export type CommercialInventoryProduct = {
  bolsaVaciaCodigo: string;
  tipoHielo: string;
  pesoKg: number;
  stockActual: number;
  displayName: string;

  settingId: string | null;
  nombreComercial: string | null;
  precioBase: number | null;
  activoComercial: boolean;
  configured: boolean;
};

type InventoryProductSettingRow = {
  id: string;
  firebase_bolsa_vacia_codigo: string | null;
  firebase_tipo_hielo: string | null;
  peso_kg: number | null;
  nombre_comercial: string | null;
  precio_base: number | null;
  activo: boolean | null;
};

function normalizeText(v: unknown) {
  return String(v ?? '').trim().toUpperCase();
}

function normalizeCode(v: unknown) {
  return String(v ?? '').trim().toUpperCase();
}

function safeNum(v: unknown, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function buildKey(
  bolsaVaciaCodigo: string,
  tipoHielo: string,
  pesoKg: number
) {
  return `${normalizeCode(
    bolsaVaciaCodigo
  )}__${normalizeText(tipoHielo)}__${safeNum(pesoKg)}`;
}

export function useCommercialInventoryProduct() {
  const sb = supabaseBrowser as any;

  const {
    products: inventoryProducts,
    loading: inventoryLoading,
  } = useInventoryProductsRealtime();

  const [settingsMap, setSettingsMap] = useState<
    Map<string, InventoryProductSettingRow>
  >(new Map());

  const [loadingSettings, setLoadingSettings] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function loadSettings() {
      try {
        setLoadingSettings(true);
        setError('');

        const { data, error } = await sb
          .from('inventory_product_settings')
          .select(
            `
            id,
            firebase_bolsa_vacia_codigo,
            firebase_tipo_hielo,
            peso_kg,
            nombre_comercial,
            precio_base,
            activo
            `
          );

        if (error) {
          throw error;
        }

        const next = new Map<
          string,
          InventoryProductSettingRow
        >();

        for (const row of (
          data ?? []
        ) as InventoryProductSettingRow[]) {
          const key = buildKey(
            row.firebase_bolsa_vacia_codigo ?? '',
            row.firebase_tipo_hielo ?? '',
            row.peso_kg ?? 0
          );

          next.set(key, row);
        }

        if (!cancelled) {
          setSettingsMap(next);
        }
      } catch (e: any) {
        if (!cancelled) {
          console.error(
            'Error cargando inventory_product_settings:',
            e
          );

          setSettingsMap(new Map());

          setError(
            e?.message ??
              'No se pudo cargar la configuración comercial'
          );
        }
      } finally {
        if (!cancelled) {
          setLoadingSettings(false);
        }
      }
    }

    loadSettings();

    return () => {
      cancelled = true;
    };
  }, [sb]);

  const products = useMemo<
    CommercialInventoryProduct[]
  >(() => {
    return (inventoryProducts ?? [])
      .map((row: InventoryProductRealtime) => {
        const key = buildKey(
          row.bolsaVaciaCodigo,
          row.tipoHielo,
          row.pesoKg
        );

        const setting = settingsMap.get(key);

        return {
          ...row,

          settingId:
            setting?.id ?? null,

          nombreComercial:
            setting?.nombre_comercial ?? null,

          precioBase:
            setting?.precio_base != null
              ? safeNum(setting.precio_base, 0)
              : null,

          activoComercial:
            Boolean(setting?.activo ?? false),

          configured:
            Boolean(setting?.id),
        };
      })

      /*
       * No mostrar combinaciones que Firebase conserva
       * con stock 0 y que nunca fueron configuradas.
       *
       * Sí conservar:
       * - productos con stock real > 0
       * - productos ya configurados comercialmente
       *   aunque actualmente estén en 0
       *
       * La distinción de MAQUILA se seguirá haciendo
       * mediante el BV correspondiente. No se elimina
       * ni se agrupa aquí por tipo + peso.
       */
      .filter((row) => {
        const stockActual = Math.max(
          0,
          safeNum(row.stockActual, 0)
        );

        return (
          stockActual > 0 ||
          row.configured
        );
      })

      .map((row) => ({
        ...row,
        stockActual: Math.max(
          0,
          Math.trunc(
            safeNum(row.stockActual, 0)
          )
        ),
      }))

      .sort((a, b) => {
        const aTipo =
          normalizeText(a.tipoHielo);

        const bTipo =
          normalizeText(b.tipoHielo);

        const aBarra =
          aTipo === 'BARRA' ? 0 : 1;

        const bBarra =
          bTipo === 'BARRA' ? 0 : 1;

        if (aBarra !== bBarra) {
          return aBarra - bBarra;
        }

        const byTipo =
          aTipo.localeCompare(
            bTipo,
            'es-MX'
          );

        if (byTipo !== 0) {
          return byTipo;
        }

        const byPeso =
          safeNum(a.pesoKg, 0) -
          safeNum(b.pesoKg, 0);

        if (byPeso !== 0) {
          return byPeso;
        }

        const byNombre =
          normalizeText(
            a.nombreComercial ??
              a.displayName
          ).localeCompare(
            normalizeText(
              b.nombreComercial ??
                b.displayName
            ),
            'es-MX'
          );

        if (byNombre !== 0) {
          return byNombre;
        }

        return normalizeCode(
          a.bolsaVaciaCodigo
        ).localeCompare(
          normalizeCode(
            b.bolsaVaciaCodigo
          ),
          'es-MX'
        );
      });
  }, [inventoryProducts, settingsMap]);

  return {
    products,
    loading:
      inventoryLoading ||
      loadingSettings,
    error,
  };
}