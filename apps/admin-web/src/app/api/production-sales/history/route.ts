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
  precio_aplicado: number;
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

function buildErrorResponse(
  error: unknown,
  fallbackMessage: string,
) {
  const message =
    getErrorField(error, 'message') ||
    (error instanceof Error
      ? error.message
      : fallbackMessage);

  const code = getErrorField(error, 'code');
  const details = getErrorField(error, 'details');
  const hint = getErrorField(error, 'hint');

  return NextResponse.json(
    {
      ok: false,
      error: message,
      code: code || null,
      details: details || null,
      hint: hint || null,
    },
    {
      status: 500,
    },
  );
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
        total_expected,
        total_real,
        status,
        delivery_type,
        production_employee_id,
        production_employee_name,
        delivered_at,
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
        qty_assigned,
        qty_real,
        precio_aplicado,
        subtotal_expected,
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
        .select('id,nombre')
        .in('id', productIds);

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
            item.qty_real ??
              item.qty_assigned,
          ),
        ),
      );

      const unitPrice = toNumber(
        item.precio_aplicado,
      );

      const storedSubtotalReal = toNumber(
        item.subtotal_real,
      );

      const storedSubtotalExpected =
        toNumber(
          item.subtotal_expected,
        );

      const subtotal =
        storedSubtotalReal > 0
          ? storedSubtotalReal
          : storedSubtotalExpected > 0
            ? storedSubtotalExpected
            : quantity * unitPrice;

      const currentItems =
        itemsByDeliveryId.get(
          deliveryId,
        ) ?? [];

      currentItems.push({
        id: clean(item.id),
        product_id: productId,
        product_name:
          productNameById.get(
            productId,
          ) ??
          'Producto',
        quantity,
        unit_price: unitPrice,
        precio_aplicado: unitPrice,
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

        const storedTotalReal =
          toNumber(
            rawSale.total_real,
          );

        const storedTotalExpected =
          toNumber(
            rawSale.total_expected,
          );

        const total =
          storedTotalReal > 0
            ? storedTotalReal
            : storedTotalExpected > 0
              ? storedTotalExpected
              : calculatedItemsTotal;

        const customerId =
          rawSale.customer_id
            ? clean(
                rawSale.customer_id,
              )
            : null;

        const employeeId =
          clean(
            rawSale.production_employee_id,
          ) ||
          null;

        const employeeName =
          clean(
            rawSale.production_employee_name,
          ) ||
          'Producción';

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

          employee_id:
            employeeId,

          employee_name:
            employeeName,

          production_employee_id:
            employeeId,

          production_employee_name:
            employeeName,

          payment_method:
            clean(
              rawSale.payment_method,
            ) ||
            'EFECTIVO',

          subtotal:
            total,

          total,

          total_real:
            total,

          total_expected:
            storedTotalExpected,

          status:
            clean(
              rawSale.status,
            ) ||
            'ENTREGADA',

          sale_type:
            customerId
              ? 'CUSTOMER'
              : 'PUBLIC',

          delivery_type:
            clean(
              rawSale.delivery_type,
            ) ||
            'production_sale',

          delivered_at:
            rawSale.delivered_at,

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
      '[production-sales/history GET] error:',
      error,
    );

    return buildErrorResponse(
      error,
      'Error cargando historial de ventas',
    );
  }
}

export async function DELETE(req: Request) {
  try {
    const sb = getAdminSupabase();

    let body: unknown;

    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        {
          ok: false,
          error:
            'El cuerpo de la solicitud no es válido.',
        },
        {
          status: 400,
        },
      );
    }

    const saleId = clean(
      (
        body as Record<string, unknown> | null
      )?.sale_id,
    );

    if (!saleId) {
      return NextResponse.json(
        {
          ok: false,
          error:
            'Falta sale_id.',
        },
        {
          status: 400,
        },
      );
    }

    const {
      data: sale,
      error: saleError,
    } = await sb
      .from('deliveries')
      .select(
        `
        id,
        folio,
        delivery_type
      `,
      )
      .eq(
        'id',
        saleId,
      )
      .maybeSingle();

    if (saleError) {
      throw saleError;
    }

    if (!sale) {
      return NextResponse.json(
        {
          ok: false,
          error:
            'La venta no existe o ya fue eliminada.',
        },
        {
          status: 404,
        },
      );
    }

    if (
      clean(sale.delivery_type) !==
      'production_sale'
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            'Solo se pueden eliminar ventas creadas por Producción.',
        },
        {
          status: 400,
        },
      );
    }

    const {
      error: itemsDeleteError,
    } = await sb
      .from('delivery_items')
      .delete()
      .eq(
        'delivery_id',
        saleId,
      );

    if (itemsDeleteError) {
      throw itemsDeleteError;
    }

    const {
      error: saleDeleteError,
    } = await sb
      .from('deliveries')
      .delete()
      .eq(
        'id',
        saleId,
      )
      .eq(
        'delivery_type',
        'production_sale',
      );

    if (saleDeleteError) {
      throw saleDeleteError;
    }

    return NextResponse.json({
      ok: true,

      message:
        'Venta eliminada correctamente.',

      deleted_sale_id:
        saleId,

      deleted_folio:
        clean(sale.folio) ||
        null,
    });
  } catch (error: unknown) {
    console.error(
      '[production-sales/history DELETE] error:',
      error,
    );

    return buildErrorResponse(
      error,
      'No se pudo eliminar la venta',
    );
  }
}