import { NextResponse } from 'next/server';

import { getAdminSupabase } from '@/lib/server/supabaseAdmin';
import {
  getProductionInventoryProducts,
  type ProductionInventoryProduct,
} from '@/lib/services/production/production.inventory.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type SupabaseProduct = {
  id: string;
  nombre: string | null;
  activo: boolean | null;
  precio_base: number | string | null;
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

type CustomerInventoryProduct = {
  id: string;
  customer_id: string;
  inventory_product_setting_id: string;
  precio_override: number | string | null;
  activo: boolean | null;
};

type LegacyCustomerProduct = {
  id: string;
  customer_id: string;
  product_id: string;
  precio_override: number | string | null;
  activo: boolean | null;
};

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
  if (text.includes('FRAPPE')) return 'FRAPPE';
  if (text.includes('ROLITO')) return 'ROLITO';
  if (text.includes('NORMAL')) return 'ROLITO';

  return text
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function toNumber(value: unknown): number {
  if (value === null || value === undefined || value === '') {
    return 0;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : 0;
}

function nullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : null;
}

function kgFromText(value: unknown): number {
  const text = normalize(value);
  const match = text.match(/(\d+(?:\.\d+)?)\s*KG/);

  if (!match?.[1]) return 0;

  return toNumber(match[1]);
}

function resolveCatalogProductKg(product: SupabaseProduct): number {
  const nameKg = kgFromText(product.nombre);

  if (nameKg > 0) return nameKg;

  return toNumber(product.kg_por_unidad);
}

function resolveCatalogProductIceType(
  product: SupabaseProduct,
): string {
  const name = normalize(product.nombre);
  let iceType = normalizeIceType(product.ice_type);

  if (!iceType) {
    if (name.includes('BARRA')) iceType = 'BARRA';
    else if (name.includes('GOURMET')) iceType = 'GOURMET';
    else if (name.includes('ENFRIAR')) iceType = 'ENFRIAR';
    else if (name.includes('FRAPPE')) iceType = 'FRAPPE';
    else iceType = 'ROLITO';
  }

  return iceType;
}

function buildInventorySettingKey(params: {
  bolsaVaciaCodigo: unknown;
  tipoHielo: unknown;
  pesoKg: unknown;
}): string {
  const codigo = normalize(params.bolsaVaciaCodigo);
  const tipoHielo = normalizeIceType(params.tipoHielo);
  const pesoKg = toNumber(params.pesoKg);

  const kgText =
    pesoKg > 0
      ? Number.isInteger(pesoKg)
        ? String(Math.trunc(pesoKg))
        : String(pesoKg)
      : '';

  return [codigo, tipoHielo, kgText]
    .filter(Boolean)
    .join('__');
}

function inventoryMatchesSetting(
  inventory: ProductionInventoryProduct,
  setting: InventorySetting,
): boolean {
  const inventoryKey = buildInventorySettingKey({
    bolsaVaciaCodigo:
      inventory.bolsaVaciaCodigo ?? inventory.codigo,
    tipoHielo: inventory.tipoHielo,
    pesoKg: inventory.pesoKg,
  });

  const settingKey = buildInventorySettingKey({
    bolsaVaciaCodigo:
      setting.firebase_bolsa_vacia_codigo,
    tipoHielo: setting.firebase_tipo_hielo,
    pesoKg: setting.peso_kg,
  });

  if (inventory.kind === 'BARRA') {
    return normalizeIceType(
      setting.firebase_tipo_hielo,
    ) === 'BARRA';
  }

  return inventoryKey === settingKey;
}

function catalogProductMatchesSetting(
  product: SupabaseProduct,
  setting: InventorySetting,
): boolean {
  const productIceType =
    resolveCatalogProductIceType(product);

  const settingIceType = normalizeIceType(
    setting.firebase_tipo_hielo,
  );

  if (settingIceType === 'BARRA') {
    return (
      productIceType === 'BARRA' ||
      normalize(product.nombre).includes('BARRA') ||
      normalize(product.kind).includes('BARRA')
    );
  }

  const productKg = resolveCatalogProductKg(product);
  const settingKg = toNumber(setting.peso_kg);

  return (
    productIceType === settingIceType &&
    settingKg > 0 &&
    Math.abs(productKg - settingKg) < 0.001
  );
}

