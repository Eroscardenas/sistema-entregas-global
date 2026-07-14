import { NextResponse } from 'next/server';
import type { firestore } from 'firebase-admin';

import { getAdminSupabase } from '@/lib/server/supabaseAdmin';
import {
  getInventoryFirestoreAdmin,
  inventoryFirebaseAdmin,
} from '@/lib/server/inventoryFirebaseAdmin';
import {
  findProductionInventoryProduct,
  type ProductionInventoryProduct,
} from '@/lib/services/production/production.inventory.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type SaleType = 'CUSTOMER' | 'PUBLIC';

type RawSaleItem = {
  product_id?: unknown;
  inventory_product_setting_id?: unknown;
  inventory_code?: unknown;
  ice_type?: unknown;
  quantity?: unknown;
};

type CleanSaleItem = {
  productId: string;
  inventoryProductSettingId: string;
  inventoryCode: string;
  iceType: string;
  quantity: number;
};

type CatalogProduct = {
  id: string;
  nombre: string | null;
  precio_base: number | string | null;
  activo: boolean | null;
  kind: string | null;
  ice_type: string | null;
  kg_por_unidad: number | string | null;
};

type InventorySetting = {
  id: string;
  firebase_bolsa_vacia_codigo: string | null;
  firebase_tipo_hielo: string | null;
  peso_kg: number | string | null;
  nombre_comercial: string | null;
  precio_base: number | string | null;
  activo: boolean | null;
};

type ResolvedSaleItem = {
  productId: string;
  inventoryProductSettingId: string;
  productName: string;

  quantity: number;
  unitPrice: number;
  subtotal: number;

  inventory: ProductionInventoryProduct;
  setting: InventorySetting;
  catalogProduct: CatalogProduct;

  priceSource:
    | 'CUSTOMER_INVENTORY_OVERRIDE'
    | 'CUSTOMER_PRODUCT_OVERRIDE'
    | 'INVENTORY_SETTING_BASE'
    | 'PRODUCT_BASE';
};

function bad(message: string, status = 400) {
  return NextResponse.json(
    {
      ok: false,
      error: message,
    },
    {
      status,
    },
  );
}

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

