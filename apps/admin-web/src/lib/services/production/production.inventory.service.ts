import type { firestore } from 'firebase-admin';

import { getInventoryFirestoreAdmin } from '@/lib/server/inventoryFirebaseAdmin';

export type ProductionInventoryProductKind = 'BOLSA' | 'BARRA';

export type ProductionInventoryIceType =
  | 'ROLITO'
  | 'FRAP'
  | 'GOURMET'
  | 'ENFRIAR'
  | 'BARRA'
  | string;

export type ProductionInventoryProduct = {
  documentId: string;

  inventoryKey: string;
  productKey: string;

  kind: ProductionInventoryProductKind;
  tipoHielo: ProductionInventoryIceType;

  codigo: string;
  bolsaVaciaCodigo: string | null;

  nombre: string;
  nombreComercial: string;

  pesoKg: number;

  stockActual: number;
  availableQty: number;

  cuartosDisponibles: number;
  cantidadBarrasEquivalente: number;

  activo: boolean;

  raw: Record<string, unknown>;
};

export type ProductionInventorySummary = {
  products: ProductionInventoryProduct[];

  totalProducts: number;
  totalUnits: number;

  totalBags: number;
  totalBarsQuarterUnits: number;

  updatedAt: string;
};

type FirestoreProductData = Record<string, any>;

function clean(value: unknown): string {
  return String(value ?? '').trim();
}

