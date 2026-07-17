"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertCircle,
  ArrowLeft,
  ClipboardList,
  FileText,
  Gauge,
  Package,
  Printer,
  RefreshCw,
  Route,
  Truck,
  Users,
  Warehouse,
  DollarSign,
  Clock3,
} from "lucide-react";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";

import { PATHS } from "@/lib/constants/paths";
import { useAdminGuard } from "@/lib/hooks/useAdminGuard";
import { supabaseBrowser } from "@/lib/supabase/client";

const sb = supabaseBrowser as unknown as any;

const T_DRIVERS = "drivers";
const T_ASSIGNMENTS = "assignments";
const T_DELIVERIES = "deliveries";
const T_DELIVERY_ITEMS = "delivery_items";
const T_PRODUCTS = "products";
const T_ROUTES = "routes";

function cx(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function safeNum(v: unknown, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function money(n?: number | null) {
  if (typeof n !== "number" || Number.isNaN(n)) return "$0.00";
  return n.toLocaleString("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 2,
  });
}

function moneyPlain(n?: number | null) {
  const v = typeof n === "number" && !Number.isNaN(n) ? n : 0;
  return v.toLocaleString("es-MX", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function parseLocalDate(value?: string | null) {
  if (!value) return null;

  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) {
    const [, y, m, d] = match;
    return new Date(Number(y), Number(m) - 1, Number(d));
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function formatOnlyDate(value?: string | null) {
  const d = parseLocalDate(value);
  if (!d) return value || "—";
  return new Intl.DateTimeFormat("es-MX", { dateStyle: "medium" }).format(d);
}

function formatDateTime(value?: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return new Intl.DateTimeFormat("es-MX", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(d);
}

function formatTime(value?: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("es-MX", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

function escapeHtml(value: string) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function initials(name?: string | null) {
  return (
    String(name || "")
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => w[0])
      .join("")
      .toUpperCase()
      .slice(0, 2) || "CH"
  );
}

function normalizeLooseText(value?: string | null) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

function normalizeStatus(value?: string | null) {
  return normalizeLooseText(value);
}

function isCancelled(status?: string | null) {
  const s = normalizeStatus(status);
  return ["CANCELADA", "CANCELADO", "ANULADA", "ANULADO"].includes(s);
}

function isConfirmed(status?: string | null) {
  const s = normalizeStatus(status);
  return [
    "ENTREGADA",
    "CONFIRMADA",
    "FINALIZADA",
    "COMPLETADA",
    "CERRADA",
    "LIQUIDADA",
  ].includes(s);
}

function normalizeIceType(value?: string | null) {
  const t = normalizeLooseText(value);
  if (!t) return "";
  if (t.includes("BARRA")) return "BARRA";
  if (t.includes("GOURMET")) return "GOURMET";
  if (t.includes("FRAP")) return "FRAP";
  if (t.includes("ENFRIAR")) return "ENFRIAR";
  if (t.includes("ROLITO")) return "ROLITO";
  if (t.includes("NORMAL")) return "ROLITO";
  return t.replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function extractKg(...values: Array<string | number | null | undefined>) {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value) && value > 0) {
      return Number.isInteger(value)
        ? String(value)
        : String(value).replace(/\.0+$/, "");
    }

    const text = normalizeLooseText(String(value ?? ""));
    const match = text.match(/(\d+(?:\.\d+)?)\s*(?:KG|KILO|KILOS)/);
    if (match?.[1]) return match[1].replace(/\.0+$/, "");
  }

  return "";
}

function buildProductKey(input: {
  name?: string | null;
  iceType?: string | null;
  kg?: number | string | null;
  kind?: string | null;
  productId?: string | null;
}) {
  const name = normalizeLooseText(input.name);
  const iceType = normalizeIceType(input.iceType);
  const kind = normalizeLooseText(input.kind);

  if (iceType === "BARRA" || name.includes("BARRA") || kind.includes("BARRA")) {
    return "BARRA";
  }

  const kg = extractKg(input.kg as string | number | null | undefined, input.name);

  let type = iceType;
  if (!type) {
    if (name.includes("GOURMET")) type = "GOURMET";
    else if (name.includes("FRAP")) type = "FRAP";
    else if (name.includes("ENFRIAR")) type = "ENFRIAR";
    else if (
      name.includes("ROLITO") ||
      name.includes("BOLSA") ||
      name.includes("HIELO")
    ) {
      type = "ROLITO";
    }
  }

  if (type && kg) return `${type}_${kg}`;
  if (type) return type;

  return (
    name ||
    String(input.productId || "")
      .trim()
      .toUpperCase()
  );
}

function labelFromProductKey(key: string, fallback?: string | null) {
  const clean = String(key || "").trim().toUpperCase();
  if (clean === "BARRA") return "1/4 BARRA";

  const [typeRaw, kg] = clean.split("_");
  const type = typeRaw === "FRAPPE" ? "FRAPPE" : typeRaw;

  if (type && kg) return `${type} ${kg}KG`;
  return String(fallback || clean || "PRODUCTO").trim();
}

function productSortWeight(key: string) {
  const order = [
    "ROLITO_3",
    "ROLITO_5",
    "ROLITO_15",
    "FRAP_5",
    "FRAP_15",
    "GOURMET_5",
    "ENFRIAR_5",
    "BARRA",
  ];
  const idx = order.indexOf(String(key || "").toUpperCase());
  return idx === -1 ? 999 : idx;
}

function getErrorMessage(err: any, fallback: string) {
  return err?.message || err?.details || err?.hint || err?.error_description || fallback;
}

function getTodayStr() {
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const dd = String(today.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function toLocalDateKey(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

type DriverRow = {
  id: string;
  nombre: string | null;
  activo: boolean | null;
  firebase_codigo?: string | null;
};

type AssignmentRow = {
  id: string;
  driver_id: string | null;
  work_date: string | null;
  status: string | null;
};

type DeliveryRow = {
  id: string;
  assignment_id: string;
  customer_id: string | null;
  customer_nombre_snapshot: string | null;
  diner_nombre_snapshot: string | null;
  folio: string | null;
  total_expected: number | null;
  total_real: number | null;
  payment_method?: string | null;
  status: string | null;
};

type DeliveryItemRow = {
  id: string;
  delivery_id: string;
  product_id: string | null;
  qty_assigned: number | null;
  qty_real: number | null;
  precio_aplicado: number | null;
};

type ProductRow = {
  id: string;
  nombre: string | null;
  kind?: string | null;
  ice_type?: string | null;
  kg_por_unidad?: number | string | null;
};

type RouteRow = {
  id: string;
  assignment_id: string | null;
  status: string | null;
  started_at: string | null;
  ended_at: string | null;
  km_start: number | null;
  km_end: number | null;
};

type ProductionEmployeeRow = {
  id: string;
  document_id?: string | null;
  codigo: string;
  nombre: string;
  role: string;
};

type ProductionHistoryItem = {
  product_id?: string | null;
  product_name?: string | null;
  name?: string | null;
  nombre?: string | null;
  quantity?: number | string | null;
  qty?: number | string | null;
  unit_price?: number | string | null;
  subtotal?: number | string | null;
};

type ProductionHistorySale = {
  id: string;
  folio?: string | null;
  production_employee_id?: string | null;
  production_employee_name?: string | null;
  employee_id?: string | null;
  employee_name?: string | null;
  total?: number | string | null;
  total_quantity?: number | string | null;
  payment_method?: string | null;
  created_at?: string | null;
  items?: ProductionHistoryItem[] | null;
};

type ProductSale = {
  key: string;
  nombre: string;
  qty: number;
  kgUnit: number;
  tons: number;
};

type DriverMinuteRow = {
  personType: "DRIVER" | "PRODUCTION";
  driverId: string;
  driverName: string;
  driverCode: string | null;
  active: boolean;
  assignmentIds: string[];
  workDates: string[];
  visits: number | null;
  kmStart: number | null;
  kmEnd: number | null;
  kmTotal: number | null;
  routeStartedAt: string | null;
  routeEndedAt: string | null;
  saleTotal: number | null;
  expectedTotal: number | null;
  products: Map<string, ProductSale>;
};

type Totals = {
  workingDrivers: number;
  visits: number;
  kmTotal: number;
  saleTotal: number;
  expectedTotal: number;
  tons: number;
  productTotals: ProductSale[];
};

function getProductKg(product?: ProductRow | null, key?: string) {
  const explicit = safeNum(product?.kg_por_unidad, 0);
  if (explicit > 0) return explicit;

  const k = String(key || "").toUpperCase();
  if (k.includes("_3")) return 3;
  if (k.includes("_5")) return 5;
  if (k.includes("_15")) return 15;

  // Ajusta aquí si tu 1/4 de barra tiene otro peso operativo.
  if (k === "BARRA") return 25;

  return 0;
}

function displayDash(value: React.ReactNode, hasWork: boolean) {
  return hasWork ? value : "—";
}

function buildPdfHtml(input: {
  dateFrom: string;
  dateTo: string;
  rows: DriverMinuteRow[];
  totals: Totals;
}) {
  const { dateFrom, dateTo, rows, totals } = input;

  const productKeys = totals.productTotals.map((p) => p.key);

  const productHeader = productKeys
    .map((key) => `<th>${escapeHtml(labelFromProductKey(key))}</th>`)
    .join("");

  const rowsHtml = rows
    .map((row) => {
      const hasWork = row.assignmentIds.length > 0;

      const productCells = productKeys
        .map((key) => `<td class="center">${hasWork ? row.products.get(key)?.qty || "" : "—"}</td>`)
        .join("");

      return `
        <tr>
          <td>${escapeHtml(row.driverName)}</td>
          <td class="center">${hasWork ? row.visits ?? 0 : "—"}</td>
          <td class="center">${hasWork ? row.kmStart ?? "—" : "—"}</td>
          <td class="center">${hasWork ? row.kmEnd ?? "—" : "—"}</td>
          <td class="center">${hasWork ? row.kmTotal ?? 0 : "—"}</td>
          <td class="center">${hasWork ? escapeHtml(formatTime(row.routeStartedAt)) : "—"}</td>
          <td class="center">${hasWork ? escapeHtml(formatTime(row.routeEndedAt)) : "—"}</td>
          <td class="money">${hasWork ? `$ ${moneyPlain(row.saleTotal)}` : "—"}</td>
          ${productCells}
        </tr>
      `;
    })
    .join("");

  const productTotalsHtml = productKeys
    .map((key) => {
      const qty = totals.productTotals.find((p) => p.key === key)?.qty || 0;
      return `<td class="center strong">${qty}</td>`;
    })
    .join("");

  const productTonsHtml = productKeys
    .map((key) => {
      const p = totals.productTotals.find((x) => x.key === key);
      return `<td class="center">${p ? p.tons.toLocaleString("es-MX", { maximumFractionDigits: 3 }) : "0"}</td>`;
    })
    .join("");

  return `
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Minuta de venta</title>
        <style>
          @page { size: letter landscape; margin: 10mm; }

          body {
            font-family: Arial, Helvetica, sans-serif;
            color: #111827;
            margin: 0;
            font-size: 10px;
          }

          .sheet { width: 100%; }
          .title-box {
            border: 2px solid #111827;
            padding: 8px 12px;
            text-align: center;
            font-size: 15px;
            font-weight: 800;
            letter-spacing: .4px;
            margin-bottom: 12px;
          }

          .meta {
            display: grid;
            grid-template-columns: 1fr 1fr 1fr;
            gap: 10px;
            margin-bottom: 10px;
            font-size: 10px;
          }

          table {
            width: 100%;
            border-collapse: collapse;
            table-layout: fixed;
          }

          th, td {
            border: 1px solid #4b5563;
            padding: 4px 5px;
            vertical-align: middle;
            word-break: break-word;
          }

          th {
            background: #f3f4f6;
            font-size: 8px;
            font-weight: 800;
          }

          td { font-size: 8px; }
          .center { text-align: center; }
          .money { text-align: right; white-space: nowrap; }
          .strong { font-weight: 800; }
          .totals-grid {
            margin-top: 14px;
            display: grid;
            grid-template-columns: 1fr 1fr 1fr;
            gap: 14px;
            align-items: start;
          }

          .box {
            border: 2px solid #111827;
            padding: 10px;
            text-align: center;
            min-height: 46px;
            display: flex;
            flex-direction: column;
            justify-content: center;
          }

          .box-value {
            font-size: 18px;
            font-weight: 800;
          }

          .box-label {
            margin-top: 4px;
            font-size: 10px;
            font-weight: 700;
          }

          .product-summary {
            margin-top: 12px;
          }

          .footer-note {
            margin-top: 10px;
            font-size: 9px;
            color: #6b7280;
          }
        </style>
      </head>

      <body>
        <div class="sheet">
          <div class="title-box">
            RESUMEN DE VENTA ${escapeHtml(formatOnlyDate(dateFrom))}
            ${dateFrom !== dateTo ? ` - ${escapeHtml(formatOnlyDate(dateTo))}` : ""}
          </div>

          <div class="meta">
            <div><strong>Desde:</strong> ${escapeHtml(formatOnlyDate(dateFrom))}</div>
            <div><strong>Hasta:</strong> ${escapeHtml(formatOnlyDate(dateTo))}</div>
            <div><strong>Generado:</strong> ${escapeHtml(formatDateTime(new Date().toISOString()))}</div>
          </div>

          <table>
            <thead>
              <tr>
                <th style="width:130px;">PERSONAL</th>
                <th style="width:42px;">VISITAS</th>
                <th style="width:44px;">KM. INI.</th>
                <th style="width:44px;">KM. FIN.</th>
                <th style="width:56px;">KM. RECOR.</th>
                <th style="width:52px;">INICIO RUTA</th>
                <th style="width:52px;">FIN RUTA</th>
                <th style="width:78px;">VENTA</th>
                ${productHeader}
              </tr>
            </thead>
            <tbody>
              ${
                rowsHtml ||
                `<tr><td colspan="${8 + productKeys.length}" class="center">Sin personal registrado.</td></tr>`
              }

              <tr>
                <td class="strong">TOTALES</td>
                <td class="center strong">${totals.visits}</td>
                <td></td>
                <td></td>
                <td class="center strong">${totals.kmTotal}</td>
                <td></td>
                <td></td>
                <td class="money strong">$ ${moneyPlain(totals.saleTotal)}</td>
                ${productTotalsHtml}
              </tr>
            </tbody>
          </table>

          <div class="product-summary">
            <table>
              <thead>
                <tr>
                  <th style="width:170px;">PRODUCTOS VENDIDOS</th>
                  ${productHeader}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td class="strong">PIEZAS TOTALES</td>
                  ${productTotalsHtml}
                </tr>
                <tr>
                  <td class="strong">TONELADAS</td>
                  ${productTonsHtml}
                </tr>
              </tbody>
            </table>
          </div>

          <div class="totals-grid">
            <div class="box">
              <div class="box-value">${totals.visits}</div>
              <div class="box-label">VISITAS TOTALES</div>
            </div>

            <div class="box">
              <div class="box-value">${totals.kmTotal}</div>
              <div class="box-label">KM RECORRIDOS TOTALES</div>
            </div>

            <div class="box">
              <div class="box-value">$ ${moneyPlain(totals.saleTotal)}</div>
              <div class="box-label">VENTA TOTAL DEL DÍA</div>
            </div>
          </div>

          <div class="totals-grid">
            <div></div>
            <div class="box">
              <div class="box-value">${totals.tons.toLocaleString("es-MX", { maximumFractionDigits: 3 })}</div>
              <div class="box-label">TONELADAS VENDIDAS</div>
            </div>
            <div></div>
          </div>
        </div>
      </body>
    </html>
  `;
}

export default function MinutaReportesPage() {
  const router = useRouter();
  const guard = useAdminGuard();

  const todayStr = getTodayStr();

  const [dateFrom, setDateFrom] = useState(todayStr);
  const [dateTo, setDateTo] = useState(todayStr);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [pageError, setPageError] = useState("");

  const [rows, setRows] = useState<DriverMinuteRow[]>([]);

  const fetchData = useCallback(async () => {
    const [
      { data: driversData, error: driversErr },
      { data: assignmentsData, error: assignmentsErr },
    ] = await Promise.all([
      sb
        .from(T_DRIVERS)
        .select("id,nombre,activo,firebase_codigo")
        .order("nombre", { ascending: true }),
      sb
        .from(T_ASSIGNMENTS)
        .select("id,driver_id,work_date,status")
        .gte("work_date", dateFrom)
        .lte("work_date", dateTo)
        .order("work_date", { ascending: true }),
    ]);

    if (driversErr) throw driversErr;
    if (assignmentsErr) throw assignmentsErr;

const drivers = ((driversData ?? []) as DriverRow[])
  .filter((driver) => {
    if (driver.activo === false) return false;

    const name = normalizeLooseText(
      driver.nombre,
    );

    return name !== "PRUEBAS";
  })
  .sort((a, b) =>
    String(a.nombre || "").localeCompare(
      String(b.nombre || ""),
      "es",
    ),
  );

    const assignments = (assignmentsData ?? []) as AssignmentRow[];
    const assignmentIds = assignments.map((a) => a.id);

    const [productionEmployeesResponse, productionSalesResponse] =
      await Promise.all([
        fetch("/api/admin/production-employees", {
          method: "GET",
          cache: "no-store",
        }),
        fetch("/api/production-sales/history?limit=300", {
          method: "GET",
          cache: "no-store",
        }),
      ]);

    const productionEmployeesJson = await productionEmployeesResponse
      .json()
      .catch(() => null);

    const productionSalesJson = await productionSalesResponse
      .json()
      .catch(() => null);

    if (!productionEmployeesResponse.ok || productionEmployeesJson?.ok !== true) {
      throw new Error(
        productionEmployeesJson?.error ||
          `No se pudieron cargar los empleados de Producción (HTTP ${productionEmployeesResponse.status}).`,
      );
    }

    if (!productionSalesResponse.ok || productionSalesJson?.ok !== true) {
      throw new Error(
        productionSalesJson?.error ||
          `No se pudieron cargar las ventas de Producción (HTTP ${productionSalesResponse.status}).`,
      );
    }

    const productionEmployees =
      ((productionEmployeesJson?.data ?? []) as ProductionEmployeeRow[])
        .filter((employee) => {
          const employeeName = normalizeLooseText(
            employee.nombre || employee.codigo,
          );

          return employeeName !== "ADMINISTRACION";
        });

    const productionSales =
      ((productionSalesJson?.data ?? []) as ProductionHistorySale[]).filter(
        (sale) => {
          const dateKey = toLocalDateKey(sale.created_at);
          return dateKey >= dateFrom && dateKey <= dateTo;
        },
      );

    let deliveries: DeliveryRow[] = [];
    let routes: RouteRow[] = [];
    let items: DeliveryItemRow[] = [];
    let products: ProductRow[] = [];

    if (assignmentIds.length > 0) {
      const [
        { data: deliveriesData, error: deliveriesErr },
        { data: routeData, error: routeErr },
      ] = await Promise.all([
        sb
          .from(T_DELIVERIES)
          .select(
            "id,assignment_id,customer_id,customer_nombre_snapshot,diner_nombre_snapshot,folio,total_expected,total_real,payment_method,status",
          )
          .in("assignment_id", assignmentIds),
        sb
          .from(T_ROUTES)
          .select("id,assignment_id,status,started_at,ended_at,km_start,km_end")
          .in("assignment_id", assignmentIds),
      ]);

      if (deliveriesErr) throw deliveriesErr;
      if (routeErr) throw routeErr;

      deliveries = (deliveriesData ?? []) as DeliveryRow[];
      routes = (routeData ?? []) as RouteRow[];

      const deliveryIds = deliveries.map((d) => d.id);

      if (deliveryIds.length > 0) {
        const { data: itemsData, error: itemsErr } = await sb
          .from(T_DELIVERY_ITEMS)
          .select("id,delivery_id,product_id,qty_assigned,qty_real,precio_aplicado")
          .in("delivery_id", deliveryIds);

        if (itemsErr) throw itemsErr;
        items = (itemsData ?? []) as DeliveryItemRow[];

        const productIds = Array.from(
          new Set(items.map((i) => i.product_id).filter(Boolean)),
        ) as string[];

        if (productIds.length > 0) {
          const { data: productsData, error: productsErr } = await sb
            .from(T_PRODUCTS)
            .select("id,nombre,kind,ice_type,kg_por_unidad")
            .in("id", productIds);

          if (productsErr) throw productsErr;
          products = (productsData ?? []) as ProductRow[];
        }
      }
    }

    const assignmentsByDriver = new Map<string, AssignmentRow[]>();
    assignments.forEach((assignment) => {
      if (!assignment.driver_id) return;
      if (!assignmentsByDriver.has(assignment.driver_id)) {
        assignmentsByDriver.set(assignment.driver_id, []);
      }
      assignmentsByDriver.get(assignment.driver_id)!.push(assignment);
    });

    const routeByAssignment = new Map<string, RouteRow[]>();
    routes.forEach((r) => {
      if (!r.assignment_id) return;
      if (!routeByAssignment.has(r.assignment_id)) {
        routeByAssignment.set(r.assignment_id, []);
      }
      routeByAssignment.get(r.assignment_id)!.push(r);
    });

    const deliveriesByAssignment = new Map<string, DeliveryRow[]>();
    deliveries.forEach((d) => {
      if (!deliveriesByAssignment.has(d.assignment_id)) {
        deliveriesByAssignment.set(d.assignment_id, []);
      }
      deliveriesByAssignment.get(d.assignment_id)!.push(d);
    });

    const itemsByDelivery = new Map<string, DeliveryItemRow[]>();
    items.forEach((item) => {
      if (!itemsByDelivery.has(item.delivery_id)) {
        itemsByDelivery.set(item.delivery_id, []);
      }
      itemsByDelivery.get(item.delivery_id)!.push(item);
    });

    const productMap = new Map<string, ProductRow>();
    products.forEach((p) => productMap.set(p.id, p));

    const output: DriverMinuteRow[] = drivers.map((driver) => {
      const driverAssignments = assignmentsByDriver.get(driver.id) ?? [];
      const assignmentIdsForDriver = driverAssignments.map((a) => a.id);
      const workDates = Array.from(
        new Set(driverAssignments.map((a) => a.work_date).filter(Boolean) as string[]),
      );

      if (driverAssignments.length === 0) {
        return {
          personType: "DRIVER" as const,
          driverId: driver.id,
          driverName: driver.nombre || "Chofer",
          driverCode: driver.firebase_codigo || null,
          active: driver.activo !== false,
          assignmentIds: [],
          workDates: [],
          visits: null,
          kmStart: null,
          kmEnd: null,
          kmTotal: null,
          routeStartedAt: null,
          routeEndedAt: null,
          saleTotal: null,
          expectedTotal: null,
          products: new Map<string, ProductSale>(),
        };
      }

      const productsMap = new Map<string, ProductSale>();

      let visits = 0;
      let saleTotal = 0;
      let expectedTotal = 0;

      let kmTotal = 0;
      let firstKmStart: number | null = null;
      let lastKmEnd: number | null = null;
      let firstStartedAt: string | null = null;
      let lastEndedAt: string | null = null;

      driverAssignments.forEach((assignment) => {
        const assignmentRoutes = routeByAssignment.get(assignment.id) ?? [];
        assignmentRoutes.forEach((route) => {
          const kmStart = typeof route.km_start === "number" ? route.km_start : null;
          const kmEnd = typeof route.km_end === "number" ? route.km_end : null;

          if (firstKmStart === null && kmStart !== null) firstKmStart = kmStart;
          if (kmEnd !== null) lastKmEnd = kmEnd;

          if (typeof kmStart === "number" && typeof kmEnd === "number") {
            kmTotal += Math.max(0, kmEnd - kmStart);
          }

          if (!firstStartedAt && route.started_at) firstStartedAt = route.started_at;
          if (route.ended_at) lastEndedAt = route.ended_at;
        });

        const assignmentDeliveries = deliveriesByAssignment.get(assignment.id) ?? [];
        const activeDeliveries = assignmentDeliveries.filter((d) => !isCancelled(d.status));
        visits += activeDeliveries.length;

        activeDeliveries.forEach((delivery) => {
          expectedTotal += safeNum(delivery.total_expected, 0);

          if (isConfirmed(delivery.status)) {
            saleTotal += safeNum(delivery.total_real, safeNum(delivery.total_expected, 0));
          }

          const deliveryItems = itemsByDelivery.get(delivery.id) ?? [];
          deliveryItems.forEach((item) => {
            const product = item.product_id ? productMap.get(String(item.product_id)) : null;
            const productName = product?.nombre || "Producto";
            const key =
              buildProductKey({
                name: productName,
                iceType: product?.ice_type || null,
                kg: product?.kg_por_unidad || null,
                kind: product?.kind || null,
                productId: item.product_id || null,
              }) || normalizeLooseText(productName);

            const qty = isConfirmed(delivery.status)
              ? safeNum(item.qty_real, safeNum(item.qty_assigned, 0))
              : 0;

            if (qty <= 0) return;

            const kgUnit = getProductKg(product, key);
            const current = productsMap.get(key);

            if (current) {
              current.qty += qty;
              current.tons += (qty * kgUnit) / 1000;
            } else {
              productsMap.set(key, {
                key,
                nombre: labelFromProductKey(key, productName),
                qty,
                kgUnit,
                tons: (qty * kgUnit) / 1000,
              });
            }
          });
        });
      });

      return {
        personType: "DRIVER" as const,
        driverId: driver.id,
        driverName: driver.nombre || "Chofer",
        driverCode: driver.firebase_codigo || null,
        active: driver.activo !== false,
        assignmentIds: assignmentIdsForDriver,
        workDates,
        visits,
        kmStart: firstKmStart,
        kmEnd: lastKmEnd,
        kmTotal,
        routeStartedAt: firstStartedAt,
        routeEndedAt: lastEndedAt,
        saleTotal,
        expectedTotal,
        products: productsMap,
      };
    });

    const productionRows: DriverMinuteRow[] = productionEmployees
      .filter((employee) => normalizeLooseText(employee.role) === "PRODUCCION")
      .map((employee) => {
        const employeeId = String(employee.id || employee.document_id || "").trim();
        const employeeName = String(employee.nombre || employee.codigo || "Producción").trim();

        const employeeSales = productionSales.filter((sale) => {
          const saleEmployeeId = String(
            sale.production_employee_id || sale.employee_id || "",
          ).trim();

          const saleEmployeeName = normalizeLooseText(
            sale.production_employee_name || sale.employee_name || "",
          );

          return (
            (employeeId && saleEmployeeId === employeeId) ||
            (saleEmployeeName &&
              saleEmployeeName === normalizeLooseText(employeeName))
          );
        });

        const productsMap = new Map<string, ProductSale>();
        let saleTotal = 0;
        let totalSales = 0;

        employeeSales.forEach((sale) => {
          saleTotal += safeNum(sale.total, 0);
          totalSales += 1;

          (sale.items ?? []).forEach((item) => {
            const productName =
              String(
                item.product_name ||
                  item.nombre ||
                  item.name ||
                  "Producto",
              ).trim() || "Producto";

            const key =
              buildProductKey({
                name: productName,
                productId: item.product_id || null,
              }) || normalizeLooseText(productName);

            const qty = Math.max(
              0,
              Math.trunc(
                safeNum(item.quantity ?? item.qty, 0),
              ),
            );

            if (qty <= 0) return;

            const kgUnit = getProductKg(null, key);
            const current = productsMap.get(key);

            if (current) {
              current.qty += qty;
              current.tons += (qty * kgUnit) / 1000;
            } else {
              productsMap.set(key, {
                key,
                nombre: labelFromProductKey(key, productName),
                qty,
                kgUnit,
                tons: (qty * kgUnit) / 1000,
              });
            }
          });
        });

        return {
          personType: "PRODUCTION" as const,
          driverId: `production-${employeeId || employee.codigo}`,
          driverName: employeeName,
          driverCode: employee.codigo || null,
          active: true,
          assignmentIds:
            employeeSales.length > 0
              ? employeeSales.map((sale) => sale.id)
              : [],
          workDates: Array.from(
            new Set(
              employeeSales
                .map((sale) => toLocalDateKey(sale.created_at))
                .filter(Boolean),
            ),
          ),
          visits: employeeSales.length > 0 ? totalSales : null,
          kmStart: null,
          kmEnd: null,
          kmTotal: null,
          routeStartedAt: null,
          routeEndedAt: null,
          saleTotal: employeeSales.length > 0 ? saleTotal : null,
          expectedTotal: employeeSales.length > 0 ? saleTotal : null,
          products: productsMap,
        };
      })
      .sort((a, b) =>
        a.driverName.localeCompare(b.driverName, "es", {
          sensitivity: "base",
        }),
      );

    return [...output, ...productionRows];
  }, [dateFrom, dateTo]);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setPageError("");
      const data = await fetchData();
      setRows(data);
    } catch (err: any) {
      console.error("Error loading minuta:", err);
      setPageError(getErrorMessage(err, "No se pudo cargar la minuta."));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [fetchData]);

  const refreshData = useCallback(async () => {
    try {
      setRefreshing(true);
      setPageError("");
      const data = await fetchData();
      setRows(data);
    } catch (err: any) {
      console.error("Error refreshing minuta:", err);
      setPageError(getErrorMessage(err, "No se pudo actualizar la minuta."));
    } finally {
      setRefreshing(false);
    }
  }, [fetchData]);

  useEffect(() => {
    if (!guard.loading && !guard.isAuthed) {
      router.replace(PATHS.admin.dashboard);
      return;
    }

    if (!guard.loading && guard.isAuthed) {
      void loadData();
    }
  }, [guard.loading, guard.isAuthed, loadData, router]);

  const totals = useMemo((): Totals => {
    const productMap = new Map<string, ProductSale>();

    let workingDrivers = 0;
    let visits = 0;
    let kmTotal = 0;
    let saleTotal = 0;
    let expectedTotal = 0;
    let tons = 0;

    rows.forEach((row) => {
      const hasWork = row.assignmentIds.length > 0;
      if (hasWork) workingDrivers += 1;

      visits += safeNum(row.visits, 0);
      kmTotal += safeNum(row.kmTotal, 0);
      saleTotal += safeNum(row.saleTotal, 0);
      expectedTotal += safeNum(row.expectedTotal, 0);

      row.products.forEach((p) => {
        const current = productMap.get(p.key);
        if (current) {
          current.qty += p.qty;
          current.tons += p.tons;
        } else {
          productMap.set(p.key, { ...p });
        }

        tons += p.tons;
      });
    });

    const productTotals = Array.from(productMap.values()).sort((a, b) => {
      const wa = productSortWeight(a.key);
      const wb = productSortWeight(b.key);
      if (wa !== wb) return wa - wb;
      return a.nombre.localeCompare(b.nombre, "es", { numeric: true });
    });

    return {
      workingDrivers,
      visits,
      kmTotal,
      saleTotal,
      expectedTotal,
      tons,
      productTotals,
    };
  }, [rows]);


  const exportExcel = useCallback(() => {
    const productKeys = totals.productTotals.map((p) => p.key);
    const productKgByKey = new Map(
      totals.productTotals.map((p) => [p.key, safeNum(p.kgUnit, 0)]),
    );

    const headers = [
      "PERSONAL",
      "VISITAS",
      "KM INICIAL",
      "KM FINAL",
      "KM RECORRIDOS",
      "INICIO RUTA",
      "FIN RUTA",
      "VENTA TOTAL",
      ...productKeys.map((key) => labelFromProductKey(key)),
    ];

    const dataRows = rows.map((row) => {
      const hasWork = row.assignmentIds.length > 0;

      return [
        row.driverName,
        hasWork ? safeNum(row.visits, 0) : "-",
        hasWork ? row.kmStart ?? "-" : "-",
        hasWork ? row.kmEnd ?? "-" : "-",
        hasWork ? safeNum(row.kmTotal, 0) : "-",
        hasWork ? formatTime(row.routeStartedAt) : "-",
        hasWork ? formatTime(row.routeEndedAt) : "-",
        hasWork ? safeNum(row.saleTotal, 0) : "-",
        ...productKeys.map((key) =>
          hasWork ? row.products.get(key)?.qty || 0 : "-",
        ),
      ];
    });

    const headerRowIndex = 3;
    const firstDataRowIndex = headerRowIndex + 1;
    const lastDataRowIndex = firstDataRowIndex + Math.max(dataRows.length - 1, 0);
    const totalsRowIndex = firstDataRowIndex + dataRows.length + 1;
    const tonsRowIndex = totalsRowIndex + 1;
    const kgRowIndex = tonsRowIndex + 1;
    const summaryTitleRowIndex = kgRowIndex + 3;

    const excelRow = (zeroBased: number) => zeroBased + 1;
    const hasFormulaRange = dataRows.length > 0;

    const makeSumFormula = (colIndex: number) => {
      if (!hasFormulaRange) return { f: "0" };
      const col = XLSX.utils.encode_col(colIndex);
      return {
        f: `SUM(${col}${excelRow(firstDataRowIndex)}:${col}${excelRow(lastDataRowIndex)})`,
      };
    };

    const totalsRow = [
      "TOTALES",
      makeSumFormula(1),
      "",
      "",
      makeSumFormula(4),
      "",
      "",
      makeSumFormula(7),
      ...productKeys.map((_, index) => makeSumFormula(8 + index)),
    ];

    const tonsRow = [
      "TONELADAS TOTALES",
      "",
      "",
      "",
      "",
      "",
      "",
      productKeys.length > 0
        ? {
            f: `SUM(${XLSX.utils.encode_col(8)}${excelRow(tonsRowIndex)}:${XLSX.utils.encode_col(7 + productKeys.length)}${excelRow(tonsRowIndex)})`,
          }
        : { f: "0" },
      ...productKeys.map((key, index) => {
        const col = XLSX.utils.encode_col(8 + index);
        const kg = safeNum(productKgByKey.get(key), 0);
        return { f: `${col}${excelRow(totalsRowIndex)}*${kg}/1000` };
      }),
    ];

    const kgRow = [
      "KG POR PIEZA",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      ...productKeys.map((key) => safeNum(productKgByKey.get(key), 0)),
    ];

    const summaryRows = [
      ["RESUMEN GENERAL", ""],
      ["VISITAS TOTALES", { f: `B${excelRow(totalsRowIndex)}` }],
      ["KM RECORRIDOS TOTALES", { f: `E${excelRow(totalsRowIndex)}` }],
      ["VENTA TOTAL DEL DÍA", { f: `H${excelRow(totalsRowIndex)}` }],
      ["TONELADAS VENDIDAS", { f: `H${excelRow(tonsRowIndex)}` }],
    ];

    const productSummaryRows = [
      [],
      ["PRODUCTOS VENDIDOS"],
      ["PRODUCTO", "PIEZAS", "KG POR PIEZA", "TONELADAS"],
      ...productKeys.map((key, index) => {
        const productCol = XLSX.utils.encode_col(8 + index);
        return [
          labelFromProductKey(key),
          { f: `${productCol}${excelRow(totalsRowIndex)}` },
          safeNum(productKgByKey.get(key), 0),
          { f: `${productCol}${excelRow(tonsRowIndex)}` },
        ];
      }),
    ];

    const aoa = [
      [
        `RESUMEN DE VENTA ${formatOnlyDate(dateFrom)}${
          dateFrom !== dateTo ? ` - ${formatOnlyDate(dateTo)}` : ""
        }`,
      ],
      [`Generado: ${formatDateTime(new Date().toISOString())}`],
      [],
      headers,
      ...dataRows,
      [],
      totalsRow,
      tonsRow,
      kgRow,
      [],
      ...summaryRows,
      ...productSummaryRows,
    ];

    const worksheet = XLSX.utils.aoa_to_sheet(aoa);
    const totalColumns = headers.length;

    worksheet["!merges"] = [
      {
        s: { r: 0, c: 0 },
        e: { r: 0, c: Math.max(totalColumns - 1, 0) },
      },
      {
        s: { r: 1, c: 0 },
        e: { r: 1, c: Math.max(totalColumns - 1, 0) },
      },
    ];

    worksheet["!cols"] = [
      { wch: 30 },
      { wch: 12 },
      { wch: 14 },
      { wch: 14 },
      { wch: 16 },
      { wch: 14 },
      { wch: 14 },
      { wch: 18 },
      ...productKeys.map(() => ({ wch: 14 })),
    ];

    worksheet["!autofilter"] = {
      ref: XLSX.utils.encode_range({
        s: { r: headerRowIndex, c: 0 },
        e: { r: headerRowIndex, c: Math.max(totalColumns - 1, 0) },
      }),
    };

    const range = XLSX.utils.decode_range(worksheet["!ref"] || "A1:A1");

    for (let rowIndex = firstDataRowIndex; rowIndex <= range.e.r; rowIndex += 1) {
      const moneyCell = XLSX.utils.encode_cell({ r: rowIndex, c: 7 });
      if (worksheet[moneyCell] && worksheet[moneyCell].v !== "-") {
        worksheet[moneyCell].z = '"$"#,##0.00';
      }
    }

    for (let colIndex = 8; colIndex < 8 + productKeys.length; colIndex += 1) {
      const tonsCell = XLSX.utils.encode_cell({ r: tonsRowIndex, c: colIndex });
      if (worksheet[tonsCell]) worksheet[tonsCell].z = "0.000";
    }

    const totalVentaCell = XLSX.utils.encode_cell({ r: totalsRowIndex, c: 7 });
    if (worksheet[totalVentaCell]) worksheet[totalVentaCell].z = '"$"#,##0.00';

    const totalTonsCell = XLSX.utils.encode_cell({ r: tonsRowIndex, c: 7 });
    if (worksheet[totalTonsCell]) worksheet[totalTonsCell].z = "0.000";

    const summaryVentaCell = XLSX.utils.encode_cell({
      r: summaryTitleRowIndex + 3,
      c: 1,
    });
    if (worksheet[summaryVentaCell]) worksheet[summaryVentaCell].z = '"$"#,##0.00';

    const summaryTonsCell = XLSX.utils.encode_cell({
      r: summaryTitleRowIndex + 4,
      c: 1,
    });
    if (worksheet[summaryTonsCell]) worksheet[summaryTonsCell].z = "0.000";

    const workbook = XLSX.utils.book_new();
    workbook.Props = {
      Title: "Minuta de venta",
      Subject: "Resumen de venta por chofer y Producción",
      Author: "Sistema de Entregas",
      CreatedDate: new Date(),
    };

    XLSX.utils.book_append_sheet(workbook, worksheet, "Minuta");

    const excelBuffer = XLSX.write(workbook, {
      bookType: "xlsx",
      type: "array",
      cellStyles: true,
    });

    const fileData = new Blob([excelBuffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;charset=UTF-8",
    });

    const url = URL.createObjectURL(fileData);
    const link = document.createElement("a");

    link.href = url;
    link.download = `minuta-${dateFrom}${dateFrom !== dateTo ? `-a-${dateTo}` : ""}.xlsx`;

    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }, [rows, totals, dateFrom, dateTo]);

  const exportPdf = useCallback(() => {
    const html = buildPdfHtml({ dateFrom, dateTo, rows, totals });
    const win = window.open("", "_blank", "width=1400,height=900");
    if (!win) return;

    win.document.open();
    win.document.write(html);
    win.document.close();

    setTimeout(() => {
      win.focus();
      win.print();
    }, 450);
  }, [dateFrom, dateTo, rows, totals]);

  const downloadHtml = useCallback(() => {
    const html = buildPdfHtml({ dateFrom, dateTo, rows, totals });
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");

    a.href = url;
    a.download = `minuta-${dateFrom}${dateFrom !== dateTo ? `-a-${dateTo}` : ""}.html`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }, [dateFrom, dateTo, rows, totals]);

  if (guard.loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#0A1A2F] via-[#1E4A7A] to-[#2D1B3A]">
        <Skeleton />
      </div>
    );
  }

  if (!guard.isAuthed) return null;

  const productKeys = totals.productTotals.map((p) => p.key);

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0A1A2F] via-[#1E4A7A]/90 to-[#2D1B3A]">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: -18 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6"
        >
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-4">
              <div className="rounded-2xl bg-gradient-to-br from-purple-500 to-violet-600 p-3 shadow-lg">
                <ClipboardList className="h-8 w-8 text-white" />
              </div>

              <div>
                <h1 className="text-2xl font-bold text-white">Minuta diaria</h1>
                <p className="text-sm text-white/55">
                  General de choferes y empleados de Producción: visitas/ventas, kilómetros, venta y productos vendidos.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={() => router.push("/admin/reportes")}
                className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-4 py-2 text-sm text-white/80 transition hover:bg-white/20"
              >
                <ArrowLeft className="h-4 w-4" />
                Reportes
              </button>

              <button
                onClick={() => void refreshData()}
                disabled={refreshing}
                className="rounded-xl bg-white/10 p-3 text-white/80 hover:bg-white/20 disabled:opacity-50"
                title="Refrescar"
              >
                <RefreshCw className={cx("h-4 w-4", refreshing && "animate-spin")} />
              </button>
              <button
                onClick={exportExcel}
                disabled={rows.length === 0}
                className={cx(
                  "inline-flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold shadow-lg transition",
                  rows.length === 0
                    ? "cursor-not-allowed bg-white/10 text-white/30"
                    : "bg-gradient-to-r from-emerald-800 to-green-700 text-white hover:from-emerald-300 hover:to-green-500",
                )}
              >
                <FileText className="h-4 w-4" />
                Exportar Excel
              </button>

              <button
                onClick={exportPdf}
                disabled={rows.length === 0}
                className={cx(
                  "inline-flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold shadow-lg transition",
                  rows.length === 0
                    ? "cursor-not-allowed bg-white/10 text-white/30"
                    : "bg-gradient-to-r from-violet-500 to-purple-600 text-white hover:from-violet-400 hover:to-purple-500",
                )}
              >
                <Printer className="h-4 w-4" />
                Exportar PDF
              </button>
            </div>
          </div>
        </motion.div>

        <AnimatePresence>
          {pageError && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mb-6 rounded-xl border border-red-500/30 bg-red-500/20 p-4"
            >
              <div className="flex items-center gap-3 text-red-200">
                <AlertCircle className="h-5 w-5" />
                <div>
                  <p className="font-medium">No se pudo cargar la minuta</p>
                  <p className="text-sm text-red-100/85">{pageError}</p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="mb-5 rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-xl">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <FieldBlock label="Desde">
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-orange-400"
              />
            </FieldBlock>

            <FieldBlock label="Hasta">
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-orange-400"
              />
            </FieldBlock>

            <div className="flex items-end gap-2">
              <button
                onClick={() => void loadData()}
                className="w-full rounded-xl bg-purple-500 px-4 py-3 text-sm font-semibold text-white hover:bg-violet-400"
              >
                Aplicar fecha
              </button>

              <button
                onClick={() => {
                  setDateFrom(todayStr);
                  setDateTo(todayStr);
                }}
                className="rounded-xl bg-white/10 px-4 py-3 text-sm text-white/80 hover:bg-white/20"
              >
                Hoy
              </button>
            </div>
          </div>
        </div>

        <div className="mb-5 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-6">
          <TopStat label="Personal activo" value={rows.length} icon={<Truck className="h-4 w-4" />} />
          <TopStat label="Personal con actividad" value={totals.workingDrivers} icon={<Route className="h-4 w-4" />} />
          <TopStat label="Visitas totales" value={totals.visits} icon={<Users className="h-4 w-4" />} />
          <TopStat label="Km recorridos" value={totals.kmTotal} icon={<Gauge className="h-4 w-4" />} />
          <TopStat label="Venta total" value={money(totals.saleTotal)} icon={<DollarSign className="h-4 w-4" />} />
          <TopStat
            label="Toneladas"
            value={totals.tons.toLocaleString("es-MX", { maximumFractionDigits: 3 })}
            icon={<Warehouse className="h-4 w-4" />}
          />
        </div>

        <div className="mb-5 rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-xl">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <p className="flex items-center gap-2 font-semibold text-white">
                <Package className="h-4 w-4" />
                Productos vendidos del día
              </p>
              <p className="text-xs text-white/50">
                Total general por producto y toneladas calculadas.
              </p>
            </div>
          </div>

          {totals.productTotals.length === 0 ? (
            <div className="py-8 text-center text-white/50">Sin productos vendidos.</div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {totals.productTotals.map((p) => (
                <div key={p.key} className="rounded-xl border border-white/10 bg-black/10 p-4">
                  <p className="text-sm font-semibold text-white">{p.nombre}</p>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <div className="rounded-lg bg-white/5 p-2">
                      <p className="text-[11px] text-white/45">Piezas</p>
                      <p className="text-lg font-bold text-white">{p.qty}</p>
                    </div>
                    <div className="rounded-lg bg-white/5 p-2">
                      <p className="text-[11px] text-white/45">Ton</p>
                      <p className="text-lg font-bold text-white">
                        {p.tons.toLocaleString("es-MX", { maximumFractionDigits: 3 })}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl">
          <div className="border-b border-white/10 p-4">
            <p className="flex items-center gap-2 font-semibold text-white">
              <FileText className="h-4 w-4" />
              Resumen general por personal
            </p>
          </div>

          {loading ? (
            <div className="p-8 text-center text-white/50">Cargando minuta...</div>
          ) : rows.length === 0 ? (
            <div className="p-8 text-center text-white/50">
              No hay personal activo registrado.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-white/10 text-xs uppercase text-white/70">
                  <tr>
                    <th className="px-4 py-3">Personal</th>
                    <th className="px-4 py-3 text-center">Visitas / Ventas</th>
                    <th className="px-4 py-3 text-center">Km inicial</th>
                    <th className="px-4 py-3 text-center">Km final</th>
                    <th className="px-4 py-3 text-center">Km recor.</th>
                    <th className="px-4 py-3">Inicio ruta</th>
                    <th className="px-4 py-3">Fin ruta</th>
                    <th className="px-4 py-3 text-right">Venta</th>
                    {productKeys.map((key) => (
                      <th key={key} className="px-4 py-3 text-center">
                        {labelFromProductKey(key)}
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody className="divide-y divide-white/10">
                  {rows.map((row) => {
                    const hasWork = row.assignmentIds.length > 0;

                    return (
                      <tr key={row.driverId} className="text-white/85 hover:bg-white/5">
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-3">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 font-bold text-white">
                              {initials(row.driverName)}
                            </div>
                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="font-semibold text-white">{row.driverName}</p>
                                <span
                                  className={cx(
                                    "rounded-full px-2 py-0.5 text-[10px] font-bold",
                                    row.personType === "PRODUCTION"
                                      ? "bg-violet-500/20 text-violet-100"
                                      : "bg-cyan-500/20 text-cyan-100",
                                  )}
                                >
                                  {row.personType === "PRODUCTION"
                                    ? "PRODUCCIÓN"
                                    : "CHOFER"}
                                </span>
                              </div>
                              <p className="text-xs text-white/45">
                                {row.driverCode ? row.driverCode : "Sin código inventario"}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-4 text-center">{displayDash(row.visits, hasWork)}</td>
                        <td className="px-4 py-4 text-center">{hasWork ? row.kmStart ?? "—" : "—"}</td>
                        <td className="px-4 py-4 text-center">{hasWork ? row.kmEnd ?? "—" : "—"}</td>
                        <td className="px-4 py-4 text-center font-semibold text-cyan-100">
                          {displayDash(row.kmTotal, hasWork)}
                        </td>
                        <td className="px-4 py-4 text-white/70">
                          {hasWork ? (
                            <div className="flex items-center gap-1">
                              <Clock3 className="h-3.5 w-3.5" />
                              {formatTime(row.routeStartedAt)}
                            </div>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="px-4 py-4 text-white/70">
                          {hasWork ? (
                            <div className="flex items-center gap-1">
                              <Route className="h-3.5 w-3.5" />
                              {formatTime(row.routeEndedAt)}
                            </div>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="px-4 py-4 text-right font-semibold text-emerald-100">
                          {hasWork ? money(row.saleTotal) : "—"}
                        </td>
                        {productKeys.map((key) => (
                          <td key={`${row.driverId}-${key}`} className="px-4 py-4 text-center">
                            {hasWork ? row.products.get(key)?.qty || "—" : "—"}
                          </td>
                        ))}
                      </tr>
                    );
                  })}

                  <tr className="bg-white/10 text-white">
                    <td className="px-4 py-4 font-bold">TOTALES</td>
                    <td className="px-4 py-4 text-center font-bold">{totals.visits}</td>
                    <td className="px-4 py-4"></td>
                    <td className="px-4 py-4"></td>
                    <td className="px-4 py-4 text-center font-bold">{totals.kmTotal}</td>
                    <td className="px-4 py-4"></td>
                    <td className="px-4 py-4"></td>
                    <td className="px-4 py-4 text-right font-bold">{money(totals.saleTotal)}</td>
                    {productKeys.map((key) => {
                      const p = totals.productTotals.find((x) => x.key === key);
                      return (
                        <td key={`total-${key}`} className="px-4 py-4 text-center font-bold">
                          {p?.qty || 0}
                        </td>
                      );
                    })}
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function FieldBlock({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-2 block text-sm text-white/70">{label}</label>
      {children}
    </div>
  );
}

function TopStat({
  label,
  value,
  icon,
}: {
  label: string;
  value: React.ReactNode;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-white/50">{label}</p>
          <p className="mt-1 break-words text-lg font-bold text-white">{value}</p>
        </div>
        <div className="shrink-0 rounded-xl bg-white/10 p-2 text-white/80">{icon}</div>
      </div>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="flex h-screen items-center justify-center">
      <div className="w-full max-w-md space-y-4">
        <div className="mx-auto h-12 w-48 animate-pulse rounded-xl bg-white/10" />
        <div className="h-64 animate-pulse rounded-2xl bg-white/5" />
      </div>
    </div>
  );
}