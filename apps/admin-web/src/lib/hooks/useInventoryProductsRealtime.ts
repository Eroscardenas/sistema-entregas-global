'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  collection,
  onSnapshot,
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

type FirebaseProductData = {
  codigo?: unknown;
  nombre?: unknown;

  pesoKg?: unknown;
  peso_kg?: unknown;
  kgPorUnidad?: unknown;
  kg_por_unidad?: unknown;

  tipo?: unknown;
  kind?: unknown;

  tipoHielo?: unknown;
  tipo_hielo?: unknown;

  stockPorHielo?: unknown;
  stock_por_hielo?: unknown;

  cuartosDisponibles?: unknown;
  cuartos_disponibles?: unknown;

  stockActual?: unknown;
  stock_actual?: unknown;
  stock?: unknown;

  activo?: unknown;
  isActive?: unknown;

  status?: unknown;
  estado?: unknown;

  [key: string]: unknown;
};

function safeInt0(
  value: unknown,
  fallback = 0,
) {
  const n = Number(value);

  if (!Number.isFinite(n)) {
    return fallback;
  }

  const integer =
    Math.floor(n);

  return integer < 0
    ? fallback
    : integer;
}

function safeNumber(
  value: unknown,
  fallback = 0,
) {
  const n = Number(value);

  return Number.isFinite(n)
    ? n
    : fallback;
}

function normalizeText(
  value: unknown,
) {
  return String(value ?? '')
    .trim()
    .toUpperCase();
}

function normalizeCode(
  value: unknown,
) {
  return String(value ?? '')
    .trim()
    .toUpperCase();
}

function isRecord(
  value: unknown,
): value is Record<
  string,
  unknown
> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value)
  );
}

function normalizeIceType(
  value: unknown,
) {
  const text =
    normalizeText(value);

  if (
    text.includes('BARRA')
  ) {
    return 'BARRA';
  }

  if (
    text.includes('GOURMET')
  ) {
    return 'GOURMET';
  }

  if (
    text.includes('ENFRIAR')
  ) {
    return 'ENFRIAR';
  }

  if (
    text.includes('FRAPPE')
  ) {
    return 'FRAPPE';
  }

  if (
    text.includes('ROLITO')
  ) {
    return 'ROLITO';
  }

  if (
    text.includes('NORMAL')
  ) {
    return 'ROLITO';
  }

  return text;
}

function isActiveProduct(
  data: FirebaseProductData,
) {
  if (
    data.activo === false
  ) {
    return false;
  }

  if (
    data.isActive === false
  ) {
    return false;
  }

  const status =
    normalizeText(
      data.status ??
        data.estado ??
        'ACTIVO',
    );

  if (
    status === 'INACTIVO' ||
    status === 'ELIMINADO' ||
    status === 'ARCHIVADO'
  ) {
    return false;
  }

  return true;
}

/**
 * MAQUILA se identifica por el nombre real
 * de la bolsa registrada en Firebase.
 *
 * Ejemplo:
 *
 * Bolsa vacía 5kg rolito para maquila
 */
function isMaquilaProduct(
  nombre: unknown,
) {
  return normalizeText(
    nombre,
  ).includes(
    'MAQUILA',
  );
}

function extractKgFromText(
  value: unknown,
): number {
  const text =
    String(
      value ?? '',
    );

  const match =
    text.match(
      /(\d+(?:[.,]\d+)?)\s*kg/i,
    );

  if (!match?.[1]) {
    return 0;
  }

  const n =
    Number(
      match[1].replace(
        ',',
        '.',
      ),
    );

  return Number.isFinite(n)
    ? n
    : 0;
}

function resolveWeightKg(
  data: FirebaseProductData,
) {
  const directCandidates = [
    data.pesoKg,
    data.peso_kg,
    data.kgPorUnidad,
    data.kg_por_unidad,
  ];

  for (
    const candidate of
      directCandidates
  ) {
    const value =
      safeNumber(
        candidate,
        0,
      );

    if (value > 0) {
      return value;
    }
  }

  const fromName =
    extractKgFromText(
      data.nombre,
    );

  if (
    fromName > 0
  ) {
    return fromName;
  }

  return 0;
}

function readStockNumber(
  value: unknown,
) {
  if (
    typeof value ===
      'number' ||
    typeof value ===
      'string'
  ) {
    return safeInt0(
      value,
      0,
    );
  }

  if (
    isRecord(value)
  ) {
    return safeInt0(
      value.stockActual ??
        value.stock ??
        value.cantidad ??
        value.disponible ??
        value.actual ??
        value.total,
      0,
    );
  }

  return 0;
}

