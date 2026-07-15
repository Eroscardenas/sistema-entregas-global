import { NextResponse } from 'next/server';

import { getAdminSupabase } from '@/lib/server/supabaseAdmin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type ProductRow = {
  id: string;
  nombre: string | null;
};

type HistoryItem = {
  id: string;
  product_id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
};

function clean(value: unknown): string {
  return String(value ?? '').trim();
}

function toNumber(value: unknown): number {
  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : 0;
}

function toPositiveInt(
  value: unknown,
  fallback: number,
): number {
  const parsed = Math.trunc(toNumber(value));

  return parsed > 0 ? parsed : fallback;
}

function getErrorField(
  error: unknown,
  field: 'message' | 'code' | 'details' | 'hint',
): string {
  if (
    error &&
    typeof error === 'object' &&
    field in error
  ) {
    return clean(
      (error as Record<string, unknown>)[field],
    );
  }

  return '';
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

    const limit = Math.min(
      toPositiveInt(
        searchParams.get('limit'),
        100,
      ),
      300,
    );

    /*
     * Solo consulta ventas creadas por el módulo
     * de Producción.
     *
     * IMPORTANTE:
     * La tabla deliveries usa total_real.
     * No existen subtotal_real, total ni notes
     * dentro de deliveries.
     */
    const {
      data: deliveries,
      error: deliveriesError,
    } = await sb
      .from('deliveries')
      .select(
        `
        id,
        folio,
        customer_id,
        customer_nombre_snapshot,
        payment_method,
        total_real,
        status,
        delivery_type,
        created_at
      `,
      )
      .eq(
        'delivery_type',
        'production_sale',
      )
      .order(
        'created_at',
        {
          ascending: false,
        },
      )
      .limit(limit);

    if (deliveriesError) {
      throw deliveriesError;
    }

    const rows = deliveries ?? [];

    const deliveryIds = rows
      .map((row: Record<string, unknown>) =>
        clean(row.id),
      )
      .filter(Boolean);

    if (deliveryIds.length === 0) {
      return NextResponse.json({
        ok: true,
        data: [],
        meta: {
          total_sales: 0,
          total_quantity: 0,
          total_amount: 0,
        },
      });
    }

    /*
     * Consulta las partidas de cada venta.
     */
    const {
      data: deliveryItems,
      error: itemsError,
    } = await sb
      .from('delivery_items')
      .select(
        `
        id,
        delivery_id,
        product_id,
        qty_real,
        unit_price,
        subtotal_real
      `,
      )
      .in(
        'delivery_id',
        deliveryIds,
      );

    if (itemsError) {
      throw itemsError;
    }

    const productIds = Array.from(
      new Set(
        (deliveryItems ?? [])
          .map((item: Record<string, unknown>) =>
            clean(item.product_id),
          )
          .filter(Boolean),
      ),
    );

    let products: ProductRow[] = [];

    if (productIds.length > 0) {
      const {
        data: productsData,
        error: productsError,
      } = await sb
        .from('products')
        .select(
          'id,nombre',
        )
        .in(
          'id',
          productIds,
        );

      if (productsError) {
        throw productsError;
      }

      products =
        (productsData ?? []) as ProductRow[];
    }

    const productNameById =
      new Map<string, string>(
        products.map((product) => [
          clean(product.id),
          clean(product.nombre) ||
            'Producto',
        ]),
      );

    const itemsByDeliveryId =
      new Map<string, HistoryItem[]>();

    for (
      const rawItem of deliveryItems ?? []
    ) {
      const item =
        rawItem as Record<string, unknown>;

      const deliveryId = clean(
        item.delivery_id,
      );

      const productId = clean(
        item.product_id,
      );

      const quantity = Math.max(
        0,
        Math.trunc(
          toNumber(
            item.qty_real,
          ),
        ),
      );

      const unitPrice = toNumber(
        item.unit_price,
      );

      const storedSubtotal = toNumber(
        item.subtotal_real,
      );

      const subtotal =
        storedSubtotal > 0
          ? storedSubtotal
          : quantity * unitPrice;

      const currentItems =
        itemsByDeliveryId.get(
          deliveryId,
        ) ?? [];

      currentItems.push({
        id: clean(
          item.id,
        ),

        product_id:
          productId,

        product_name:
          productNameById.get(
            productId,
          ) ??
          'Producto',

        quantity,

        unit_price:
          unitPrice,

        subtotal,
      });

      itemsByDeliveryId.set(
        deliveryId,
        currentItems,
      );
    }

    const data = rows.map(
      (
        rawSale: Record<string, unknown>,
      ) => {
        const id = clean(
          rawSale.id,
        );

        const items =
          itemsByDeliveryId.get(id) ??
          [];

        const totalQuantity =
          items.reduce(
            (
              sum,
              item,
            ) =>
              sum +
              item.quantity,
            0,
          );

        const calculatedItemsTotal =
          items.reduce(
            (
              sum,
              item,
            ) =>
              sum +
              item.subtotal,
            0,
          );

        const storedTotal = toNumber(
          rawSale.total_real,
        );

        const total =
          storedTotal > 0
            ? storedTotal
            : calculatedItemsTotal;

        const customerId =
          rawSale.customer_id
            ? clean(
                rawSale.customer_id,
              )
            : null;

        return {
          id,
          sale_id: id,

          folio:
            clean(
              rawSale.folio,
            ) ||
            'VENTA',

          customer_id:
            customerId,

          customer_name:
            clean(
              rawSale.customer_nombre_snapshot,
            ) ||
            'Público general',

          payment_method:
            clean(
              rawSale.payment_method,
            ) ||
            'EFECTIVO',

          subtotal:
            total,

          total,

          status:
            clean(
              rawSale.status,
            ) ||
            'ENTREGADA',

          sale_type:
            customerId
              ? 'CUSTOMER'
              : 'PUBLIC',

          created_at:
            rawSale.created_at,

          total_quantity:
            totalQuantity,

          items,
        };
      },
    );

    const totalQuantity =
      data.reduce(
        (
          sum,
          sale,
        ) =>
          sum +
          sale.total_quantity,
        0,
      );

    const totalAmount =
      data.reduce(
        (
          sum,
          sale,
        ) =>
          sum +
          sale.total,
        0,
      );

    return NextResponse.json({
      ok: true,

      data,

      meta: {
        total_sales:
          data.length,

        total_quantity:
          totalQuantity,

        total_amount:
          totalAmount,
      },
    });
  } catch (error: unknown) {
    console.error(
      '[production-sales/history] error:',
      error,
    );

    const message =
      getErrorField(
        error,
        'message',
      ) ||
      (error instanceof Error
        ? error.message
        : 'Error cargando historial de ventas');

    const code =
      getErrorField(
        error,
        'code',
      );

    const details =
      getErrorField(
        error,
        'details',
      );

    const hint =
      getErrorField(
        error,
        'hint',
      );

    return NextResponse.json(
      {
        ok: false,

        error:
          message,

        code:
          code || null,

        details:
          details || null,

        hint:
          hint || null,
      },
      {
        status: 500,
      },
    );
  }
}