function normalizeIceType(value: unknown): string {
  const text = normalize(value);

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

function toNumber(value: unknown): number {
  if (
    value === null ||
    value === undefined ||
    value === ''
  ) {
    return 0;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toPositiveInteger(value: unknown): number {
  const parsed = Math.trunc(toNumber(value));
  return parsed > 0 ? parsed : 0;
}

function nullableNumber(value: unknown): number | null {
  if (
    value === null ||
    value === undefined ||
    value === ''
  ) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isValidPaymentMethod(value: string) {
  return [
    'EFECTIVO',
    'TRANSFERENCIA',
    'CREDITO',
  ].includes(value);
}

function buildFallbackFolio() {
  const now = new Date();

  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');

  const time = [
    now.getHours(),
    now.getMinutes(),
    now.getSeconds(),
  ]
    .map((value) => String(value).padStart(2, '0'))
    .join('');

  const random = Math.floor(Math.random() * 900 + 100);

  return `GI-PRO-${y}${m}${d}-${time}${random}`;
}

function readStockNumber(value: unknown): number {
  if (
    typeof value === 'number' ||
    typeof value === 'string'
  ) {
    return Math.max(0, Math.trunc(toNumber(value)));
  }

  if (value && typeof value === 'object') {
    const row = value as Record<string, unknown>;

    return Math.max(
      0,
      Math.trunc(
        toNumber(
          row.stockActual ??
            row.stock ??
            row.cantidad ??
            row.disponible ??
            row.actual ??
            row.total,
        ),
      ),
    );
  }

  return 0;
}

function updateStockValue(
  originalValue: unknown,
  newStock: number,
): unknown {
  if (
    typeof originalValue === 'number' ||
    typeof originalValue === 'string'
  ) {
    return newStock;
  }

  if (
    originalValue &&
    typeof originalValue === 'object'
  ) {
    const objectValue = {
      ...(originalValue as Record<string, unknown>),
    };

    if ('stockActual' in objectValue) {
      objectValue.stockActual = newStock;
    } else if ('stock' in objectValue) {
      objectValue.stock = newStock;
    } else if ('cantidad' in objectValue) {
      objectValue.cantidad = newStock;
    } else if ('disponible' in objectValue) {
      objectValue.disponible = newStock;
    } else {
      objectValue.stockActual = newStock;
    }

    return objectValue;
  }

  return newStock;
}

function findIceStockEntry(
  stockContainer: Record<string, unknown>,
  requestedIceType: string,
) {
  const wanted = normalizeIceType(requestedIceType);

  for (const [key, value] of Object.entries(
    stockContainer,
  )) {
    if (normalizeIceType(key) === wanted) {
      return {
        key,
        value,
      };
    }
  }

  return null;
}

async function generateFolio() {
  const sb = getAdminSupabase();

  const rpcAttempts = [
    'generate_delivery_folio',
    'generate_production_sale_folio',
  ];

  for (const rpcName of rpcAttempts) {
    const { data, error } = await sb.rpc(rpcName);

    if (!error) {
      const folio = clean(data);

      if (folio) return folio;
    }
  }

  return buildFallbackFolio();
}

async function resolveSaleItems(params: {
  saleType: SaleType;
  customerId: string | null;
  items: CleanSaleItem[];
}): Promise<ResolvedSaleItem[]> {
  const sb = getAdminSupabase();

  const productIds = Array.from(
    new Set(
      params.items.map((item) => item.productId),
    ),
  );

  const settingIds = Array.from(
    new Set(
      params.items.map(
        (item) => item.inventoryProductSettingId,
      ),
    ),
  );

  const [
    productsResult,
    settingsResult,
  ] = await Promise.all([
    sb
      .from('products')
      .select(
        `
        id,
        nombre,
        precio_base,
        activo,
        kind,
        ice_type,
        kg_por_unidad
      `,
      )
      .in('id', productIds),

    sb
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
      `,
      )
      .in('id', settingIds),
  ]);

  if (productsResult.error) {
    throw productsResult.error;
  }

  if (settingsResult.error) {
    throw settingsResult.error;
  }

  const products =
    (productsResult.data ?? []) as CatalogProduct[];

  const settings =
    (settingsResult.data ?? []) as InventorySetting[];

  const productById = new Map(
    products.map((product) => [
      clean(product.id),
      product,
    ]),
  );

  const settingById = new Map(
    settings.map((setting) => [
      clean(setting.id),
      setting,
    ]),
  );

  const overrideBySettingId = new Map<
    string,
    number | null
  >();

  const overrideByProductId = new Map<
    string,
    number | null
  >();

  if (
    params.saleType === 'CUSTOMER' &&
    params.customerId
  ) {
    const [
      newOverridesResult,
      legacyOverridesResult,
    ] = await Promise.all([
      sb
        .from('customer_inventory_products')
        .select(
          `
          inventory_product_setting_id,
          precio_override,
          activo
        `,
        )
        .eq('customer_id', params.customerId)
        .eq('activo', true)
        .in(
          'inventory_product_setting_id',
          settingIds,
        ),

      sb
        .from('customer_products')
        .select(
          `
          product_id,
          precio_override,
          activo
        `,
        )
        .eq('customer_id', params.customerId)
        .eq('activo', true)
        .in('product_id', productIds),
    ]);

    if (newOverridesResult.error) {
      throw newOverridesResult.error;
    }

    if (legacyOverridesResult.error) {
      throw legacyOverridesResult.error;
    }

    for (const row of newOverridesResult.data ?? []) {
      overrideBySettingId.set(
        clean(
          (
            row as Record<string, unknown>
          ).inventory_product_setting_id,
        ),
        nullableNumber(
          (
            row as Record<string, unknown>
          ).precio_override,
        ),
      );
    }

    for (
      const row of legacyOverridesResult.data ?? []
    ) {
      overrideByProductId.set(
        clean(
          (row as Record<string, unknown>)
            .product_id,
        ),
        nullableNumber(
          (row as Record<string, unknown>)
            .precio_override,
        ),
      );
    }
  }

  const resolvedItems: ResolvedSaleItem[] = [];

  for (const item of params.items) {
    const catalogProduct = productById.get(
      item.productId,
    );

    if (!catalogProduct) {
      throw new Error(
        `Producto ${item.productId} no encontrado.`,
      );
    }

    if (catalogProduct.activo === false) {
      throw new Error(
        `El producto ${catalogProduct.nombre ?? item.productId} está inactivo.`,
      );
    }

    const setting = settingById.get(
      item.inventoryProductSettingId,
    );

    if (!setting) {
      throw new Error(
        `Configuración comercial ${item.inventoryProductSettingId} no encontrada.`,
      );
    }

    if (setting.activo === false) {
      throw new Error(
        `La configuración de ${setting.nombre_comercial ?? catalogProduct.nombre} está inactiva.`,
      );
    }

    const inventory =
      await findProductionInventoryProduct({
        codigo:
          setting.firebase_bolsa_vacia_codigo ??
          item.inventoryCode,
        tipoHielo:
          setting.firebase_tipo_hielo ??
          item.iceType,
        pesoKg: setting.peso_kg,
      });

    if (!inventory) {
      throw new Error(
        `No se encontró el inventario real de ${setting.nombre_comercial ?? catalogProduct.nombre}.`,
      );
    }

    if (inventory.availableQty < item.quantity) {
      throw new Error(
        `Stock insuficiente de ${setting.nombre_comercial ?? catalogProduct.nombre}. Disponible: ${inventory.availableQty}.`,
      );
    }

    const newOverride =
      overrideBySettingId.get(setting.id) ?? null;

    const legacyOverride =
      overrideByProductId.get(
        catalogProduct.id,
      ) ?? null;

    const settingBase = toNumber(
      setting.precio_base,
    );

    const productBase = toNumber(
      catalogProduct.precio_base,
    );

    const unitPrice =
      newOverride ??
      legacyOverride ??
      (settingBase > 0
        ? settingBase
        : productBase);

    if (unitPrice < 0) {
      throw new Error(
        `Precio inválido para ${setting.nombre_comercial ?? catalogProduct.nombre}.`,
      );
    }

    let priceSource: ResolvedSaleItem['priceSource'];

    if (newOverride !== null) {
      priceSource =
        'CUSTOMER_INVENTORY_OVERRIDE';
    } else if (legacyOverride !== null) {
      priceSource =
        'CUSTOMER_PRODUCT_OVERRIDE';
    } else if (settingBase > 0) {
      priceSource = 'INVENTORY_SETTING_BASE';
    } else {
      priceSource = 'PRODUCT_BASE';
    }

    resolvedItems.push({
      productId: catalogProduct.id,
      inventoryProductSettingId: setting.id,
      productName:
        clean(setting.nombre_comercial) ||
        clean(catalogProduct.nombre) ||
        inventory.nombreComercial,

      quantity: item.quantity,
      unitPrice,
      subtotal: item.quantity * unitPrice,

      inventory,
      setting,
      catalogProduct,
      priceSource,
    });
  }

  return resolvedItems;
}

async function decrementInventory(params: {
  saleId: string;
  folio: string;
  employeeId: string;
  employeeName: string;
  customerName: string;
  saleType: SaleType;
  paymentMethod: string;
  total: number;
  items: ResolvedSaleItem[];
}) {
  const db = getInventoryFirestoreAdmin();

  await db.runTransaction(
    async (
      transaction: firestore.Transaction,
    ) => {
      const documentSnapshots = new Map<
        string,
        firestore.DocumentSnapshot
      >();

      for (const item of params.items) {
        if (
          documentSnapshots.has(
            item.inventory.documentId,
          )
        ) {
          continue;
        }

        const reference = db
          .collection('productos')
          .doc(item.inventory.documentId);

        const snapshot =
          await transaction.get(reference);

        if (!snapshot.exists) {
          throw new Error(
            `Producto de inventario ${item.inventory.documentId} no encontrado.`,
          );
        }

        documentSnapshots.set(
          item.inventory.documentId,
          snapshot,
        );
      }

      const quantitiesByDocumentAndType = new Map<
        string,
        number
      >();

      for (const item of params.items) {
        const key = [
          item.inventory.documentId,
          normalizeIceType(
            item.inventory.tipoHielo,
          ),
        ].join('__');

        quantitiesByDocumentAndType.set(
          key,
          (quantitiesByDocumentAndType.get(key) ??
            0) + item.quantity,
        );
      }

      for (
        const [
          key,
          quantity,
        ] of quantitiesByDocumentAndType
      ) {
        const separatorIndex =
          key.lastIndexOf('__');

        const documentId = key.slice(
          0,
          separatorIndex,
        );

        const iceType = key.slice(
          separatorIndex + 2,
        );

        const snapshot =
          documentSnapshots.get(documentId);

        if (!snapshot) {
          throw new Error(
            `No se pudo leer el producto ${documentId}.`,
          );
        }

        const data =
          snapshot.data() as Record<string, any>;

        const reference = snapshot.ref;

        if (iceType === 'BARRA') {
          const current = Math.max(
            0,
            Math.trunc(
              toNumber(
                data.cuartosDisponibles ??
                  data.cuartos_disponibles ??
                  data.stockActual ??
                  0,
              ),
            ),
          );

          if (current < quantity) {
            throw new Error(
              `Stock insuficiente de barra. Disponible: ${current}.`,
            );
          }

          const next = current - quantity;

          transaction.update(reference, {
            cuartosDisponibles: next,
            updatedAt:
              inventoryFirebaseAdmin.firestore.FieldValue.serverTimestamp(),
          });

          continue;
        }

        const stockContainer =
          data.stockPorHielo ??
          data.stock_por_hielo ??
          null;

        if (
          stockContainer &&
          typeof stockContainer === 'object'
        ) {
          const stockEntry = findIceStockEntry(
            stockContainer,
            iceType,
          );

          if (!stockEntry) {
            throw new Error(
              `No existe stockPorHielo.${iceType} en ${documentId}.`,
            );
          }

          const current = readStockNumber(
            stockEntry.value,
          );

          if (current < quantity) {
            throw new Error(
              `Stock insuficiente de ${iceType}. Disponible: ${current}.`,
            );
          }

          const next = current - quantity;

          const nextContainer = {
            ...stockContainer,
            [stockEntry.key]: updateStockValue(
              stockEntry.value,
              next,
            ),
          };

          transaction.update(reference, {
            stockPorHielo: nextContainer,
            updatedAt:
              inventoryFirebaseAdmin.firestore.FieldValue.serverTimestamp(),
          });

          continue;
        }

        const current = Math.max(
          0,
          Math.trunc(
            toNumber(
              data.stockActual ??
                data.stock_actual ??
                data.stock ??
                0,
            ),
          ),
        );

        if (current < quantity) {
          throw new Error(
            `Stock insuficiente. Disponible: ${current}.`,
          );
        }

        transaction.update(reference, {
          stockActual: current - quantity,
          updatedAt:
            inventoryFirebaseAdmin.firestore.FieldValue.serverTimestamp(),
        });
      }

      const movementRef = db
        .collection('movimientos')
        .doc();

      transaction.set(movementRef, {
        tipo: 'SALIDA',
        subtipo: 'VENTA_PUBLICO',
        salidaSubtipo: 'VENTA_PUBLICO',
        salidaDestino: 'PUBLICO',

        origen: 'PRODUCCION',
        fuente: 'PRODUCTION_TABLET',

        afectaStock: true,
        batch: true,

        ventaId: params.saleId,
        folio: params.folio,

        empleadoId: params.employeeId,
        empleadoCodigo: params.employeeId,
        empleadoNombre: params.employeeName,

        clienteNombre: params.customerName,
        destinatario: params.customerName,

        tipoVenta: params.saleType,
        metodoPago: params.paymentMethod,

        total: params.total,

        cantidad: params.items.reduce(
          (total, item) =>
            total + item.quantity,
          0,
        ),

        items: params.items.map((item) => ({
          productId: item.productId,

          inventoryProductSettingId:
            item.inventoryProductSettingId,

          inventoryDocumentId:
            item.inventory.documentId,

          inventoryKey:
            item.inventory.inventoryKey,

          productKey:
            item.inventory.productKey,

          productoCodigo:
            item.inventory.codigo,

          bolsaVaciaCodigo:
            item.inventory.bolsaVaciaCodigo,

          productoNombre: item.productName,

          tipoHielo:
            item.inventory.tipoHielo,

          pesoKg:
            item.inventory.pesoKg,

          cantidad: item.quantity,
          delta: -item.quantity,

          precioUnitario: item.unitPrice,
          subtotal: item.subtotal,
        })),

        fecha:
          inventoryFirebaseAdmin.firestore.FieldValue.serverTimestamp(),

        createdAt:
          inventoryFirebaseAdmin.firestore.FieldValue.serverTimestamp(),

        updatedAt:
          inventoryFirebaseAdmin.firestore.FieldValue.serverTimestamp(),
      });
    },
  );
}

async function rollbackSupabaseSale(params: {
  saleId: string;
}) {
  const sb = getAdminSupabase();

  await sb
    .from('delivery_items')
    .delete()
    .eq('delivery_id', params.saleId);

  await sb
    .from('deliveries')
    .delete()
    .eq('id', params.saleId);
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
  });
}

export async function POST(req: Request) {
  let createdSaleId: string | null = null;

  try {
    const sb = getAdminSupabase();

    const body = await req
      .json()
      .catch(() => ({}));

    const employeeId = clean(
      body?.employee_id,
    );

    const employeeName =
      clean(body?.employee_name) ||
      employeeId;

    const saleType = normalize(
      body?.sale_type || 'PUBLIC',
    ) as SaleType;

    const customerId =
      saleType === 'CUSTOMER'
        ? clean(body?.customer_id)
        : null;

    const customerName =
      clean(body?.customer_name) ||
      (saleType === 'PUBLIC'
        ? 'Público general'
        : 'Cliente');

    const paymentMethod = normalize(
      body?.payment_method || 'EFECTIVO',
    );

    const rawItems: RawSaleItem[] =
      Array.isArray(body?.items)
        ? body.items
        : [];

    if (!employeeId) {
      return bad('Falta employee_id.');
    }

    if (
      saleType !== 'CUSTOMER' &&
      saleType !== 'PUBLIC'
    ) {
      return bad(
        'sale_type debe ser CUSTOMER o PUBLIC.',
      );
    }

    if (
      saleType === 'CUSTOMER' &&
      !customerId
    ) {
      return bad(
        'Falta customer_id para la venta a cliente.',
      );
    }

    if (!isValidPaymentMethod(paymentMethod)) {
      return bad(
        'Método de pago inválido.',
      );
    }

    if (rawItems.length === 0) {
      return bad(
        'Agrega al menos un producto.',
      );
    }

    const cleanItems: CleanSaleItem[] =
      rawItems.map((item) => ({
        productId: clean(item.product_id),

        inventoryProductSettingId: clean(
          item.inventory_product_setting_id,
        ),

        inventoryCode: clean(
          item.inventory_code,
        ).toUpperCase(),

        iceType: normalizeIceType(
          item.ice_type,
        ),

        quantity: toPositiveInteger(
          item.quantity,
        ),
      }));

    for (const item of cleanItems) {
      if (!item.productId) {
        return bad('Producto inválido.');
      }

      if (!item.inventoryProductSettingId) {
        return bad(
          'Falta inventory_product_setting_id.',
        );
      }

      if (item.quantity <= 0) {
        return bad('Cantidad inválida.');
      }
    }

    if (saleType === 'CUSTOMER') {
      const { data: customer, error } =
        await sb
          .from('customers')
          .select('id,nombre,activo')
          .eq('id', customerId)
          .maybeSingle();

      if (error) throw error;

      if (!customer) {
        return bad(
          'Cliente no encontrado.',
          404,
        );
      }

      if (customer.activo === false) {
        return bad(
          'El cliente está inactivo.',
        );
      }
    }

    const resolvedItems =
      await resolveSaleItems({
        saleType,
        customerId,
        items: cleanItems,
      });

    const total = resolvedItems.reduce(
      (sum, item) => sum + item.subtotal,
      0,
    );

    const totalQuantity =
      resolvedItems.reduce(
        (sum, item) =>
          sum + item.quantity,
        0,
      );

    const folio = await generateFolio();

    const { data: saleRow, error: saleError } =
      await sb
        .from('deliveries')
        .insert({
          folio,

          customer_id:
            saleType === 'CUSTOMER'
              ? customerId
              : null,

          customer_nombre_snapshot:
            customerName,

          assignment_id: null,
          route_id: null,
          driver_id: null,

          status: 'ENTREGADA',

          delivery_type:
            'production_sale',

          created_by_driver: false,

          payment_method:
            paymentMethod,

          subtotal_real: total,
          total,

          notes:
            `Venta ${saleType} desde tablet de Producción. Atendió: ${employeeName}`,

          created_at:
            new Date().toISOString(),
        })
        .select('id,folio')
        .single();

    if (saleError) {
      throw saleError;
    }

    createdSaleId = clean(saleRow.id);

    const deliveryItems = resolvedItems.map(
      (item) => ({
        delivery_id: createdSaleId,

        product_id: item.productId,

        inventory_product_setting_id:
          item.inventoryProductSettingId,

        qty_assigned: item.quantity,
        qty_real: item.quantity,

        unit_price: item.unitPrice,
        subtotal_real: item.subtotal,
      }),
    );

    const { error: itemsError } = await sb
      .from('delivery_items')
      .insert(deliveryItems);

    if (itemsError) {
      await rollbackSupabaseSale({
        saleId: createdSaleId,
      });

      createdSaleId = null;

      throw itemsError;
    }

    try {
      await decrementInventory({
        saleId: createdSaleId,
        folio:
          clean(saleRow.folio) ||
          folio,

        employeeId,
        employeeName,

        customerName,
        saleType,
        paymentMethod,

        total,
        items: resolvedItems,
      });
    } catch (inventoryError) {
      await rollbackSupabaseSale({
        saleId: createdSaleId,
      });

      createdSaleId = null;

      throw inventoryError;
    }

    return NextResponse.json({
      ok: true,

      sale_id: createdSaleId,
      delivery_id: createdSaleId,

      folio:
        clean(saleRow.folio) ||
        folio,

      sale_type: saleType,

      customer_id: customerId,
      customer_name: customerName,

      employee_id: employeeId,
      employee_name: employeeName,

      payment_method: paymentMethod,

      total_quantity: totalQuantity,
      total,

      status: 'ENTREGADA',

      created_at:
        new Date().toISOString(),

      items: resolvedItems.map(
        (item) => ({
          product_id:
            item.productId,

          inventory_product_setting_id:
            item.inventoryProductSettingId,

          name:
            item.productName,

          nombre:
            item.productName,

          quantity:
            item.quantity,

          qty:
            item.quantity,

          unit_price:
            item.unitPrice,

          precio:
            item.unitPrice,

          subtotal:
            item.subtotal,

          price_source:
            item.priceSource,

          inventory_document_id:
            item.inventory.documentId,

          inventory_key:
            item.inventory.inventoryKey,

          product_key:
            item.inventory.productKey,

          available_before:
            item.inventory.availableQty,

          available_after:
            item.inventory.availableQty -
            item.quantity,
        }),
      ),
    });
  } catch (error: unknown) {
    console.error(
      '[production-sales] error:',
      error,
    );

    if (createdSaleId) {
      await rollbackSupabaseSale({
        saleId: createdSaleId,
      }).catch((rollbackError) => {
        console.error(
          '[production-sales] rollback error:',
          rollbackError,
        );
      });
    }

    const message =
      error instanceof Error
        ? error.message
        : 'Error registrando la venta de Producción.';

    return NextResponse.json(
      {
        ok: false,
        error: message,
      },
      {
        status: 400,
      },
    );
  }
}