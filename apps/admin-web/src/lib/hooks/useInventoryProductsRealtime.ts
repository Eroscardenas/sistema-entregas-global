'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  collection,
  limit as qLimit,
  onSnapshot,
  orderBy,
  query,
  type DocumentData,
  type FirestoreError,
  type QueryDocumentSnapshot,
  type QuerySnapshot,
  type Unsubscribe,
} from 'firebase/firestore';
import { inventoryDb } from '@/lib/firebase/inventory.client';
import { getDisplayName } from '@/lib/utils/inventory-product-label';

export type InventoryProductRealtime = {
  bolsaVaciaCodigo: string;
  tipoHielo: string;
  pesoKg: number;
  stockActual: number;
  displayName: string;
};

type Movimiento = {
  id: string;
  tipo?: string;
  subtipo?: string;
  bolsaVaciaCodigo?: string;
  productoCodigo?: string;
  productoNombre?: string;
  tipoHielo?: string;
  tipoHieloContenido?: string;
  tipoProducto?: string;
  cantidad?: number;
  deltaPrincipal?: number;
  principalAnterior?: number;
  principalNuevo?: number;
  stockHieloNuevo?: number;
  stockNuevo?: number;
  afectaStock?: boolean;
  fecha?: unknown;
  createdAt?: unknown;
  [k: string]: unknown;
};

function safeInt0(v: unknown, fallback = 0) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  const i = Math.floor(n);
  return i < 0 ? fallback : i;
}

function normalizeText(v: unknown) {
  return String(v ?? '').trim().toUpperCase();
}

function normalizeCode(v: unknown) {
  return String(v ?? '').trim().toUpperCase();
}

function buildDisplayName(tipoHielo: string, pesoKg: number) {
  const tipo = normalizeText(tipoHielo);
  if (tipo === 'BARRA') return 'BARRA';
  return getDisplayName(tipo, pesoKg);
}

function buildKey(bolsaVaciaCodigo: string, tipoHielo: string, pesoKg: number) {
  return `${normalizeCode(bolsaVaciaCodigo)}__${normalizeText(tipoHielo)}__${safeInt0(pesoKg, 0)}`;
}