function buildDisplayName(
  tipoHielo: string,
  pesoKg: number,
  esMaquila = false,
) {
  const tipo =
    normalizeIceType(
      tipoHielo,
    );

  if (
    tipo === 'BARRA'
  ) {
    return 'BARRA';
  }

  const baseName =
    getDisplayName(
      tipo,
      pesoKg,
    );

  if (!esMaquila) {
    return baseName;
  }

  if (
    normalizeText(
      baseName,
    ).includes(
      'MAQUILA',
    )
  ) {
    return baseName;
  }

  return `${baseName} MAQUILA`;
}

/**
 * No agrupamos únicamente por tipo + peso.
 *
 * El BV forma parte de la identidad porque:
 *
 * ROLITO 5 KG normal
 * ROLITO 5 KG MAQUILA
 *
 * pueden tener el mismo peso y contenido,
 * pero inventarios distintos.
 */
function buildKey(
  bolsaVaciaCodigo: string,
  tipoHielo: string,
  pesoKg: number,
) {
  return [
    normalizeCode(
      bolsaVaciaCodigo,
    ),

    normalizeIceType(
      tipoHielo,
    ),

    String(
      safeNumber(
        pesoKg,
        0,
      ),
    ),
  ].join('__');
}

/**
 * Determina si el documento representa
 * una barra física.
 *
 * Una BVxxx con stockPorHielo.BARRA
 * NO es barra física.
 */
function isPhysicalBar(
  data: FirebaseProductData,
) {
  const codigo =
    normalizeCode(
      data.codigo,
    );

  const tipo =
    normalizeText(
      data.tipo,
    );

  const kind =
    normalizeText(
      data.kind,
    );

  return (
    codigo.startsWith(
      'BR',
    ) ||
    tipo === 'BARRA' ||
    kind === 'BARRA'
  );
}

