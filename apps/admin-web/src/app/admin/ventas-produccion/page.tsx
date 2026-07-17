"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  CalendarDays,
  CircleDollarSign,
  FileText,
  Filter,
  Package,
  Printer,
  RefreshCw,
  Search,
  UserRound,
  Users,
  WalletCards,
} from "lucide-react";

import { useAdminGuard } from "@/lib/hooks/useAdminGuard";

type ProductionSaleItem = {
  id?: string | null;
  product_id?: string | null;
  product_name?: string | null;
  name?: string | null;
  nombre?: string | null;
  quantity?: number | string | null;
  qty?: number | string | null;
  unit_price?: number | string | null;
  precio_aplicado?: number | string | null;
  precio?: number | string | null;
  subtotal?: number | string | null;
  subtotal_real?: number | string | null;
  subtotal_expected?: number | string | null;
};

type ProductionSale = {
  id: string;
  sale_id?: string | null;
  folio?: string | null;
  customer_id?: string | null;
  customer_name?: string | null;
  production_employee_id?: string | null;
  production_employee_name?: string | null;
  employee_id?: string | null;
  employee_name?: string | null;
  payment_method?: string | null;
  subtotal?: number | string | null;
  total?: number | string | null;
  total_quantity?: number | string | null;
  status?: string | null;
  sale_type?: string | null;
  created_at?: string | null;
  items?: ProductionSaleItem[] | null;
};

type ProductionSalesHistoryResponse = {
  ok: boolean;
  data?: ProductionSale[];
  error?: string;
};

type ProductionEmployee = {
  id: string;
  document_id: string;
  codigo: string;
  nombre: string;
  role: string;
};

