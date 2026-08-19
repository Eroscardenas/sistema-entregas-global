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
  bolsaVaciaNombre: string;
  tipoHielo: string;
  pesoKg: number;
  stockActual: number;
  displayName: string;
  esMaquila: boolean;
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

  [key: string]: unknown;
};

type FirebaseProductData = {
  codigo?: unknown;
  nombre?: unknown;
  pesoKg?: unknown;
  stockPorHielo?: unknown;

  [key: string]: unknown;
};

function safeInt0(v: unknown, fallback = 0) {
  const n = Number(v);

  if (!Number.isFinite(n)) {
    return fallback;
  }

  const i = Math.floor(n);

  return i < 0 ? fallback : i;
}

function normalizeText(v: unknown) {
  return String(v ?? '')
    .trim()
    .toUpperCase();
}

function normalizeCode(v: unknown) {
  return String(v ?? '')
    .trim()
    .toUpperCase();
}

function isRecord(
  value: unknown
): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value)
  );
}

/**
 * Una bolsa se considera MAQUILA cuando el nombre
 * registrado en Firebase contiene la palabra "MAQUILA".
 *
 * Ejemplo:
 * "Bolsa vacía 5kg rolito para maquila"
 */
function isMaquilaProduct(nombre: unknown) {
  return normalizeText(nombre).includes('MAQUILA');
}

function buildDisplayName(
  tipoHielo: string,
  pesoKg: number,
  esMaquila = false
) {
  const tipo = normalizeText(tipoHielo);

  if (tipo === 'BARRA') {
    return 'BARRA';
  }

  const baseName = getDisplayName(
    tipo,
    pesoKg
  );

  if (!esMaquila) {
    return baseName;
  }

  /*
   * Evitamos duplicar la palabra si por algún motivo
   * getDisplayName ya la incluyera en el futuro.
   */
  if (
    normalizeText(baseName).includes(
      'MAQUILA'
    )
  ) {
    return baseName;
  }

  return `${baseName} MAQUILA`;
}

/**
 * La identidad REAL se mantiene por:
 *
 * BV + tipo de hielo + peso.
 *
 * Es importante NO quitar el BV porque:
 *
 * ROLITO 5 KG normal
 * y
 * ROLITO 5 KG MAQUILA
 *
 * pueden compartir tipo y peso, pero usan
 * bolsas/inventarios diferentes.
 */
function buildKey(
  bolsaVaciaCodigo: string,
  tipoHielo: string,
  pesoKg: number
) {
  return `${normalizeCode(
    bolsaVaciaCodigo
  )}__${normalizeText(
    tipoHielo
  )}__${safeInt0(pesoKg, 0)}`;
}

function extractKgFromNombre(
  nombre: unknown
): number | null {
  const value = String(nombre ?? '');

  const match = value.match(
    /(\d+(?:[.,]\d+)?)\s*kg/i
  );

  if (!match) {
    return null;
  }

  const n = Number(
    match[1].replace(',', '.')
  );

  return Number.isFinite(n)
    ? n
    : null;
}

/**
 * Obtiene stock FINAL únicamente cuando el movimiento
 * realmente trae información suficiente para calcularlo.
 *
 * Ya no usamos `deltaPrincipal` o `cantidad` directamente
 * como si fueran stock final, porque eso puede generar
 * productos/barra con stocks falsos.
 */
function getMovementFinalStock(
  movimiento: Movimiento
): number | null {
  const principalNuevo = Number(
    movimiento.principalNuevo
  );

  if (
    Number.isFinite(principalNuevo)
  ) {
    return Math.max(
      0,
      Math.floor(principalNuevo)
    );
  }

  const stockHieloNuevo = Number(
    movimiento.stockHieloNuevo
  );

  if (
    Number.isFinite(stockHieloNuevo)
  ) {
    return Math.max(
      0,
      Math.floor(stockHieloNuevo)
    );
  }

  const stockNuevo = Number(
    movimiento.stockNuevo
  );

  if (
    Number.isFinite(stockNuevo)
  ) {
    return Math.max(
      0,
      Math.floor(stockNuevo)
    );
  }

  /*
   * Si tenemos anterior + delta,
   * entonces sí podemos calcular
   * correctamente el resultado.
   */
  const principalAnterior = Number(
    movimiento.principalAnterior
  );

  const deltaPrincipal = Number(
    movimiento.deltaPrincipal
  );

  if (
    Number.isFinite(
      principalAnterior
    ) &&
    Number.isFinite(
      deltaPrincipal
    )
  ) {
    return Math.max(
      0,
      Math.floor(
        principalAnterior +
          deltaPrincipal
      )
    );
  }

  return null;
}