function normalize(value: unknown): string {
  return clean(value)
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

function compact(value: unknown): string {
  return normalize(value).replace(/[^A-Z0-9]+/g, '');
}

function toNumber(value: unknown): number {
  if (value === null || value === undefined || value === '') {
    return 0;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : 0;
}

function toInteger(value: unknown): number {
  return Math.max(0, Math.trunc(toNumber(value)));
}

function normalizeIceType(
  value: unknown,
): ProductionInventoryIceType {
  const text = normalize(value);

  if (!text) return 'ROLITO';

  if (text.includes('BARRA')) return 'BARRA';
  if (text.includes('GOURMET')) return 'GOURMET';
  if (text.includes('ENFRIAR')) return 'ENFRIAR';
  if (text.includes('FRAP')) return 'FRAP';
  if (text.includes('ROLITO')) return 'ROLITO';
  if (text.includes('NORMAL')) return 'ROLITO';

  return text
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function normalizeKind(
  data: FirestoreProductData,
): ProductionInventoryProductKind {
  const tipo = normalize(data.tipo);
  const kind = normalize(data.kind);
  const codigo = normalize(data.codigo);

  /*
   * Una bolsa llena con contenido BARRA puede llamarse:
   * "Bolsa genérica 1/4 barra"
   *
   * pero sigue siendo una BOLSA (normalmente código BVxxx)
   * y su existencia vive en stockPorHielo.BARRA.
   *
   * Solo consideramos BARRA física cuando:
   * - el código empieza con BR;
   * - tipo es exactamente BARRA;
   * - o kind es exactamente BARRA.
   */
  if (
    codigo.startsWith('BR') ||
    tipo === 'BARRA' ||
    kind === 'BARRA'
  ) {
    return 'BARRA';
  }

  return 'BOLSA';
}

function extractKgFromText(value: unknown): number {
  const text = normalize(value);

  const match = text.match(
    /(\d+(?:\.\d+)?)\s*(KG|KILO|KILOS)/,
  );

  if (!match?.[1]) return 0;

  return toNumber(match[1]);
}

function resolveWeightKg(
  data: FirestoreProductData,
): number {
  const directCandidates = [
    data.pesoKg,
    data.peso_kg,
    data.kgPorUnidad,
    data.kg_por_unidad,
    data.peso,
  ];

  for (const candidate of directCandidates) {
    const value = toNumber(candidate);

    if (value > 0) {
      return value;
    }
  }

  const textCandidates = [
    data.nombreComercial,
    data.nombre,
    data.productoNombre,
    data.descripcion,
  ];

  for (const candidate of textCandidates) {
    const value = extractKgFromText(candidate);

    if (value > 0) {
      return value;
    }
  }

  return 0;
}

function numberFromStockValue(value: unknown): number {
  if (
    typeof value === 'number' ||
    typeof value === 'string'
  ) {
    return toInteger(value);
  }

  if (value && typeof value === 'object') {
    const objectValue = value as Record<string, unknown>;

    const candidates = [
      objectValue.stockActual,
      objectValue.stock,
      objectValue.cantidad,
      objectValue.disponible,
      objectValue.actual,
      objectValue.total,
    ];

    for (const candidate of candidates) {
      const parsed = toInteger(candidate);

      if (parsed > 0) {
        return parsed;
      }
    }
  }

  return 0;
}

function resolveStockByIceType(
  data: FirestoreProductData,
): Array<{
  tipoHielo: ProductionInventoryIceType;
  stockActual: number;
}> {
  const stockContainer =
    data.stockPorHielo ??
    data.stock_por_hielo ??
    data.stockLlenoPorProducto ??
    data.stockLleno ??
    null;

  if (
    !stockContainer ||
    typeof stockContainer !== 'object'
  ) {
    const directStock = toInteger(
      data.stockActual ??
        data.stock_actual ??
        data.stock ??
        data.cantidadLlena ??
        data.cantidad_llena,
    );

    if (directStock <= 0) {
      return [];
    }

    return [
      {
        tipoHielo: normalizeIceType(
          data.tipoHielo ??
            data.tipo_hielo ??
            data.iceType ??
            data.ice_type ??
            'ROLITO',
        ),
        stockActual: directStock,
      },
    ];
  }

  const result: Array<{
    tipoHielo: ProductionInventoryIceType;
    stockActual: number;
  }> = [];

  for (const [rawIceType, rawStock] of Object.entries(
    stockContainer,
  )) {
    const tipoHielo = normalizeIceType(rawIceType);
    const stockActual = numberFromStockValue(rawStock);

    if (stockActual <= 0) continue;

    result.push({
      tipoHielo,
      stockActual,
    });
  }

  return result;
}

function isActiveProduct(
  data: FirestoreProductData,
): boolean {
  if (data.activo === false) return false;
  if (data.isActive === false) return false;

  const status = normalize(
    data.status ?? data.estado ?? 'ACTIVO',
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

function buildKgText(weightKg: number): string {
  if (weightKg <= 0) return '';

  return Number.isInteger(weightKg)
    ? String(Math.trunc(weightKg))
    : String(weightKg);
}

function buildProductKey(params: {
  kind: ProductionInventoryProductKind;
  tipoHielo: ProductionInventoryIceType;
  pesoKg: number;
  codigo: string;
}): string {
  if (
    params.kind === 'BARRA' ||
    params.tipoHielo === 'BARRA'
  ) {
    return 'BARRA';
  }

  const kgText = buildKgText(params.pesoKg);

  if (params.tipoHielo && kgText) {
    return `${params.tipoHielo}_${kgText}`;
  }

  if (params.tipoHielo) {
    return params.tipoHielo;
  }

  return normalize(params.codigo)
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function buildInventoryKey(params: {
  documentId: string;
  codigo: string;
  tipoHielo: ProductionInventoryIceType;
  pesoKg: number;
  kind: ProductionInventoryProductKind;
}): string {
  if (params.kind === 'BARRA') {
    return `BARRA__${params.codigo || params.documentId}`;
  }

  const kgText = buildKgText(params.pesoKg);

  return [
    'BOLSA',
    params.codigo || params.documentId,
    params.tipoHielo,
    kgText,
  ]
    .filter(Boolean)
    .join('__');
}

function resolveDisplayName(params: {
  data: FirestoreProductData;
  kind: ProductionInventoryProductKind;
  tipoHielo: ProductionInventoryIceType;
  pesoKg: number;
}): string {
  const configuredName = clean(
    params.data.nombreComercial ??
      params.data.nombre_comercial ??
      params.data.productoNombre ??
      params.data.nombre,
  );

  if (configuredName) {
    return configuredName;
  }

  if (params.kind === 'BARRA') {
    return 'Barra de hielo';
  }

  const kgText = buildKgText(params.pesoKg);

  if (kgText) {
    return `Bolsa ${params.tipoHielo} ${kgText} KG`;
  }

  return `Bolsa ${params.tipoHielo}`;
}

function mapBarProduct(params: {
  documentId: string;
  data: FirestoreProductData;
}): ProductionInventoryProduct | null {
  const { documentId, data } = params;

  const activo = isActiveProduct(data);

  if (!activo) return null;

  const codigo = clean(
    data.codigo || documentId,
  ).toUpperCase();

  const cuartosDisponibles = toInteger(
    data.cuartosDisponibles ??
      data.cuartos_disponibles ??
      data.stockActual ??
      data.stock ??
      0,
  );

  if (cuartosDisponibles <= 0) return null;

  const tipoHielo: ProductionInventoryIceType =
    'BARRA';

  const pesoKg = resolveWeightKg(data);

  const nombreComercial = resolveDisplayName({
    data,
    kind: 'BARRA',
    tipoHielo,
    pesoKg,
  });

  const cantidadBarrasEquivalente =
    cuartosDisponibles / 4;

  return {
    documentId,

    inventoryKey: buildInventoryKey({
      documentId,
      codigo,
      tipoHielo,
      pesoKg,
      kind: 'BARRA',
    }),

    productKey: 'BARRA',

    kind: 'BARRA',
    tipoHielo,

    codigo,
    bolsaVaciaCodigo: null,

    nombre: nombreComercial,
    nombreComercial,

    pesoKg,

    stockActual: cuartosDisponibles,
    availableQty: cuartosDisponibles,

    cuartosDisponibles,
    cantidadBarrasEquivalente,

    activo,

    raw: data,
  };
}

function mapBagProducts(params: {
  documentId: string;
  data: FirestoreProductData;
}): ProductionInventoryProduct[] {
  const { documentId, data } = params;

  const activo = isActiveProduct(data);

  if (!activo) return [];

  const codigo = clean(
    data.codigo || documentId,
  ).toUpperCase();

  const bolsaVaciaCodigo = clean(
    data.bolsaVaciaCodigo ??
      data.bolsa_vacia_codigo ??
      data.codigo ??
      documentId,
  ).toUpperCase();

  const pesoKg = resolveWeightKg(data);

  const stockRows = resolveStockByIceType(data);

  return stockRows.map(
    ({ tipoHielo, stockActual }) => {
      const nombreComercial = resolveDisplayName({
        data,
        kind: 'BOLSA',
        tipoHielo,
        pesoKg,
      });

      return {
        documentId,

        inventoryKey: buildInventoryKey({
          documentId,
          codigo,
          tipoHielo,
          pesoKg,
          kind: 'BOLSA',
        }),

        productKey: buildProductKey({
          kind: 'BOLSA',
          tipoHielo,
          pesoKg,
          codigo,
        }),

        kind: 'BOLSA',
        tipoHielo,

        codigo,
        bolsaVaciaCodigo:
          bolsaVaciaCodigo || null,

        nombre: nombreComercial,
        nombreComercial,

        pesoKg,

        stockActual,
        availableQty: stockActual,

        cuartosDisponibles: 0,
        cantidadBarrasEquivalente: 0,

        activo,

        raw: data,
      };
    },
  );
}

function mapFirestoreProduct(
  document: firestore.QueryDocumentSnapshot,
): ProductionInventoryProduct[] {
  const data =
    document.data() as FirestoreProductData;

  const kind = normalizeKind(data);

  if (kind === 'BARRA') {
    const bar = mapBarProduct({
      documentId: document.id,
      data,
    });

    return bar ? [bar] : [];
  }

  return mapBagProducts({
    documentId: document.id,
    data,
  });
}

function sortInventoryProducts(
  products: ProductionInventoryProduct[],
): ProductionInventoryProduct[] {
  return products.sort((a, b) => {
    if (a.kind !== b.kind) {
      return a.kind === 'BOLSA' ? -1 : 1;
    }

    if (a.tipoHielo !== b.tipoHielo) {
      return a.tipoHielo.localeCompare(
        b.tipoHielo,
        'es',
      );
    }

    if (a.pesoKg !== b.pesoKg) {
      return a.pesoKg - b.pesoKg;
    }

    return a.nombreComercial.localeCompare(
      b.nombreComercial,
      'es',
    );
  });
}

export async function getProductionInventoryProducts(
  firestoreDb?: firestore.Firestore,
): Promise<ProductionInventoryProduct[]> {
  const db =
    firestoreDb ?? getInventoryFirestoreAdmin();

  const snapshot = await db
    .collection('productos')
    .get();

  const products = snapshot.docs.flatMap(
    mapFirestoreProduct,
  );

  return sortInventoryProducts(products);
}

export async function getProductionInventorySummary(
  firestoreDb?: firestore.Firestore,
): Promise<ProductionInventorySummary> {
  const products =
    await getProductionInventoryProducts(firestoreDb);

  const totalUnits = products.reduce(
    (total, product) =>
      total + product.availableQty,
    0,
  );

  const totalBags = products
    .filter(
      (product) => product.kind === 'BOLSA',
    )
    .reduce(
      (total, product) =>
        total + product.availableQty,
      0,
    );

  const totalBarsQuarterUnits = products
    .filter(
      (product) => product.kind === 'BARRA',
    )
    .reduce(
      (total, product) =>
        total + product.cuartosDisponibles,
      0,
    );

  return {
    products,
    totalProducts: products.length,
    totalUnits,
    totalBags,
    totalBarsQuarterUnits,
    updatedAt: new Date().toISOString(),
  };
}

export async function findProductionInventoryProduct(
  params: {
    inventoryKey?: string | null;
    productKey?: string | null;
    codigo?: string | null;
    tipoHielo?: string | null;
    pesoKg?: number | string | null;
  },
  firestoreDb?: firestore.Firestore,
): Promise<ProductionInventoryProduct | null> {
  const products =
    await getProductionInventoryProducts(firestoreDb);

  const requestedInventoryKey = normalize(
    params.inventoryKey,
  );

  const requestedProductKey = normalize(
    params.productKey,
  );

  const requestedCodigo = compact(
    params.codigo,
  );

  const requestedIceType = normalizeIceType(
    params.tipoHielo,
  );

  const requestedWeight = toNumber(
    params.pesoKg,
  );

  return (
    products.find((product) => {
      if (
        requestedInventoryKey &&
        normalize(product.inventoryKey) ===
          requestedInventoryKey
      ) {
        return true;
      }

      if (
        requestedProductKey &&
        normalize(product.productKey) ===
          requestedProductKey
      ) {
        return true;
      }

      if (
        requestedCodigo &&
        compact(product.codigo) ===
          requestedCodigo
      ) {
        if (
          params.tipoHielo &&
          normalizeIceType(
            product.tipoHielo,
          ) !== requestedIceType
        ) {
          return false;
        }

        if (
          requestedWeight > 0 &&
          Math.abs(
            product.pesoKg -
              requestedWeight,
          ) > 0.001
        ) {
          return false;
        }

        return true;
      }

      return false;
    }) ?? null
  );
}