export function useInventoryProductsRealtime() {
  const [
    baseRows,
    setBaseRows,
  ] =
    useState<
      InventoryProductRealtime[]
    >([]);

  const [
    loadingProducts,
    setLoadingProducts,
  ] =
    useState(true);

  /*
   * ==================================================
   * ÚNICO LISTENER FIREBASE
   * ==================================================
   *
   * Ya NO escuchamos `movimientos`.
   *
   * Antes se descargaban hasta 1,500 movimientos
   * cada vez que se montaba este hook solamente
   * para intentar reconstruir BARRA.
   *
   * El stock actual debe salir de `productos`.
   */
  useEffect(() => {
    const ref =
      collection(
        inventoryDb,
        'productos',
      );

    const unsubscribe =
      onSnapshot(
        ref,

        (snapshot) => {
          const map =
            new Map<
              string,
              InventoryProductRealtime
            >();

          for (
            const document of
              snapshot.docs
          ) {
            const data =
              document.data() as
                FirebaseProductData;

            if (
              !isActiveProduct(
                data,
              )
            ) {
              continue;
            }

            const codigo =
              normalizeCode(
                data.codigo ??
                  document.id,
              );

            if (!codigo) {
              continue;
            }

            const nombre =
              String(
                data.nombre ??
                  '',
              ).trim();

            const pesoKg =
              resolveWeightKg(
                data,
              );

            const esMaquila =
              isMaquilaProduct(
                nombre,
              );

            /*
             * ==========================================
             * BARRA FÍSICA
             * ==========================================
             *
             * Si existe como documento BRxxx / kind BARRA,
             * su existencia está en cuartosDisponibles.
             */
            if (
              isPhysicalBar(
                data,
              )
            ) {
              const stockActual =
                safeInt0(
                  data.cuartosDisponibles ??
                    data.cuartos_disponibles ??
                    data.stockActual ??
                    data.stock_actual ??
                    data.stock,
                  0,
                );

              /*
               * Conservamos el registro aunque esté en 0.
               * El hook comercial decidirá si debe mostrarse.
               */
              const key =
                buildKey(
                  codigo,
                  'BARRA',
                  pesoKg,
                );

              map.set(
                key,
                {
                  bolsaVaciaCodigo:
                    codigo,

                  bolsaVaciaNombre:
                    nombre,

                  tipoHielo:
                    'BARRA',

                  pesoKg,

                  stockActual,

                  displayName:
                    'BARRA',

                  esMaquila:
                    false,
                },
              );

              continue;
            }

            /*
             * ==========================================
             * BOLSAS
             * ==========================================
             *
             * Aquí entran:
             *
             * ROLITO
             * FRAP
             * GOURMET
             * ENFRIAR
             * BARRA dentro de BVxxx
             *
             * incluyendo MAQUILA.
             */
            const stockPorHielo =
              data.stockPorHielo ??
              data.stock_por_hielo;

            if (
              !isRecord(
                stockPorHielo,
              )
            ) {
              continue;
            }

            if (
              pesoKg <= 0
            ) {
              continue;
            }

            for (
              const [
                rawTipoHielo,
                rawStock,
              ] of Object.entries(
                stockPorHielo,
              )
            ) {
              const tipoHielo =
                normalizeIceType(
                  rawTipoHielo,
                );

              if (
                !tipoHielo
              ) {
                continue;
              }

              const stockActual =
                readStockNumber(
                  rawStock,
                );

              const key =
                buildKey(
                  codigo,
                  tipoHielo,
                  pesoKg,
                );

              map.set(
                key,
                {
                  bolsaVaciaCodigo:
                    codigo,

                  bolsaVaciaNombre:
                    nombre,

                  tipoHielo,

                  pesoKg,

                  stockActual,

                  esMaquila,

                  displayName:
                    buildDisplayName(
                      tipoHielo,
                      pesoKg,
                      esMaquila,
                    ),
                },
              );
            }
          }

          setBaseRows(
            Array.from(
              map.values(),
            ),
          );

          setLoadingProducts(
            false,
          );
        },

        (error) => {
          console.error(
            'Error leyendo productos del inventario en tiempo real:',
            error,
          );

          setBaseRows([]);

          setLoadingProducts(
            false,
          );
        },
      );

    return () => {
      unsubscribe();
    };
  }, []);

  /*
   * ==================================================
   * CATÁLOGO FINAL
   * ==================================================
   */
  const products =
    useMemo(() => {
      const map =
        new Map<
          string,
          InventoryProductRealtime
        >();

      for (
        const row of
          baseRows
      ) {
        const bolsaVaciaCodigo =
          normalizeCode(
            row.bolsaVaciaCodigo,
          );

        const tipoHielo =
          normalizeIceType(
            row.tipoHielo,
          );

        const pesoKg =
          safeNumber(
            row.pesoKg,
            0,
          );

        if (
          !bolsaVaciaCodigo ||
          !tipoHielo
        ) {
          continue;
        }

        const key =
          buildKey(
            bolsaVaciaCodigo,
            tipoHielo,
            pesoKg,
          );

        const esMaquila =
          Boolean(
            row.esMaquila,
          ) ||
          isMaquilaProduct(
            row.bolsaVaciaNombre,
          );

        map.set(
          key,
          {
            ...row,

            bolsaVaciaCodigo,

            bolsaVaciaNombre:
              String(
                row.bolsaVaciaNombre ??
                  '',
              ).trim(),

            tipoHielo,

            pesoKg,

            stockActual:
              safeInt0(
                row.stockActual,
                0,
              ),

            esMaquila,

            displayName:
              buildDisplayName(
                tipoHielo,
                pesoKg,
                esMaquila,
              ),
          },
        );
      }

      return Array.from(
        map.values(),
      ).sort(
        (a, b) => {
          /*
           * BARRA primero.
           */
          const aBarra =
            normalizeIceType(
              a.tipoHielo,
            ) ===
            'BARRA'
              ? 0
              : 1;

          const bBarra =
            normalizeIceType(
              b.tipoHielo,
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
           * Tipo.
           */
          const byTipo =
            normalizeIceType(
              a.tipoHielo,
            ).localeCompare(
              normalizeIceType(
                b.tipoHielo,
              ),
              'es-MX',
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
           * Normal antes de maquila.
           */
          const byMaquila =
            Number(
              a.esMaquila,
            ) -
            Number(
              b.esMaquila,
            );

          if (
            byMaquila !==
            0
          ) {
            return byMaquila;
          }

          /*
           * Nombre.
           */
          const byName =
            a.displayName.localeCompare(
              b.displayName,
              'es-MX',
            );

          if (
            byName !== 0
          ) {
            return byName;
          }

          /*
           * Desempate final por código.
           */
          return normalizeCode(
            a.bolsaVaciaCodigo,
          ).localeCompare(
            normalizeCode(
              b.bolsaVaciaCodigo,
            ),
            'es-MX',
          );
        },
      );
    }, [
      baseRows,
    ]);

  return {
    products,

    loading:
      loadingProducts,
  };
}