export function useInventoryProductsRealtime() {
  const [
    baseRows,
    setBaseRows,
  ] = useState<
    InventoryProductRealtime[]
  >([]);

  const [
    loadingProducts,
    setLoadingProducts,
  ] = useState(true);

  const [
    movimientos,
    setMovimientos,
  ] = useState<Movimiento[]>([]);

  const [
    loadingMovs,
    setLoadingMovs,
  ] = useState(true);

  /*
   * ========================================
   * PRODUCTOS FIREBASE EN TIEMPO REAL
   * ========================================
   */
  useEffect(() => {
    const ref = collection(
      inventoryDb,
      'productos'
    );

    const unsubscribe = onSnapshot(
      ref,

      (snapshot) => {
        const map = new Map<
          string,
          InventoryProductRealtime
        >();

        snapshot.docs.forEach(
          (doc) => {
            const data =
              doc.data() as FirebaseProductData;

            const bolsaVaciaCodigo =
              normalizeCode(
                data.codigo
              );

            const bolsaVaciaNombre =
              String(
                data.nombre ?? ''
              ).trim();

            const pesoKg =
              safeInt0(
                data.pesoKg,
                0
              );

            const stockPorHielo =
              data.stockPorHielo;

            /*
             * El nombre de la bolsa es
             * el que nos permite distinguir
             * MAQUILA del producto normal.
             */
            const esMaquila =
              isMaquilaProduct(
                bolsaVaciaNombre
              );

            if (!bolsaVaciaCodigo) {
              return;
            }

            if (
              !pesoKg ||
              pesoKg <= 0
            ) {
              return;
            }

            if (
              !isRecord(
                stockPorHielo
              )
            ) {
              return;
            }

            Object.entries(
              stockPorHielo
            ).forEach(
              ([
                tipoHielo,
                stockData,
              ]) => {
                const tipo =
                  normalizeText(
                    tipoHielo
                  );

                if (!tipo) {
                  return;
                }

                let stockActual = 0;

                if (
                  isRecord(
                    stockData
                  )
                ) {
                  stockActual =
                    safeInt0(
                      stockData.stockActual,
                      0
                    );
                }

                const key =
                  buildKey(
                    bolsaVaciaCodigo,
                    tipo,
                    pesoKg
                  );

                map.set(
                  key,
                  {
                    bolsaVaciaCodigo,
                    bolsaVaciaNombre,
                    tipoHielo:
                      tipo,
                    pesoKg,
                    stockActual,

                    esMaquila,

                    displayName:
                      buildDisplayName(
                        tipo,
                        pesoKg,
                        esMaquila
                      ),
                  }
                );
              }
            );
          }
        );

        setBaseRows(
          Array.from(
            map.values()
          )
        );

        setLoadingProducts(false);
      },

      (error) => {
        console.error(
          'Error leyendo productos del inventario en tiempo real:',
          error
        );

        setBaseRows([]);
        setLoadingProducts(false);
      }
    );

    return () => {
      unsubscribe();
    };
  }, []);

  /*
   * ========================================
   * MOVIMIENTOS FIREBASE
   *
   * Se usan únicamente como respaldo para
   * BARRA cuando Firebase no la expone en
   * stockPorHielo.
   * ========================================
   */
  useEffect(() => {
    const MOVS =
      'movimientos';

    let unsub:
      | Unsubscribe
      | null = null;

    let cancelled = false;

    const toRow = (
      d: QueryDocumentSnapshot<DocumentData>
    ): Movimiento => {
      return {
        id: d.id,
        ...(
          d.data() as Record<
            string,
            unknown
          >
        ),
      } as Movimiento;
    };

    const subscribe = (
      field:
        | 'fecha'
        | 'createdAt'
    ) => {
      setLoadingMovs(true);

      const qy = query(
        collection(
          inventoryDb,
          MOVS
        ),
        orderBy(
          field,
          'desc'
        ),
        qLimit(1500)
      );

      unsub = onSnapshot(
        qy,

        (
          snap: QuerySnapshot<DocumentData>
        ) => {
          if (cancelled) {
            return;
          }

          setMovimientos(
            snap.docs.map(
              (d) =>
                toRow(d)
            )
          );

          setLoadingMovs(false);
        },

        (
          err: FirestoreError
        ) => {
          if (cancelled) {
            return;
          }

          /*
           * Algunas instalaciones viejas
           * manejan fecha y otras createdAt.
           */
          if (
            field ===
            'fecha'
          ) {
            try {
              if (unsub) {
                unsub();
              }
            } catch {
              // Ignorar cleanup fallido.
            }

            subscribe(
              'createdAt'
            );

            return;
          }

          console.error(
            'Error leyendo movimientos realtime:',
            err
          );

          setMovimientos([]);
          setLoadingMovs(false);
        }
      );
    };

    subscribe('fecha');

    return () => {
      cancelled = true;

      try {
        if (unsub) {
          unsub();
        }
      } catch {
        // Ignorar cleanup fallido.
      }
    };
  }, []);

  /*
   * ========================================
   * INFORMACIÓN POR BV
   * ========================================
   */

  const bolsaInfoByBV =
    useMemo(() => {
      const map = new Map<
        string,
        {
          pesoKg: number;
          nombre: string;
          esMaquila: boolean;
        }
      >();

      for (
        const row of
          baseRows ?? []
      ) {
        const codigo =
          normalizeCode(
            row.bolsaVaciaCodigo
          );

        if (!codigo) {
          continue;
        }

        if (
          !map.has(codigo)
        ) {
          map.set(
            codigo,
            {
              pesoKg:
                safeInt0(
                  row.pesoKg,
                  0
                ),

              nombre:
                row.bolsaVaciaNombre ??
                '',

              esMaquila:
                Boolean(
                  row.esMaquila
                ),
            }
          );
        }
      }

      return map;
    }, [baseRows]);

  /*
   * ========================================
   * FALLBACK DE BARRA
   * ========================================
   */

  const barraFallbackRows =
    useMemo(() => {
      const out = new Map<
        string,
        InventoryProductRealtime
      >();

      /*
       * movimientos viene ordenado
       * descendente, así que el primer
       * movimiento válido de cada llave
       * es el más reciente.
       */
      for (
        const m of
          movimientos ?? []
      ) {
        const tipo =
          normalizeText(
            m.tipo
          );

        const tipoProducto =
          normalizeText(
            m.tipoProducto
          );

        const tipoHielo =
          normalizeText(
            m.tipoHielo ??
              m.tipoHieloContenido
          );

        if (
          tipoProducto &&
          tipoProducto !==
            'BOLSA'
        ) {
          continue;
        }

        if (
          tipoHielo !==
          'BARRA'
        ) {
          continue;
        }

        if (
          tipo !==
          'LLENADO_BOLSA'
        ) {
          continue;
        }

        let bvCodigo =
          normalizeCode(
            m.bolsaVaciaCodigo
          );

        /*
         * Hay movimientos antiguos donde
         * el BV quedó en productoCodigo.
         */
        if (
          !/^BV/.test(
            bvCodigo
          )
        ) {
          const productoCodigo =
            normalizeCode(
              m.productoCodigo
            );

          if (
            /^BV/.test(
              productoCodigo
            )
          ) {
            bvCodigo =
              productoCodigo;
          }
        }

        if (
          !/^BV/.test(
            bvCodigo
          )
        ) {
          continue;
        }

        const bolsaInfo =
          bolsaInfoByBV.get(
            bvCodigo
          );

        let pesoKg =
          safeInt0(
            bolsaInfo?.pesoKg,
            0
          );

        if (!pesoKg) {
          const kgFromNombre =
            extractKgFromNombre(
              m.productoNombre
            );

          pesoKg =
            safeInt0(
              kgFromNombre,
              0
            );
        }

        if (
          !pesoKg ||
          pesoKg <= 0
        ) {
          continue;
        }

        const key =
          buildKey(
            bvCodigo,
            'BARRA',
            pesoKg
          );

        /*
         * Ya encontramos un movimiento
         * más reciente para esta llave.
         */
        if (
          out.has(key)
        ) {
          continue;
        }

        const stockActual =
          getMovementFinalStock(
            m
          );

        /*
         * Si el movimiento no trae manera
         * segura de determinar stock final,
         * no inventamos uno.
         */
        if (
          stockActual ===
          null
        ) {
          continue;
        }

        const movimientoNombre =
          String(
            m.productoNombre ??
              ''
          ).trim();

        const bolsaVaciaNombre =
          bolsaInfo?.nombre ||
          movimientoNombre;

        const esMaquila =
          bolsaInfo?.esMaquila ??
          isMaquilaProduct(
            bolsaVaciaNombre
          );

        out.set(
          key,
          {
            bolsaVaciaCodigo:
              bvCodigo,

            bolsaVaciaNombre,

            tipoHielo:
              'BARRA',

            pesoKg,

            stockActual:
              safeInt0(
                stockActual,
                0
              ),

            esMaquila,

            displayName:
              'BARRA',
          }
        );
      }

      return out;
    }, [
      movimientos,
      bolsaInfoByBV,
    ]);

  /*
   * ========================================
   * CATÁLOGO FINAL
   * ========================================
   */

  const products =
    useMemo(() => {
      const map = new Map<
        string,
        InventoryProductRealtime
      >();

      /*
       * Fuente principal:
       * colección productos.
       */
      for (
        const row of
          baseRows ?? []
      ) {
        const bolsaVaciaCodigo =
          normalizeCode(
            row.bolsaVaciaCodigo
          );

        const tipoHielo =
          normalizeText(
            row.tipoHielo
          );

        const pesoKg =
          safeInt0(
            row.pesoKg,
            0
          );

        if (
          !bolsaVaciaCodigo ||
          !tipoHielo ||
          pesoKg <= 0
        ) {
          continue;
        }

        const key =
          buildKey(
            bolsaVaciaCodigo,
            tipoHielo,
            pesoKg
          );

        const esMaquila =
          Boolean(
            row.esMaquila
          ) ||
          isMaquilaProduct(
            row.bolsaVaciaNombre
          );

        map.set(
          key,
          {
            ...row,

            bolsaVaciaCodigo,

            bolsaVaciaNombre:
              String(
                row.bolsaVaciaNombre ??
                  ''
              ).trim(),

            tipoHielo,

            pesoKg,

            stockActual:
              safeInt0(
                row.stockActual,
                0
              ),

            esMaquila,

            displayName:
              buildDisplayName(
                tipoHielo,
                pesoKg,
                esMaquila
              ),
          }
        );
      }

      /*
       * Agregar únicamente las barras
       * que NO vinieron ya directamente
       * desde productos.
       */
      for (
        const [
          key,
          row,
        ] of
          barraFallbackRows.entries()
      ) {
        if (
          map.has(key)
        ) {
          continue;
        }

        map.set(
          key,
          {
            ...row,

            bolsaVaciaCodigo:
              normalizeCode(
                row.bolsaVaciaCodigo
              ),

            tipoHielo:
              'BARRA',

            pesoKg:
              safeInt0(
                row.pesoKg,
                0
              ),

            stockActual:
              safeInt0(
                row.stockActual,
                0
              ),

            displayName:
              'BARRA',
          }
        );
      }

      return Array.from(
        map.values()
      ).sort(
        (a, b) => {
          /*
           * Barra primero.
           */
          const aBarra =
            normalizeText(
              a.tipoHielo
            ) ===
            'BARRA'
              ? 0
              : 1;

          const bBarra =
            normalizeText(
              b.tipoHielo
            ) ===
            'BARRA'
              ? 0
              : 1;

          if (
            aBarra !==
            bBarra
          ) {
            return (
              aBarra -
              bBarra
            );
          }

          /*
           * Tipo de hielo.
           */
          const byTipo =
            normalizeText(
              a.tipoHielo
            ).localeCompare(
              normalizeText(
                b.tipoHielo
              ),
              'es-MX'
            );

          if (
            byTipo !== 0
          ) {
            return byTipo;
          }

          /*
           * Peso.
           */
          const byPeso =
            a.pesoKg -
            b.pesoKg;

          if (
            byPeso !== 0
          ) {
            return byPeso;
          }

          /*
           * Normal primero, maquila después.
           */
          const byMaquila =
            Number(
              a.esMaquila
            ) -
            Number(
              b.esMaquila
            );

          if (
            byMaquila !==
            0
          ) {
            return byMaquila;
          }

          /*
           * Nombre visible.
           */
          const byName =
            a.displayName.localeCompare(
              b.displayName,
              'es-MX'
            );

          if (
            byName !== 0
          ) {
            return byName;
          }

          /*
           * Último desempate por BV.
           */
          return normalizeCode(
            a.bolsaVaciaCodigo
          ).localeCompare(
            normalizeCode(
              b.bolsaVaciaCodigo
            ),
            'es-MX'
          );
        }
      );
    }, [
      baseRows,
      barraFallbackRows,
    ]);

  return {
    products,
    loading:
      loadingProducts ||
      loadingMovs,
  };
}