function extractKgFromNombre(nombre: unknown): number | null {
  const s = String(nombre ?? '');
  const m = s.match(/(\d+)\s?kg/i);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

function getMovementFinalStock(m: Movimiento): number | null {
  const principalNuevo = Number((m as any)?.principalNuevo);
  if (Number.isFinite(principalNuevo)) return Math.max(0, Math.floor(principalNuevo));

  const stockHieloNuevo = Number((m as any)?.stockHieloNuevo);
  if (Number.isFinite(stockHieloNuevo)) return Math.max(0, Math.floor(stockHieloNuevo));

  const stockNuevo = Number((m as any)?.stockNuevo);
  if (Number.isFinite(stockNuevo)) return Math.max(0, Math.floor(stockNuevo));

  const deltaPrincipal = Number((m as any)?.deltaPrincipal);
  if (Number.isFinite(deltaPrincipal)) return Math.max(0, Math.floor(deltaPrincipal));

  const cantidad = Number((m as any)?.cantidad);
  if (Number.isFinite(cantidad)) return Math.max(0, Math.floor(cantidad));

  return null;
}

export function useInventoryProductsRealtime() {
  const [baseRows, setBaseRows] = useState<InventoryProductRealtime[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);

  const [movimientos, setMovimientos] = useState<Movimiento[]>([]);
  const [loadingMovs, setLoadingMovs] = useState(true);

  useEffect(() => {
    const ref = collection(inventoryDb, 'productos');

    const unsubscribe = onSnapshot(
      ref,
      (snapshot) => {
        const map = new Map<string, InventoryProductRealtime>();

        snapshot.docs.forEach((doc) => {
          const data = doc.data() as any;

          const bolsaVaciaCodigo = normalizeCode(data.codigo);
          const pesoKg = safeInt0(data.pesoKg, 0);
          const stockPorHielo = data.stockPorHielo ?? {};

          if (!bolsaVaciaCodigo) return;
          if (!pesoKg || pesoKg <= 0) return;
          if (!stockPorHielo || typeof stockPorHielo !== 'object') return;

          Object.entries(stockPorHielo).forEach(([tipoHielo, stockData]: any) => {
            const tipo = normalizeText(tipoHielo);
            const stockActual = safeInt0(stockData?.stockActual, 0);

            if (!tipo) return;

            const key = buildKey(bolsaVaciaCodigo, tipo, pesoKg);

            map.set(key, {
              bolsaVaciaCodigo,
              tipoHielo: tipo,
              pesoKg,
              stockActual,
              displayName: buildDisplayName(tipo, pesoKg),
            });
          });
        });

        setBaseRows(Array.from(map.values()));
        setLoadingProducts(false);
      },
      (error) => {
        console.error('Error leyendo bolsa llena en tiempo real:', error);
        setBaseRows([]);
        setLoadingProducts(false);
      },
    );

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const MOVS = 'movimientos';

    let unsub: Unsubscribe | null = null;
    let cancelled = false;

    const toRow = (d: QueryDocumentSnapshot<DocumentData>): Movimiento =>
      ({ id: d.id, ...(d.data() as Record<string, unknown>) } as Movimiento);

    const subscribe = (field: 'fecha' | 'createdAt') => {
      setLoadingMovs(true);

      const qy = query(collection(inventoryDb, MOVS), orderBy(field, 'desc'), qLimit(1500));

      unsub = onSnapshot(
        qy,
        (snap: QuerySnapshot<DocumentData>) => {
          if (cancelled) return;
          setMovimientos(snap.docs.map((d) => toRow(d)));
          setLoadingMovs(false);
        },
        (err: FirestoreError) => {
          if (cancelled) return;

          if (field === 'fecha') {
            try {
              if (unsub) unsub();
            } catch {}
            subscribe('createdAt');
            return;
          }

          console.error('Error leyendo movimientos realtime:', err);
          setMovimientos([]);
          setLoadingMovs(false);
        },
      );
    };

    subscribe('fecha');

    return () => {
      cancelled = true;
      try {
        if (unsub) unsub();
      } catch {}
    };
  }, []);

  const pesoByBV = useMemo(() => {
    const map = new Map<string, number>();

    for (const row of baseRows ?? []) {
      if (!map.has(row.bolsaVaciaCodigo)) {
        map.set(row.bolsaVaciaCodigo, safeInt0(row.pesoKg, 0));
      }
    }

    return map;
  }, [baseRows]);

  const barraFallbackRows = useMemo(() => {
    const out = new Map<string, InventoryProductRealtime>();

    for (const m of movimientos ?? []) {
      const tipo = normalizeText((m as any)?.tipo);
      const tipoProducto = normalizeText((m as any)?.tipoProducto);
      const tipoHielo = normalizeText((m as any)?.tipoHielo ?? (m as any)?.tipoHieloContenido);

      if (tipoProducto && tipoProducto !== 'BOLSA') continue;
      if (tipoHielo !== 'BARRA') continue;
      if (tipo !== 'LLENADO_BOLSA') continue;

      let bvCodigo = normalizeCode((m as any)?.bolsaVaciaCodigo);

      if (!/^BV/.test(bvCodigo)) {
        const pc = normalizeCode((m as any)?.productoCodigo);

        if (/^BV/.test(pc)) {
          bvCodigo = pc;
        }
      }

      if (!/^BV/.test(bvCodigo)) continue;

      let pesoKg = safeInt0(pesoByBV.get(bvCodigo), 0);

      if (!pesoKg) {
        const kgFromNombre = extractKgFromNombre((m as any)?.productoNombre);
        pesoKg = safeInt0(kgFromNombre, 0);
      }

      if (!pesoKg || pesoKg <= 0) continue;

      const key = buildKey(bvCodigo, 'BARRA', pesoKg);

      const stockActual = getMovementFinalStock(m);
      if (stockActual === null) continue;

      if (!out.has(key)) {
        out.set(key, {
          bolsaVaciaCodigo: bvCodigo,
          tipoHielo: 'BARRA',
          pesoKg,
          stockActual: safeInt0(stockActual, 0),
          displayName: 'BARRA',
        });
      }
    }

    return out;
  }, [movimientos, pesoByBV]);

  const products = useMemo(() => {
    const map = new Map<string, InventoryProductRealtime>();

    for (const row of baseRows ?? []) {
      const key = buildKey(row.bolsaVaciaCodigo, row.tipoHielo, row.pesoKg);

      map.set(key, {
        ...row,
        tipoHielo: normalizeText(row.tipoHielo),
        bolsaVaciaCodigo: normalizeCode(row.bolsaVaciaCodigo),
        stockActual: safeInt0(row.stockActual, 0),
        displayName: buildDisplayName(row.tipoHielo, row.pesoKg),
      });
    }

    for (const [key, row] of barraFallbackRows.entries()) {
      if (!map.has(key)) {
        map.set(key, {
          ...row,
          tipoHielo: normalizeText(row.tipoHielo),
          bolsaVaciaCodigo: normalizeCode(row.bolsaVaciaCodigo),
          stockActual: safeInt0(row.stockActual, 0),
          displayName: buildDisplayName(row.tipoHielo, row.pesoKg),
        });
      }
    }

    return Array.from(map.values())
      .map((x) => ({
        ...x,
        stockActual: safeInt0(x.stockActual, 0),
      }))
      .sort((a, b) => {
        const aBarra = normalizeText(a.tipoHielo) === 'BARRA' ? 0 : 1;
        const bBarra = normalizeText(b.tipoHielo) === 'BARRA' ? 0 : 1;

        if (aBarra !== bBarra) return aBarra - bBarra;

        const byTipo = normalizeText(a.tipoHielo).localeCompare(
          normalizeText(b.tipoHielo),
          'es-MX',
        );

        if (byTipo !== 0) return byTipo;

        const byPeso = a.pesoKg - b.pesoKg;
        if (byPeso !== 0) return byPeso;

        return a.displayName.localeCompare(b.displayName, 'es-MX');
      });
  }, [baseRows, barraFallbackRows]);

  return {
    products,
    loading: loadingProducts || loadingMovs,
  };
}