function publicPrice(params: {
  setting: InventorySetting;
  product: SupabaseProduct;
}): number {
  const settingPrice = toNumber(
    params.setting.precio_base,
  );

  if (settingPrice > 0) {
    return settingPrice;
  }

  return toNumber(params.product.precio_base);
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
  });
}

export async function GET(req: Request) {
  try {
    const sb = getAdminSupabase();
    const { searchParams } = new URL(req.url);

    const saleType = normalize(
      searchParams.get('sale_type') || 'PUBLIC',
    );

    const customerId = clean(
      searchParams.get('customer_id'),
    );

    if (
      saleType !== 'PUBLIC' &&
      saleType !== 'CUSTOMER'
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            'sale_type debe ser PUBLIC o CUSTOMER',
        },
        {
          status: 400,
        },
      );
    }

    if (saleType === 'CUSTOMER' && !customerId) {
      return NextResponse.json(
        {
          ok: false,
          error:
            'Falta customer_id para venta a cliente',
        },
        {
          status: 400,
        },
      );
    }

    const [
      inventoryProducts,
      settingsResult,
      productsResult,
    ] = await Promise.all([
      getProductionInventoryProducts(),

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
        .eq('activo', true)
        .order('nombre_comercial', {
          ascending: true,
        }),

      sb
        .from('products')
        .select(
          `
          id,
          nombre,
          activo,
          precio_base,
          kind,
          ice_type,
          kg_por_unidad
        `,
        )
        .eq('activo', true)
        .order('nombre', {
          ascending: true,
        }),
    ]);

    if (settingsResult.error) {
      throw settingsResult.error;
    }

    if (productsResult.error) {
      throw productsResult.error;
    }

    const settings = (
      settingsResult.data ?? []
    ) as InventorySetting[];

    const products = (
      productsResult.data ?? []
    ) as SupabaseProduct[];

    let customerInventoryRows:
      | CustomerInventoryProduct[] = [];

    let legacyCustomerRows:
      | LegacyCustomerProduct[] = [];

    if (saleType === 'CUSTOMER') {
      const [
        customerInventoryResult,
        legacyCustomerResult,
      ] = await Promise.all([
        sb
          .from('customer_inventory_products')
          .select(
            `
            id,
            customer_id,
            inventory_product_setting_id,
            precio_override,
            activo
          `,
          )
          .eq('customer_id', customerId)
          .eq('activo', true),

        sb
          .from('customer_products')
          .select(
            `
            id,
            customer_id,
            product_id,
            precio_override,
            activo
          `,
          )
          .eq('customer_id', customerId)
          .eq('activo', true),
      ]);

      if (customerInventoryResult.error) {
        throw customerInventoryResult.error;
      }

      if (legacyCustomerResult.error) {
        throw legacyCustomerResult.error;
      }

      customerInventoryRows = (
        customerInventoryResult.data ?? []
      ) as CustomerInventoryProduct[];

      legacyCustomerRows = (
        legacyCustomerResult.data ?? []
      ) as LegacyCustomerProduct[];
    }

    const customerInventoryBySettingId = new Map<
      string,
      CustomerInventoryProduct
    >();

    for (const row of customerInventoryRows) {
      customerInventoryBySettingId.set(
        row.inventory_product_setting_id,
        row,
      );
    }

    const legacyCustomerByProductId = new Map<
      string,
      LegacyCustomerProduct
    >();

    for (const row of legacyCustomerRows) {
      legacyCustomerByProductId.set(
        row.product_id,
        row,
      );
    }

    const rows = settings
      .map((setting) => {
        const inventory = inventoryProducts.find(
          (item) =>
            inventoryMatchesSetting(
              item,
              setting,
            ),
        );

        if (!inventory) {
          return null;
        }

        const product = products.find((item) =>
          catalogProductMatchesSetting(
            item,
            setting,
          ),
        );

        if (!product) {
          return null;
        }

        const inventoryCustomerRow =
          customerInventoryBySettingId.get(
            setting.id,
          );

        const legacyCustomerRow =
          legacyCustomerByProductId.get(
            product.id,
          );

        if (saleType === 'CUSTOMER') {
          const customerHasNewSetting =
            Boolean(inventoryCustomerRow);

          const customerHasLegacyProduct =
            Boolean(legacyCustomerRow);

          if (
            !customerHasNewSetting &&
            !customerHasLegacyProduct
          ) {
            return null;
          }
        }

        const overrideFromNew =
          nullableNumber(
            inventoryCustomerRow?.precio_override,
          );

        const overrideFromLegacy =
          nullableNumber(
            legacyCustomerRow?.precio_override,
          );

        const basePrice = publicPrice({
          setting,
          product,
        });

        const finalPrice =
          overrideFromNew ??
          overrideFromLegacy ??
          basePrice;

        const priceSource =
          overrideFromNew !== null
            ? 'CUSTOMER_INVENTORY_OVERRIDE'
            : overrideFromLegacy !== null
              ? 'CUSTOMER_PRODUCT_OVERRIDE'
              : setting.precio_base !== null
                ? 'INVENTORY_SETTING_BASE'
                : 'PRODUCT_BASE';

        return {
          product_id: product.id,

          inventory_product_setting_id:
            setting.id,

          inventory_document_id:
            inventory.documentId,

          inventory_key:
            inventory.inventoryKey,

          product_key:
            inventory.productKey,

          inventory_code:
            inventory.bolsaVaciaCodigo ??
            inventory.codigo,

          codigo: inventory.codigo,

          nombre:
            setting.nombre_comercial ||
            product.nombre ||
            inventory.nombreComercial,

          kind: inventory.kind,

          ice_type: inventory.tipoHielo,

          tipoHielo: inventory.tipoHielo,

          kg_por_unidad:
            inventory.pesoKg,

          pesoKg:
            inventory.pesoKg,

          precio:
            Number(finalPrice),

          precio_override:
            overrideFromNew ??
            overrideFromLegacy,

          precio_base_setting:
            toNumber(setting.precio_base),

          precio_base_product:
            toNumber(product.precio_base),

          has_override:
            overrideFromNew !== null ||
            overrideFromLegacy !== null,

          price_source:
            priceSource,

          stock_actual:
            inventory.stockActual,

          available_qty:
            inventory.availableQty,

          cuartos_disponibles:
            inventory.cuartosDisponibles,

          cantidad_barras_equivalente:
            inventory.cantidadBarrasEquivalente,

          customer_inventory_product_id:
            inventoryCustomerRow?.id ?? null,

          customer_product_id:
            legacyCustomerRow?.id ?? null,

          customer_id:
            saleType === 'CUSTOMER'
              ? customerId
              : null,

          sale_type:
            saleType,
        };
      })
      .filter(
        (
          row,
        ): row is NonNullable<typeof row> =>
          row !== null &&
          row.available_qty > 0 &&
          row.precio >= 0,
      )
      .sort((a, b) => {
        if (
          b.available_qty !==
          a.available_qty
        ) {
          return (
            b.available_qty -
            a.available_qty
          );
        }

        return a.nombre.localeCompare(
          b.nombre,
          'es',
        );
      });

    return NextResponse.json({
      ok: true,
      data: rows,
      meta: {
        sale_type: saleType,
        customer_id:
          saleType === 'CUSTOMER'
            ? customerId
            : null,
        inventory_products:
          inventoryProducts.length,
        settings: settings.length,
        catalog_products:
          products.length,
        returned_products:
          rows.length,
        updated_at:
          new Date().toISOString(),
      },
    });
  } catch (error: unknown) {
    console.error(
      '[production-sales/products] error:',
      error,
    );

    const message =
      error instanceof Error
        ? error.message
        : 'Error cargando productos de Producción';

    return NextResponse.json(
      {
        ok: false,
        error: message,
      },
      {
        status: 500,
      },
    );
  }
}