type ProductionEmployeesResponse = {
  ok: boolean;
  data?: ProductionEmployee[];
  error?: string;
};

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function safeNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toLocalDateInput(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatMoney(value: unknown) {
  return safeNumber(value, 0).toLocaleString("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("es-MX", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function normalizeText(value?: string | null) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getEmployeeId(sale: ProductionSale) {
  return (
    String(sale.production_employee_id || sale.employee_id || "").trim() ||
    null
  );
}

function getEmployeeName(sale: ProductionSale) {
  return (
    String(
      sale.production_employee_name || sale.employee_name || "",
    ).trim() || "Empleado no identificado"
  );
}

function getCustomerName(sale: ProductionSale) {
  return String(sale.customer_name || "").trim() || "Público general";
}

function getProductName(item: ProductionSaleItem) {
  return (
    String(item.product_name || item.nombre || item.name || "").trim() ||
    "Producto"
  );
}

function getItemQuantity(item: ProductionSaleItem) {
  return Math.max(
    0,
    Math.trunc(safeNumber(item.quantity ?? item.qty, 0)),
  );
}

function getItemUnitPrice(item: ProductionSaleItem) {
  return safeNumber(
    item.precio_aplicado ??
      item.unit_price ??
      item.precio,
    0,
  );
}

function getItemSubtotal(item: ProductionSaleItem) {
  const stored = safeNumber(
    item.subtotal ??
      item.subtotal_real ??
      item.subtotal_expected,
    0,
  );
  if (stored > 0) return stored;
  return getItemQuantity(item) * getItemUnitPrice(item);
}

function getSaleQuantity(sale: ProductionSale) {
  const stored = safeNumber(sale.total_quantity, 0);
  if (stored > 0) return Math.trunc(stored);

  return (sale.items ?? []).reduce(
    (total, item) => total + getItemQuantity(item),
    0,
  );
}

function getSaleTotal(sale: ProductionSale) {
  const stored = safeNumber(sale.total, 0);
  if (stored > 0) return stored;

  return (sale.items ?? []).reduce(
    (total, item) => total + getItemSubtotal(item),
    0,
  );
}

function moneyPlain(value: unknown) {
  return safeNumber(value, 0).toLocaleString("es-MX", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatOnlyDate(value?: string | null) {
  if (!value) return "—";

  const date = new Date(`${value}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("es-MX", {
    dateStyle: "medium",
  }).format(date);
}

function normalizeIceTypeForPdf(value?: string | null) {
  const text = normalizeText(value);

  if (!text) return "";
  if (text.includes("BARRA")) return "BARRA";
  if (text.includes("GOURMET")) return "GOURMET";
  if (text.includes("FRAP")) return "FRAP";
  if (text.includes("ENFRIAR")) return "ENFRIAR";
  if (text.includes("ROLITO")) return "ROLITO";
  if (text.includes("NORMAL")) return "ROLITO";

  return text
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function extractKgForPdf(
  ...values: Array<string | number | null | undefined>
) {
  for (const value of values) {
    if (
      typeof value === "number" &&
      Number.isFinite(value) &&
      value > 0
    ) {
      return Number.isInteger(value)
        ? String(value)
        : String(value).replace(/\.0+$/, "");
    }

    const text = normalizeText(String(value ?? ""));
    const match = text.match(
      /(\d+(?:\.\d+)?)\s*(?:KG|KILO|KILOS)/,
    );

    if (match?.[1]) {
      return match[1].replace(/\.0+$/, "");
    }
  }

  return "";
}

function buildProductionProductKey(
  item: ProductionSaleItem,
) {
  const name = normalizeText(getProductName(item));

  if (name.includes("BARRA")) {
    return "BARRA";
  }

  let iceType = "";

  if (name.includes("GOURMET")) {
    iceType = "GOURMET";
  } else if (name.includes("FRAP")) {
    iceType = "FRAP";
  } else if (name.includes("ENFRIAR")) {
    iceType = "ENFRIAR";
  } else if (
    name.includes("ROLITO") ||
    name.includes("NORMAL") ||
    name.includes("BOLSA") ||
    name.includes("HIELO")
  ) {
    iceType = "ROLITO";
  }

  iceType =
    normalizeIceTypeForPdf(iceType || name) ||
    "PRODUCTO";

  const kg = extractKgForPdf(name);

  if (iceType === "BARRA") {
    return "BARRA";
  }

  if (kg) {
    return `${iceType}_${kg}`;
  }

  return name
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") ||
    String(item.product_id || "PRODUCTO").toUpperCase();
}

function labelFromProductionProductKey(
  key: string,
  fallback?: string | null,
) {
  const normalized = normalizeText(key).replace(/\s+/g, "_");

  if (normalized === "BARRA") {
    return "BARRA";
  }

  const parts = normalized.split("_");
  const kg = parts.at(-1);
  const type = parts.slice(0, -1).join(" ");

  if (type && kg && /^\d+(?:\.\d+)?$/.test(kg)) {
    return `${type === "FRAPPE" ? "FRAP" : type} ${kg}KG`;
  }

  return normalizeText(fallback || key || "PRODUCTO");
}

function productSortWeightForProductionPdf(key: string) {
  const order = [
    "ROLITO_3",
    "ROLITO_5",
    "ROLITO_15",
    "FRAP_5",
    "FRAP_15",
    "BARRA",
    "GOURMET_5",
    "ENFRIAR_5",
  ];

  const index = order.indexOf(
    String(key || "").toUpperCase(),
  );

  return index === -1 ? 999 : index;
}

const PRODUCTION_PDF_PRODUCTS = [
  { key: "ROLITO_3", label: "ROLITO 3KG" },
  { key: "ROLITO_5", label: "ROLITO 5KG" },
  { key: "ROLITO_15", label: "ROLITO 15KG" },
  { key: "FRAP_5", label: "FRAP 5KG" },
  { key: "FRAP_15", label: "FRAP 15KG" },
  { key: "BARRA", label: "BARRA" },
  { key: "GOURMET_5", label: "GOURMET 5KG" },
  { key: "ENFRIAR_5", label: "ENFRIAR 5KG" },
] as const;

export default function ProductionSalesAdminPage() {
  const router = useRouter();
  const guard = useAdminGuard();

  const [sales, setSales] = useState<ProductionSale[]>([]);
  const [employees, setEmployees] = useState<ProductionEmployee[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [selectedDate, setSelectedDate] = useState(toLocalDateInput(new Date()));
  const [selectedEmployee, setSelectedEmployee] = useState("ALL");
  const [selectedPayment, setSelectedPayment] = useState("ALL");
  const [query, setQuery] = useState("");

  const loadData = useCallback(async (refresh = false) => {
    try {
      refresh ? setRefreshing(true) : setLoading(true);
      setError("");

      const [salesResponse, employeesResponse] = await Promise.all([
        fetch(
          "/api/production-sales/history?limit=300",
          { method: "GET", cache: "no-store" },
        ),
        fetch(
          "/api/admin/production-employees",
          { method: "GET", cache: "no-store" },
        ),
      ]);

      const salesJson = (await salesResponse
        .json()
        .catch(() => null)) as ProductionSalesHistoryResponse | null;

      const employeesJson = (await employeesResponse
        .json()
        .catch(() => null)) as ProductionEmployeesResponse | null;

      if (!salesResponse.ok || salesJson?.ok !== true) {
        throw new Error(
          salesJson?.error ||
            `No se pudo cargar el historial (HTTP ${salesResponse.status}).`,
        );
      }

      if (!employeesResponse.ok || employeesJson?.ok !== true) {
        throw new Error(
          employeesJson?.error ||
            `No se pudieron cargar los empleados de Producción (HTTP ${employeesResponse.status}).`,
        );
      }

      setSales(Array.isArray(salesJson.data) ? salesJson.data : []);
      setEmployees(
        Array.isArray(employeesJson.data)
          ? [...employeesJson.data].sort((a, b) =>
              a.nombre.localeCompare(b.nombre, "es", {
                sensitivity: "base",
              }),
            )
          : [],
      );
    } catch (loadError: unknown) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "No se pudieron cargar las ventas y empleados de Producción.",
      );
      setSales([]);
      setEmployees([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (!guard.loading && guard.isAuthed) {
      loadData();
    }
  }, [guard.loading, guard.isAuthed, loadData]);



  const filteredSales = useMemo(() => {
    const normalizedQuery = normalizeText(query);

    return sales
      .filter((sale) => {
        const createdAt = sale.created_at ? new Date(sale.created_at) : null;
        const saleDate =
          createdAt && !Number.isNaN(createdAt.getTime())
            ? toLocalDateInput(createdAt)
            : "";

        if (selectedDate && saleDate !== selectedDate) return false;

        if (selectedEmployee !== "ALL") {
          const employeeId = getEmployeeId(sale);
          const selected = employees.find(
            (employee) => employee.id === selectedEmployee,
          );

          const matchesById =
            employeeId === selectedEmployee;

          const matchesByName =
            selected &&
            normalizeText(getEmployeeName(sale)) ===
              normalizeText(selected.nombre);

          if (!matchesById && !matchesByName) {
            return false;
          }
        }

        const payment = normalizeText(sale.payment_method || "EFECTIVO");
        if (selectedPayment !== "ALL" && payment !== selectedPayment) {
          return false;
        }

        if (!normalizedQuery) return true;

        const productText = (sale.items ?? [])
          .map((item) => getProductName(item))
          .join(" ");

        return normalizeText(
          [
            sale.folio,
            getCustomerName(sale),
            getEmployeeName(sale),
            sale.payment_method,
            productText,
          ].join(" "),
        ).includes(normalizedQuery);
      })
      .sort(
        (a, b) =>
          new Date(b.created_at || 0).getTime() -
          new Date(a.created_at || 0).getTime(),
      );
  }, [sales, employees, selectedDate, selectedEmployee, selectedPayment, query]);

  const totals = useMemo(() => {
    let quantity = 0;
    let efectivo = 0;
    let credito = 0;
    let total = 0;

    for (const sale of filteredSales) {
      const amount = getSaleTotal(sale);
      const payment = normalizeText(sale.payment_method || "EFECTIVO");

      quantity += getSaleQuantity(sale);
      total += amount;

      if (payment === "CREDITO") credito += amount;
      else efectivo += amount;
    }

    return {
      sales: filteredSales.length,
      quantity,
      efectivo,
      credito,
      total,
    };
  }, [filteredSales]);

  const selectedEmployeeName = useMemo(() => {
    if (selectedEmployee === "ALL") return "TODOS LOS EMPLEADOS";
    return employees.find((employee) => employee.id === selectedEmployee)?.nombre ||
      selectedEmployee;
  }, [selectedEmployee, employees]);

  const clearFilters = useCallback(() => {
    setSelectedDate(toLocalDateInput(new Date()));
    setSelectedEmployee("ALL");
    setSelectedPayment("ALL");
    setQuery("");
  }, []);

  const exportPdf = useCallback(() => {
    type PdfProductRow = {
      quantity: number;
      unitPrice: number;
    };

    type EmployeePdfGroup = {
      key: string;
      employeeId: string | null;
      employeeName: string;
      sales: ProductionSale[];
    };

    const productLabelByKey = new Map<string, string>(
      PRODUCTION_PDF_PRODUCTS.map((product) => [
        product.key,
        product.label,
      ]),
    );

    const productKeys = PRODUCTION_PDF_PRODUCTS
      .map((product) => product.key)
      .sort(
        (a, b) =>
          productSortWeightForProductionPdf(a) -
          productSortWeightForProductionPdf(b),
      );

    /*
     * El PDF se agrupa primero por empleado.
     *
     * Se usa el ID cuando la venta lo contiene. Cuando una venta antigua no
     * tiene ID, se usa el nombre normalizado para que no termine mezclada con
     * empleados diferentes.
     */
    const groupsMap = new Map<string, EmployeePdfGroup>();

    for (const sale of filteredSales) {
      const employeeId = getEmployeeId(sale);
      const employeeName = getEmployeeName(sale);

      const groupKey = employeeId
        ? `ID:${employeeId}`
        : `NAME:${normalizeText(employeeName)}`;

      const existing = groupsMap.get(groupKey);

      if (existing) {
        existing.sales.push(sale);
      } else {
        groupsMap.set(groupKey, {
          key: groupKey,
          employeeId,
          employeeName,
          sales: [sale],
        });
      }
    }

    const employeeGroups = Array.from(groupsMap.values()).sort((a, b) =>
      a.employeeName.localeCompare(b.employeeName, "es", {
        sensitivity: "base",
      }),
    );

    if (employeeGroups.length === 0) {
      window.alert("No hay ventas para exportar con los filtros seleccionados.");
      return;
    }

    const paymentFilterLabel =
      selectedPayment === "ALL"
        ? "TODOS"
        : selectedPayment;

    const headerTopHtml = productKeys
      .map((key) => {
        const label =
          productLabelByKey.get(key) ||
          labelFromProductionProductKey(key);

        return `
          <th colspan="2" class="center product-group">
            ${escapeHtml(label)}
          </th>
        `;
      })
      .join("");

    const headerSubHtml = productKeys
      .map(
        () => `
          <th class="center mini-col qty-subcol">CANT.</th>
          <th class="center mini-col price-subcol">PRECIO</th>
        `,
      )
      .join("");

    const employeeSheetsHtml = employeeGroups
      .map((group, groupIndex) => {
        const soldByProduct = new Map<string, number>();

        for (const key of productKeys) {
          soldByProduct.set(key, 0);
        }

        let employeeTotalQuantity = 0;
        let employeeTotalEfectivo = 0;
        let employeeTotalCredito = 0;
        let employeeTotalVenta = 0;

        const employeeSales = [...group.sales].sort(
          (a, b) =>
            new Date(a.created_at || 0).getTime() -
            new Date(b.created_at || 0).getTime(),
        );

        const rowsHtml = employeeSales
          .map((sale, index) => {
            const rowByProduct = new Map<string, PdfProductRow>();

            for (const key of productKeys) {
              rowByProduct.set(key, {
                quantity: 0,
                unitPrice: 0,
              });
            }

            for (const item of sale.items ?? []) {
              const key = buildProductionProductKey(item);

              /*
               * El formato operativo solamente contempla los productos
               * definidos en PRODUCTION_PDF_PRODUCTS. Los artículos que no
               * coincidan con el catálogo no se meten en una columna
               * incorrecta.
               */
              if (!key || !rowByProduct.has(key)) {
                continue;
              }

              const quantity = getItemQuantity(item);
              const unitPrice = getItemUnitPrice(item);
              const current = rowByProduct.get(key)!;

              current.quantity += quantity;

              if (unitPrice > 0 && current.unitPrice <= 0) {
                current.unitPrice = unitPrice;
              }

              soldByProduct.set(
                key,
                (soldByProduct.get(key) ?? 0) + quantity,
              );
            }

            const saleQuantity = getSaleQuantity(sale);
            const saleTotal = getSaleTotal(sale);
            const paymentMethod = normalizeText(
              sale.payment_method || "EFECTIVO",
            );

            employeeTotalQuantity += saleQuantity;
            employeeTotalVenta += saleTotal;

            if (paymentMethod === "CREDITO") {
              employeeTotalCredito += saleTotal;
            } else {
              employeeTotalEfectivo += saleTotal;
            }

            const productCells = productKeys
              .map((key) => {
                const row = rowByProduct.get(key) ?? {
                  quantity: 0,
                  unitPrice: 0,
                };

                const quantityLabel =
                  row.quantity > 0
                    ? String(row.quantity)
                    : "-";

                const priceLabel =
                  row.quantity > 0 && row.unitPrice > 0
                    ? `$ ${moneyPlain(row.unitPrice)}`
                    : "-";

                return `
                  <td class="center qty-cell qty-subcol">
                    <div class="cell-qty ${
                      quantityLabel === "-"
                        ? "dash-cell"
                        : ""
                    }">
                      ${quantityLabel}
                    </div>
                  </td>

                  <td class="center price-cell price-subcol">
                    <div class="cell-price ${
                      priceLabel === "-"
                        ? "dash-cell"
                        : ""
                    }">
                      ${priceLabel}
                    </div>
                  </td>
                `;
              })
              .join("");

            const efectivo =
              paymentMethod === "CREDITO"
                ? 0
                : saleTotal;

            const credito =
              paymentMethod === "CREDITO"
                ? saleTotal
                : 0;

            return `
              <tr>
                <td class="center">${index + 1}</td>

                <td>
                  ${escapeHtml(
                    String(sale.folio || "VENTA"),
                  )}
                </td>

                <td class="client-name">
                  ${escapeHtml(getCustomerName(sale))}
                </td>

                ${productCells}

                <td class="money">
                  ${
                    efectivo > 0
                      ? `$ ${moneyPlain(efectivo)}`
                      : ""
                  }
                </td>

                <td class="money">
                  ${
                    credito > 0
                      ? `$ ${moneyPlain(credito)}`
                      : ""
                  }
                </td>
              </tr>
            `;
          })
          .join("");

        const minimumRows = 22;

        const blankRowsCount = Math.max(
          0,
          minimumRows - employeeSales.length,
        );

        const blankProductCells = productKeys
          .map(() => "<td></td><td></td>")
          .join("");

        const blankRowsHtml = Array.from({
          length: blankRowsCount,
        })
          .map(
            (_, index) => `
              <tr>
                <td class="center">
                  ${employeeSales.length + index + 1}
                </td>

                <td></td>
                <td></td>

                ${blankProductCells}

                <td class="money">
                  ${index === 0 ? "$ -" : ""}
                </td>

                <td class="money">
                  ${index === 0 ? "$ -" : ""}
                </td>
              </tr>
            `,
          )
          .join("");

        const productSummaryCells = productKeys
          .map((key) => {
            const quantity = soldByProduct.get(key) ?? 0;

            return `
              <td
                colspan="2"
                class="center summary-qty summary-merge-cell ${
                  quantity <= 0
                    ? "dash-cell"
                    : ""
                }"
              >
                ${quantity > 0 ? quantity : "-"}
              </td>
            `;
          })
          .join("");

        const summarySpacerCells = productKeys
          .map(() => '<td colspan="2"></td>')
          .join("");

        const summaryRowsHtml = `
          <tr class="summary-spacer-row">
            <td colspan="3"></td>
            ${summarySpacerCells}
            <td></td>
            <td></td>
          </tr>

          <tr class="summary-row summary-row-dark">
            <th
              colspan="3"
              class="summary-label summary-label-dark"
            >
              PRODUCTOS VENDIDOS:
            </th>

            ${productSummaryCells}

            <td class="summary-end-dark"></td>
            <td class="summary-end-dark"></td>
          </tr>
        `;

        return `
          <section
            class="sheet ${
              groupIndex < employeeGroups.length - 1
                ? "page-break"
                : ""
            }"
          >
            <div class="top">
              <div class="left-meta">
NOMBRE: ${escapeHtml(group.employeeName)}
FECHA: ${escapeHtml(formatOnlyDate(selectedDate))}
              </div>

              <div class="center-meta">
                <div class="title">
                  ${escapeHtml(group.employeeName.toUpperCase())}
                </div>

                <div>
                  ${escapeHtml(formatOnlyDate(selectedDate))}
                </div>

                <div class="report-name">
                  VENTAS DE PRODUCCIÓN
                </div>
              </div>

              <div class="right-meta">
EMPRESA: GLOBAL ICE DE MÉXICO
FECHA: ${escapeHtml(formatOnlyDate(selectedDate))}
EMPLEADO: ${escapeHtml(group.employeeName)}
MÉTODO DE PAGO: ${escapeHtml(paymentFilterLabel)}
VENTAS: ${employeeSales.length}
PRODUCTOS: ${employeeTotalQuantity}
              </div>
            </div>

            <table>
              <thead>
                <tr>
                  <th
                    rowspan="2"
                    style="width: 24px;"
                  >
                    N°
                  </th>

                  <th
                    rowspan="2"
                    style="width: 76px;"
                  >
                    FOLIO
                  </th>

                  <th
                    rowspan="2"
                    style="width: 220px;"
                  >
                    CLIENTE
                  </th>

                  ${headerTopHtml}

                  <th
                    rowspan="2"
                    style="width: 78px;"
                  >
                    EFECTIVO
                  </th>

                  <th
                    rowspan="2"
                    style="width: 78px;"
                  >
                    CRÉDITO
                  </th>
                </tr>

                <tr>
                  ${headerSubHtml}
                </tr>
              </thead>

              <tbody>
                ${rowsHtml}
                ${blankRowsHtml}
                ${summaryRowsHtml}
              </tbody>
            </table>

            <div class="footer-wrap">
              <div></div>

              <div class="totals-box">
                <table class="totals-mini">
                  <thead>
                    <tr>
                      <th>EFECTIVO</th>
                      <th>CRÉDITO</th>
                    </tr>
                  </thead>

                  <tbody>
                    <tr>
                      <td class="money">
                        $ ${moneyPlain(employeeTotalEfectivo)}
                      </td>

                      <td class="money">
                        $ ${moneyPlain(employeeTotalCredito)}
                      </td>
                    </tr>
                  </tbody>
                </table>

                <div class="venta-total-box">
                  <div class="venta-total-label">
                    VENTA TOTAL
                  </div>

                  <div class="venta-total-value">
                    $ ${moneyPlain(employeeTotalVenta)}
                  </div>
                </div>
              </div>
            </div>
          </section>
        `;
      })
      .join("");

    const html = `
      <!doctype html>
      <html lang="es">
        <head>
          <meta charset="utf-8" />

          <title>
            Ventas de Producción por empleado
          </title>

          <style>
            @page {
              size: legal landscape;
              margin: 8mm;
            }

            * {
              box-sizing: border-box;
            }

            html,
            body {
              margin: 0;
              padding: 0;
            }

            body {
              font-family:
                Arial,
                Helvetica,
                sans-serif;
              color: #111827;
              font-size: 11px;
              background: #ffffff;
            }

            .sheet {
              width: 100%;
            }

            .page-break {
              break-after: page;
              page-break-after: always;
            }

            .top {
              display: grid;
              grid-template-columns:
                1fr 1fr 1fr;
              gap: 8px;
              margin-bottom: 6px;
              align-items: start;
            }

            .left-meta,
            .right-meta {
              font-size: 10px;
              line-height: 1.4;
              white-space: pre-line;
              font-weight: 700;
            }

            .center-meta {
              text-align: center;
              font-size: 10px;
              line-height: 1.25;
            }

            .title {
              font-weight: 700;
              font-size: 12px;
              letter-spacing: .3px;
            }

            .report-name {
              margin-top: 8px;
              font-weight: 700;
            }

            table {
              width: 100%;
              border-collapse: collapse;
              table-layout: fixed;
            }

            th,
            td {
              border: 1px solid #4b5563;
              padding: 2px 3px;
              vertical-align: middle;
              word-wrap: break-word;
            }

            th {
              background: #f7f7f7;
              font-size: 8px;
              font-weight: 700;
            }

            td {
              font-size: 9px;
            }

            .center {
              text-align: center;
            }

            .client-name {
              font-size: 13px;
              font-weight: 700;
              line-height: 1.15;
              letter-spacing: .2px;
            }

            .money {
              text-align: right;
              white-space: nowrap;
              font-size: 11px;
              font-weight: 800;
            }

            .product-group {
              font-size: 8px;
              background: #f7f7f7;
            }

            .mini-col {
              font-size: 7px;
              padding: 1px 2px;
              background: #ffffff;
            }

            .qty-subcol {
              width: 28px;
            }

            .price-subcol {
              width: 48px;
            }

            .qty-cell {
              font-size: 8px;
              line-height: 1.05;
            }

            .price-cell {
              font-size: 10px;
            }

            .cell-qty {
              font-size: 12px;
              font-weight: 800;
              line-height: 1.05;
            }

            .cell-price {
              font-size: 11px;
              font-weight: 800;
              color: #374151;
              line-height: 1.05;
              white-space: nowrap;
            }

            .summary-spacer-row td {
              height: 18px;
              padding: 0;
              border-left: 0 !important;
              border-right: 0 !important;
              border-top:
                3px solid #111827 !important;
              border-bottom:
                3px solid #111827 !important;
              background: #ffffff !important;
            }

            .summary-row th,
            .summary-row td {
              font-size: 12px;
              padding: 4px 5px;
              border-color:
                #374151 !important;
            }

            .summary-row-dark th,
            .summary-row-dark td {
              background:
                #8f99a8 !important;
              color: #111827 !important;
            }

            .summary-label {
              text-align: left;
              font-weight: 700;
            }

            .summary-label-dark,
            .summary-end-dark {
              background:
                #6b7280 !important;
              color: #ffffff !important;
            }

            .summary-qty {
              font-weight: 800;
              font-size: 15px;
              letter-spacing: .5px;
            }

            .summary-merge-cell {
              text-align: center;
              vertical-align: middle;
            }

            .dash-cell {
              color: #374151 !important;
              font-weight: 700;
            }

            .footer-wrap {
              margin-top: 8px;
              display: grid;
              grid-template-columns:
                1fr 220px;
              gap: 8px;
              align-items: start;
            }

            .totals-box {
              border: 1px solid #4b5563;
              padding: 6px;
            }

            .totals-mini {
              width: 100%;
              border-collapse: collapse;
              margin-bottom: 6px;
            }

            .totals-mini th,
            .totals-mini td {
              border: 1px solid #4b5563;
              padding: 5px;
              font-size: 11px;
            }

            .venta-total-box {
              border: 1px solid #4b5563;
              text-align: center;
              padding: 8px 6px;
            }

            .venta-total-label {
              font-size: 12px;
              font-weight: 700;
              margin-bottom: 4px;
            }

            .venta-total-value {
              font-size: 26px;
              font-weight: 800;
            }

            @media print {
              body {
                print-color-adjust: exact;
                -webkit-print-color-adjust: exact;
              }
            }
          </style>
        </head>

        <body>
          ${employeeSheetsHtml}
        </body>
      </html>
    `;

    const win = window.open(
      "",
      "_blank",
      "width=1500,height=900",
    );

    if (!win) {
      window.alert(
        "El navegador bloqueó la ventana del PDF. " +
          "Permite ventanas emergentes e intenta de nuevo.",
      );

      return;
    }

    win.document.open();
    win.document.write(html);
    win.document.close();

    window.setTimeout(() => {
      win.focus();
      win.print();
    }, 400);
  }, [
    filteredSales,
    selectedDate,
    selectedPayment,
  ]);


  if (guard.loading || loading) return <LoadingScreen />;
  if (!guard.isAuthed) return null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0A1A2F] via-[#1E4A7A] to-[#2D1B3A]">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <motion.header
          initial={{ opacity: 0, y: -14 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between"
        >
          <div className="flex items-start gap-4">
            <button
              type="button"
              onClick={() => router.back()}
              className="rounded-xl border border-white/10 bg-white/10 p-3 text-white/80 transition hover:bg-white/20"
              title="Regresar"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>

            <div className="rounded-2xl bg-emerald-500/20 p-3 text-emerald-100">
              <WalletCards className="h-8 w-8" />
            </div>

            <div>
              <h1 className="text-2xl font-bold text-white">Ventas de Producción</h1>
              <p className="mt-1 text-sm text-white/55">
                Consulta, filtra e imprime las ventas registradas desde la tablet de Producción.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => loadData(true)}
              disabled={refreshing}
              className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/10 px-4 py-3 text-sm font-medium text-white/80 transition hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RefreshCw className={cx("h-4 w-4", refreshing && "animate-spin")} />
              Actualizar
            </button>

            <button
              type="button"
              onClick={exportPdf}
              disabled={filteredSales.length === 0}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#6B21A8] to-[#7C3AED] px-4 py-3 text-sm font-semibold text-white transition hover:from-[#7C3AED] hover:to-[#6B21A8] disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Printer className="h-4 w-4" />
              Exportar PDF
            </button>
          </div>
        </motion.header>

        {error && (
          <div className="mb-6 rounded-2xl border border-red-500/30 bg-red-500/15 p-4 text-red-100">
            <p className="font-semibold">No se pudo cargar el reporte.</p>
            <p className="mt-1 text-sm text-red-100/80">{error}</p>
          </div>
        )}

        <section className="mb-6 rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-xl">
          <div className="mb-4 flex items-center gap-2 text-white">
            <Filter className="h-4 w-4" />
            <h2 className="font-semibold">Filtros del reporte</h2>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <label className="block">
              <span className="mb-2 flex items-center gap-2 text-sm text-white/70">
                <CalendarDays className="h-4 w-4" /> Fecha
              </span>
              <input
                type="date"
                value={selectedDate}
                onChange={(event) => setSelectedDate(event.target.value)}
                className="w-full rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-white outline-none focus:ring-2 focus:ring-blue-500"
              />
            </label>

            <label className="block">
              <span className="mb-2 flex items-center gap-2 text-sm text-white/70">
                <UserRound className="h-4 w-4" /> Empleado
              </span>
              <select
                value={selectedEmployee}
                onChange={(event) => setSelectedEmployee(event.target.value)}
                className="w-full rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-white outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="ALL">Todos los empleados</option>
                {employees.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.nombre} · {employee.codigo}
                  </option>
                ))}
              </select>
            </label>



            <label className="block">
              <span className="mb-2 flex items-center gap-2 text-sm text-white/70">
                <Search className="h-4 w-4" /> Buscar
              </span>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Folio, cliente, empleado o producto..."
                className="w-full rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-white placeholder:text-white/35 outline-none focus:ring-2 focus:ring-blue-500"
              />
            </label>
          </div>

          <div className="mt-4 flex justify-end">
            <button
              type="button"
              onClick={clearFilters}
              className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/70 transition hover:bg-white/10"
            >
              Limpiar filtros
            </button>
          </div>
        </section>

        <section className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <KpiCard title="Ventas" value={totals.sales} icon={<FileText className="h-5 w-5" />} />
          <KpiCard title="Productos" value={totals.quantity} icon={<Package className="h-5 w-5" />} />
          <KpiCard title="Efectivo" value={formatMoney(totals.efectivo)} icon={<CircleDollarSign className="h-5 w-5" />} />
          <KpiCard title="Crédito" value={formatMoney(totals.credito)} icon={<Users className="h-5 w-5" />} />
          <KpiCard title="Venta total" value={formatMoney(totals.total)} icon={<WalletCards className="h-5 w-5" />} accent />
        </section>

        <section className="overflow-hidden rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl">
          <div className="flex flex-col gap-2 border-b border-white/10 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-semibold text-white">Detalle de ventas</h2>
              <p className="mt-1 text-xs text-white/45">
                Fecha, empleado, cliente, productos, cantidades y total.
              </p>
            </div>
            <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs text-white/70">
              {filteredSales.length} resultados
            </span>
          </div>

          {filteredSales.length === 0 ? (
            <div className="p-12 text-center">
              <FileText className="mx-auto h-12 w-12 text-white/25" />
              <p className="mt-4 font-semibold text-white">No hay ventas para estos filtros.</p>
              <p className="mt-1 text-sm text-white/45">Cambia la fecha, empleado o método de pago.</p>
            </div>
          ) : (
            <div className="divide-y divide-white/10">
              {filteredSales.map((sale) => (
                <SaleCard key={sale.id} sale={sale} />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function KpiCard({
  title,
  value,
  icon,
  accent = false,
}: {
  title: string;
  value: React.ReactNode;
  icon: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <div
      className={cx(
        "rounded-2xl border p-4",
        accent
          ? "border-emerald-500/30 bg-emerald-500/15"
          : "border-white/10 bg-white/5",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs text-white/50">{title}</p>
          <p className="mt-2 text-lg font-bold text-white">{value}</p>
        </div>
        <div className={cx("rounded-xl p-2", accent ? "bg-emerald-500/20 text-emerald-100" : "bg-white/10 text-white/75")}>
          {icon}
        </div>
      </div>
    </div>
  );
}

function SaleCard({ sale }: { sale: ProductionSale }) {
  const items = sale.items ?? [];

  return (
    <article className="p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-blue-500/15 text-blue-100">
            <FileText className="h-5 w-5" />
          </div>

          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-semibold text-white">{sale.folio || "VENTA"}</h3>
              <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-1 text-[11px] font-semibold text-emerald-100">
                VENTA DE PRODUCCIÓN
              </span>
              <span className="rounded-full border border-white/10 bg-white/10 px-2 py-1 text-[11px] text-white/70">
                {normalizeText(sale.payment_method || "EFECTIVO")}
              </span>
            </div>

            <p className="mt-1 text-sm text-white/60">{formatDate(sale.created_at)}</p>

            <div className="mt-3 flex flex-wrap gap-2">
              <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/70">
                <UserRound className="h-3.5 w-3.5" /> {getEmployeeName(sale)}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/70">
                <Users className="h-3.5 w-3.5" /> {getCustomerName(sale)}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/70">
                <Package className="h-3.5 w-3.5" /> {getSaleQuantity(sale)} piezas
              </span>
            </div>
          </div>
        </div>

        <div className="text-left lg:text-right">
          <p className="text-xs text-white/45">Total de venta</p>
          <p className="mt-1 text-2xl font-bold text-emerald-200">{formatMoney(getSaleTotal(sale))}</p>
        </div>
      </div>

      <div className="mt-4 overflow-x-auto rounded-xl border border-white/10">
        <div className="min-w-[640px]">
          <div className="grid grid-cols-[minmax(0,1fr)_70px_110px_110px] gap-2 border-b border-white/10 bg-white/5 px-3 py-2 text-[11px] font-semibold text-white/50">
            <div>Producto</div>
            <div className="text-center">Cant.</div>
            <div className="text-right">P. unitario</div>
            <div className="text-right">Importe</div>
          </div>

          {items.length === 0 ? (
            <div className="px-3 py-4 text-sm text-white/45">Sin detalle de productos.</div>
          ) : (
            <div className="divide-y divide-white/10">
              {items.map((item, index) => (
                <div
                  key={`${item.id || item.product_id || "item"}-${index}`}
                  className="grid grid-cols-[minmax(0,1fr)_70px_110px_110px] gap-2 px-3 py-3 text-sm"
                >
                  <div className="font-medium text-white">{getProductName(item)}</div>
                  <div className="text-center text-white/75">{getItemQuantity(item)}</div>
                  <div className="text-right text-white/65">{formatMoney(getItemUnitPrice(item))}</div>
                  <div className="text-right font-semibold text-white">{formatMoney(getItemSubtotal(item))}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

function LoadingScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-[#0A1A2F] via-[#1E4A7A] to-[#2D1B3A]">
      <div className="text-center">
        <RefreshCw className="mx-auto h-8 w-8 animate-spin text-white/80" />
        <p className="mt-3 text-sm text-white/60">Cargando ventas de Producción...</p>
      </div>
    </div>
  );
}