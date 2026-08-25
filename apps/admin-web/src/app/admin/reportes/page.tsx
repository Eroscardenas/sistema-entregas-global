"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  BarChart3,
  CalendarDays,
  ChevronRight,
  ClipboardList,
  Download,
  Eye,
  RefreshCw,
  Search,
  Truck,
  Users,
  Boxes,
  DollarSign,
  ListOrdered,
  AlertCircle,
  UserRound,
  Hash,
  Layers3,
  CircleDollarSign,
  Package,
  TrendingUp,
  TrendingDown,
  Scale,
  CheckCircle2,
  Link2,
  Warehouse,
  Factory,
} from "lucide-react";

import { useRouter } from "next/navigation";
import { PATHS } from "@/lib/constants/paths";
import { useAdminGuard } from "@/lib/hooks/useAdminGuard";
import { supabaseBrowser } from "@/lib/supabase/client";

const sb = supabaseBrowser as unknown as any;

const T_DRIVERS = "drivers";
const T_ASSIGNMENTS = "assignments";
const T_DELIVERIES = "deliveries";
const T_DELIVERY_ITEMS = "delivery_items";
const T_PRODUCTS = "products";

function cx(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function money(n?: number | null) {
  if (typeof n !== "number" || Number.isNaN(n)) return "—";
  return n.toLocaleString("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 2,
  });
}

function safeNum(v: unknown, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function parseLocalDate(value?: string | null) {
  if (!value) return null;

  const onlyDate = /^(\d{4})-(\d{2})-(\d{2})$/;
  const match = String(value).match(onlyDate);

  if (match) {
    const [, y, m, d] = match;
    return new Date(Number(y), Number(m) - 1, Number(d));
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function formatDate(value?: string | null) {
  const d = parseLocalDate(value);
  if (!d) return "—";

  return new Intl.DateTimeFormat("es-MX", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(d);
}

function formatOnlyDate(value?: string | null) {
  const d = parseLocalDate(value);
  if (!d) return value || "—";

  return new Intl.DateTimeFormat("es-MX", {
    dateStyle: "medium",
  }).format(d);
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
      .slice(0, 2) || "RP"
  );
}

function getErrorMessage(err: any, fallback: string) {
  return (
    err?.message ||
    err?.details ||
    err?.hint ||
    err?.error_description ||
    fallback
  );
}

function escapeHtml(value: string) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

type DiffState = "MAS" | "MENOS" | "EXACTO";

function getDiffState(diff: number): DiffState {
  if (diff > 0) return "MAS";
  if (diff < 0) return "MENOS";
  return "EXACTO";
}

function getDiffPresentation(diff: number) {
  const state = getDiffState(diff);

  if (state === "MAS") {
    return {
      state,
      label: "Dejó más",
      shortLabel: "Más",
      text: "text-emerald-200",
      chip: "bg-emerald-500/10 border-emerald-400/20 text-emerald-100",
      icon: <TrendingUp className="h-4 w-4" />,
    };
  }

  if (state === "MENOS") {
    return {
      state,
      label: "Dejó menos",
      shortLabel: "Menos",
      text: "text-red-200",
      chip: "bg-red-500/10 border-red-400/20 text-red-100",
      icon: <TrendingDown className="h-4 w-4" />,
    };
  }

  return {
    state,
    label: "Exacto",
    shortLabel: "Exacto",
    text: "text-white",
    chip: "bg-white/10 border-white/10 text-white/70",
    icon: <CheckCircle2 className="h-4 w-4" />,
  };
}

function fmtSignedQty(n: number) {
  if (n > 0) return `+${n}`;
  return `${n}`;
}

function normalizeLooseText(value?: string | null) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

function toDateStart(value: string) {
  return new Date(`${value}T00:00:00`);
}

function toDateEndExclusive(value: string) {
  const d = new Date(`${value}T00:00:00`);
  d.setDate(d.getDate() + 1);
  return d;
}

function inventoryProductDisplayName(item?: InventoryMovementBatchItem | null) {
  const byName = String(item?.productoNombre || "").trim();
  if (byName) return byName;

  const codigo = String(
    item?.productoCodigo || item?.bolsaVaciaCodigo || "",
  ).trim();
  const tipo = String(item?.tipoHielo || "").trim();

  if (codigo && tipo) return `${codigo} ${tipo}`;
  return codigo || tipo || "PRODUCTO";
}

function buildDriverDestinatarioCandidates(
  driverName?: string | null,
  driverCode?: string | null,
) {
  const name = String(driverName || "").trim();
  const code = String(driverCode || "").trim();

  const raw = new Set<string>();

  if (name) raw.add(name);
  if (code) raw.add(code);
  if (name && code) raw.add(`${name} (${code})`);

  return Array.from(raw).map(normalizeLooseText).filter(Boolean);
}

function movementMatchesDriver(
  movement: InventoryMovementDoc,
  driverName?: string | null,
  driverCode?: string | null,
) {
  const normalizedDestinatario = normalizeLooseText(movement.destinatario);
  const normalizedCliente = normalizeLooseText(movement.clienteNombre);
  const candidates = buildDriverDestinatarioCandidates(driverName, driverCode);

  if (!candidates.length) return false;

  return candidates.some((candidate) => {
    if (!candidate) return false;
    return (
      normalizedDestinatario.includes(candidate) ||
      normalizedCliente.includes(candidate)
    );
  });
}

type ReportMode = "general" | "driver" | "assignment" | "production";

type DriverRow = {
  id: string;
  nombre: string | null;
  activo: boolean | null;
  current_status: string | null;
  firebase_codigo?: string | null;
  firebase_nombre?: string | null;
};

type AssignmentRow = {
  id: string;
  driver_id: string | null;
  work_date: string | null;
  status: string | null;
  created_at?: string | null;
};

type DeliveryRow = {
  id: string;
  assignment_id: string;
  customer_id: string | null;
  customer_nombre_snapshot: string | null;
  diner_nombre_snapshot: string | null;
  folio: string | null;
  priority: number | null;
  total_expected: number | null;
  total_real: number | null;
  status: string | null;
  created_at?: string | null;
};

type DeliveryItemRow = {
  id: string;
  delivery_id: string;
  product_id: string | null;
  qty_assigned: number | null;
  qty_real: number | null;
  precio_aplicado: number | null;
  created_at?: string | null;
};

type ProductRow = {
  id: string;
  nombre: string | null;
  kind?: string | null;
  ice_type?: string | null;
  kg_por_unidad?: number | string | null;
};

type InventoryEmployeeRow = {
  firebase_id: string;
  firebase_codigo: string;
  firebase_nombre: string;
  firebase_activo: boolean;
};

type InventoryMovementBatchItem = {
  bolsaVaciaCodigo?: string | null;
  productoCodigo?: string | null;
  productoNombre?: string | null;
  tipoHielo?: string | null;
  cantidad?: number | null;
  delta?: number | null;
};

type InventoryMovementDoc = {
  tipo?: string | null;
  batch?: boolean | null;
  salidaSubtipo?: string | null;
  salidaDestino?: string | null;
  destinatario?: string | null;
  clienteNombre?: string | null;
  fecha?: unknown;
  createdAt?: unknown;
  productoNombre?: string | null;
  productoCodigo?: string | null;
  tipoHielo?: string | null;
  cantidad?: number | null;
  deltaPrincipal?: number | null;
  items?: InventoryMovementBatchItem[] | null;
};

type InventoryProductOutput = {
  key: string;
  nombre: string;
  cantidad: number;
};

type InventoryAssignmentOutput = {
  assignment_id: string;
  driver_name: string;
  driver_code: string | null;
  work_date: string;
  total_qty: number;
  products: InventoryProductOutput[];
};

type DeliveryItemReport = DeliveryItemRow & {
  product_nombre: string;
  product_key: string;
  subtotal_estimado: number;
  subtotal_real: number;
  qty_diff: number;
};

type DeliveryReport = DeliveryRow & {
  items: DeliveryItemReport[];
  total_diff: number;
  diff_state: DiffState;
};

type AssignmentReport = AssignmentRow & {
  driver_nombre: string | null;
  driver_firebase_codigo: string | null;
  deliveries: DeliveryReport[];
  inventory_outputs: InventoryAssignmentOutput;
};

type DriverSummary = {
  driver_id: string;
  driver_nombre: string;
  driver_firebase_codigo: string | null;
  assignments_count: number;
  deliveries_count: number;
  customers_count: number;
  total_pieces: number;
  total_pieces_real: number;
  total_expected: number;
  total_real: number;
  total_difference: number;
  inventory_total_pieces: number;
  inventory_vs_expected_diff: number;
  more_count: number;
  less_count: number;
  exact_count: number;
};

type ProductSummary = {
  product_id: string;
  nombre: string;
  total_qty: number;
  total_qty_real: number;
  total_importe: number;
  total_importe_real: number;
  inventory_total_qty: number;
  inventory_vs_expected_diff: number;
  assignments_count: number;
  deliveries_count: number;
  customers_count: number;
};

type DriverFilterOption = {
  id: string;
  nombre: string;
  firebase_codigo?: string | null;
  source: "supabase" | "inventory_only";
};

type ProductionEmployeeRow = {
  id: string;
  document_id?: string | null;
  codigo: string;
  nombre: string;
  role: string;
};

type ProductionSaleItem = {
  id?: string | null;
  product_id?: string | null;
  product_name?: string | null;
  name?: string | null;
  nombre?: string | null;
  quantity?: number | string | null;
  qty?: number | string | null;
  unit_price?: number | string | null;
  precio?: number | string | null;
  subtotal?: number | string | null;
};

type ProductionSaleRow = {
  id: string;
  folio?: string | null;
  customer_id?: string | null;
  customer_name?: string | null;
  production_employee_id?: string | null;
  production_employee_name?: string | null;
  employee_id?: string | null;
  employee_name?: string | null;
  payment_method?: string | null;
  total?: number | string | null;
  total_quantity?: number | string | null;
  created_at?: string | null;
  items?: ProductionSaleItem[] | null;
};

type ProductionEmployeeSummary = {
  employee_id: string;
  employee_name: string;
  employee_code: string | null;
  sales_count: number;
  pieces_count: number;
  total_amount: number;
  efectivo: number;
  transferencia: number;
  credito: number;
};

type ProductionProductSummary = {
  key: string;
  nombre: string;
  qty: number;
  amount: number;
};

async function listInventoryEmployeesTransport(): Promise<
  InventoryEmployeeRow[]
> {
  // Reportes ya usa el código Firebase guardado en Supabase drivers.firebase_codigo.
  // Dejamos este fallback vacío para no depender de Firestore directo desde el cliente.
  return [];
}

function normalizeIceTypeReport(value?: string | null) {
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

function extractKgReport(...values: Array<string | number | null | undefined>) {
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

function buildReportProductKey(input: {
  name?: string | null;
  iceType?: string | null;
  kg?: number | string | null;
  kind?: string | null;
  productId?: string | null;
}) {
  const name = normalizeLooseText(input.name);
  const iceType = normalizeIceTypeReport(input.iceType);
  const kind = normalizeLooseText(input.kind);

  if (iceType === "BARRA" || name.includes("BARRA") || kind.includes("BARRA")) {
    return "BARRA";
  }

  const kg = extractKgReport(
    input.kg as string | number | null | undefined,
    input.name,
  );

  let type = iceType;
  if (!type) {
    if (name.includes("GOURMET")) type = "GOURMET";
    else if (name.includes("FRAP")) type = "FRAP";
    else if (name.includes("ENFRIAR")) type = "ENFRIAR";
    else if (
      name.includes("ROLITO") ||
      name.includes("BOLSA") ||
      name.includes("HIELO")
    )
      type = "ROLITO";
  }

  if (type && kg) return `${type}_${kg}`;
  if (type) return type;

  const fallback =
    name ||
    String(input.productId || "")
      .trim()
      .toUpperCase();
  return fallback || "";
}

function labelFromReportProductKey(key: string, fallback?: string | null) {
  const clean = String(key || "")
    .trim()
    .toUpperCase();
  if (clean === "BARRA") return "BARRA";

  const [typeRaw, kg] = clean.split("_");
  const type = typeRaw === "FRAPPE" ? "FRAP" : typeRaw;

  if (type && kg) return `${type} ${kg}KG`;
  return String(fallback || clean || "PRODUCTO").trim();
}

function canonicalInventoryOutputKeyReport(
  keyRaw?: string | null,
  labelRaw?: string | null,
) {
  const raw = String(keyRaw || "")
    .trim()
    .toUpperCase();
  const label = String(labelRaw || "").trim();

  if (!raw && !label) return "";

  const rawUnderscoreMatch = raw.match(
    /^(ROLITO|FRAP|FRAPPE|GOURMET|ENFRIAR)_(\d+(?:\.\d+)?)$/,
  );

  if (rawUnderscoreMatch) {
    const type =
      rawUnderscoreMatch[1] === "FRAPPE" ? "FRAP" : rawUnderscoreMatch[1];
    const kg = rawUnderscoreMatch[2].replace(/\.0+$/, "");
    return `${type}_${kg}`;
  }

  if (raw === "BARRA") return "BARRA";

  if (raw.includes("__")) {
    const parts = raw
      .split("__")
      .map((x) => x.trim())
      .filter(Boolean);
    const tipo = normalizeIceTypeReport(parts[1] || raw);
    const kg = extractKgReport(parts[2], label, raw);

    if (tipo === "BARRA") return "BARRA";
    if (tipo && kg) return `${tipo}_${kg}`;
    if (tipo) return tipo;
  }

  return buildReportProductKey({
    name: label || raw,
    iceType: raw || label,
    kg: extractKgReport(raw, label) || null,
    kind: null,
    productId: raw,
  });
}

async function getInventoryOutputViaApi(input: {
  assignment_id: string;
  work_date: string;
  driver_name: string;
  driver_code: string | null;
}): Promise<InventoryAssignmentOutput> {
  const params = new URLSearchParams();
  params.set("date", input.work_date);
  if (input.driver_code) params.set("driverCode", input.driver_code);
  if (input.driver_name) params.set("driverName", input.driver_name);

  const response = await fetch(
    `/api/inventory/global-outputs?${params.toString()}`,
    {
      method: "GET",
      cache: "no-store",
    },
  );

  const json = await response.json().catch(() => null);

  if (!response.ok || !json?.ok) {
    console.warn("[Reportes] No se pudieron leer salidas global desde API:", {
      assignment_id: input.assignment_id,
      status: response.status,
      error: json?.error || json,
    });

    return {
      assignment_id: input.assignment_id,
      driver_name: input.driver_name || "Chofer",
      driver_code: input.driver_code || null,
      work_date: input.work_date || "",
      total_qty: 0,
      products: [],
    };
  }

  const rawQtyByKey = json.qtyByKey || {};
  const rawLabelByKey = json.labelByKey || {};

  const productMap = new Map<string, InventoryProductOutput>();

  for (const [keyRaw, qtyRaw] of Object.entries(rawQtyByKey)) {
    const rawKey = String(keyRaw || "")
      .trim()
      .toUpperCase();
    const rawLabel = String(
      rawLabelByKey[keyRaw] ||
        rawLabelByKey[rawKey] ||
        labelFromReportProductKey(rawKey),
    ).trim();

    const key = canonicalInventoryOutputKeyReport(rawKey, rawLabel);
    const cantidad = Math.abs(safeNum(qtyRaw, 0));

    if (!key || cantidad <= 0) continue;

    const current = productMap.get(key);
    const nombre = labelFromReportProductKey(key, rawLabel);

    if (current) {
      current.cantidad += cantidad;
    } else {
      productMap.set(key, { key, nombre, cantidad });
    }
  }

  const products = Array.from(productMap.values()).sort(
    (a, b) => b.cantidad - a.cantidad || a.nombre.localeCompare(b.nombre, "es"),
  );

  return {
    assignment_id: input.assignment_id,
    driver_name: input.driver_name || "Chofer",
    driver_code: input.driver_code || null,
    work_date: input.work_date || "",
    total_qty: products.reduce((acc, p) => acc + p.cantidad, 0),
    products,
  };
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

function getProductionEmployeeId(sale: ProductionSaleRow) {
  return String(
    sale.production_employee_id ||
      sale.employee_id ||
      "",
  ).trim();
}

function getProductionEmployeeName(sale: ProductionSaleRow) {
  return (
    String(
      sale.production_employee_name ||
        sale.employee_name ||
        "",
    ).trim() || "Empleado no identificado"
  );
}

function getProductionItemName(item: ProductionSaleItem) {
  return (
    String(
      item.product_name ||
        item.nombre ||
        item.name ||
        "",
    ).trim() || "Producto"
  );
}

function getProductionItemQty(item: ProductionSaleItem) {
  return Math.max(
    0,
    Math.trunc(
      safeNum(
        item.quantity ?? item.qty,
        0,
      ),
    ),
  );
}

function getProductionItemUnitPrice(item: ProductionSaleItem) {
  return safeNum(
    item.unit_price ?? item.precio,
    0,
  );
}

function getProductionItemSubtotal(item: ProductionSaleItem) {
  const stored = safeNum(item.subtotal, 0);
  if (stored > 0) return stored;
  return (
    getProductionItemQty(item) *
    getProductionItemUnitPrice(item)
  );
}

function getProductionSaleTotal(sale: ProductionSaleRow) {
  const stored = safeNum(sale.total, 0);
  if (stored > 0) return stored;

  return (sale.items ?? []).reduce(
    (sum, item) =>
      sum + getProductionItemSubtotal(item),
    0,
  );
}

function getProductionSaleQty(sale: ProductionSaleRow) {
  const stored = safeNum(sale.total_quantity, 0);
  if (stored > 0) return Math.trunc(stored);

  return (sale.items ?? []).reduce(
    (sum, item) =>
      sum + getProductionItemQty(item),
    0,
  );
}

async function listInventoryOutputsByAssignment(
  assignments: Array<{
    assignment_id: string;
    work_date: string | null;
    driver_name: string | null;
    driver_code: string | null;
  }>,
) {
  const validAssignments = assignments.filter(
    (a) => a.work_date && a.driver_name,
  );
  const out = new Map<string, InventoryAssignmentOutput>();

  await Promise.all(
    validAssignments.map(async (assignment) => {
      const data = await getInventoryOutputViaApi({
        assignment_id: assignment.assignment_id,
        work_date: String(assignment.work_date),
        driver_name: String(assignment.driver_name || "Chofer"),
        driver_code: assignment.driver_code || null,
      });

      out.set(assignment.assignment_id, data);
    }),
  );

  return out;
}

export default function ReportesPage() {
  const router = useRouter();
  const guard = useAdminGuard();

  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const dd = String(today.getDate()).padStart(2, "0");
  const todayStr = `${yyyy}-${mm}-${dd}`;

  const [dateFrom, setDateFrom] = useState(todayStr);
  const [dateTo, setDateTo] = useState(todayStr);
  const [driverFilter, setDriverFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [query, setQuery] = useState("");
  const [reportMode, setReportMode] = useState<ReportMode>("general");

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [pageError, setPageError] = useState("");

  const [drivers, setDrivers] = useState<DriverRow[]>([]);
  const [inventoryDrivers, setInventoryDrivers] = useState<
    InventoryEmployeeRow[]
  >([]);
  const [rows, setRows] = useState<AssignmentReport[]>([]);
  const [productionEmployees, setProductionEmployees] = useState<ProductionEmployeeRow[]>([]);
  const [productionSales, setProductionSales] = useState<ProductionSaleRow[]>([]);
  const [productionEmployeeFilter, setProductionEmployeeFilter] = useState("all");
  const [selectedAssignmentId, setSelectedAssignmentId] = useState("");

  const selectedAssignment = useMemo(
    () => rows.find((x) => x.id === selectedAssignmentId) ?? null,
    [rows, selectedAssignmentId],
  );

  const fetchData = useCallback(async () => {
    const [
      driversRes,
      inventoryDriversRes,
      productionEmployeesResponse,
      productionSalesResponse,
    ] = await Promise.all([
      sb
        .from(T_DRIVERS)
        .select(
          "id,nombre,activo,current_status,firebase_codigo,firebase_nombre",
        )
        .order("nombre", { ascending: true }),
      listInventoryEmployeesTransport(),
      fetch("/api/admin/production-employees", {
        method: "GET",
        cache: "no-store",
      }),
      fetch("/api/production-sales/history?limit=300", {
        method: "GET",
        cache: "no-store",
      }),
    ]);

    const driversData = driversRes.data ?? [];
    const driversErr = driversRes.error;
    if (driversErr) throw driversErr;

    const inventoryDriversData = inventoryDriversRes;

    const productionEmployeesJson = await productionEmployeesResponse
      .json()
      .catch(() => null);

    const productionSalesJson = await productionSalesResponse
      .json()
      .catch(() => null);

    if (
      !productionEmployeesResponse.ok ||
      productionEmployeesJson?.ok !== true
    ) {
      throw new Error(
        productionEmployeesJson?.error ||
          `No se pudieron cargar los empleados de Producción (HTTP ${productionEmployeesResponse.status}).`,
      );
    }

    if (
      !productionSalesResponse.ok ||
      productionSalesJson?.ok !== true
    ) {
      throw new Error(
        productionSalesJson?.error ||
          `No se pudieron cargar las ventas de Producción (HTTP ${productionSalesResponse.status}).`,
      );
    }

    const productionEmployeesData = (
      (productionEmployeesJson?.data ?? []) as ProductionEmployeeRow[]
    )
      .filter(
        (employee) =>
          normalizeLooseText(employee.role) === "PRODUCCION" &&
          normalizeLooseText(employee.nombre) !== "ADMINISTRACION",
      )
      .sort((a, b) =>
        a.nombre.localeCompare(b.nombre, "es", {
          sensitivity: "base",
        }),
      );

    const productionSalesData = (
      (productionSalesJson?.data ?? []) as ProductionSaleRow[]
    ).filter((sale) => {
      const dateKey = toLocalDateKey(sale.created_at);
      return dateKey >= dateFrom && dateKey <= dateTo;
    });

    const assignmentsQuery = sb
      .from(T_ASSIGNMENTS)
      .select("id,driver_id,work_date,status,created_at")
      .gte("work_date", dateFrom)
      .lte("work_date", dateTo)
      .order("work_date", { ascending: false });

    if (driverFilter !== "all") assignmentsQuery.eq("driver_id", driverFilter);
    if (statusFilter !== "all") assignmentsQuery.eq("status", statusFilter);

    const { data: assignmentsData, error: assignmentsErr } =
      await assignmentsQuery;
    if (assignmentsErr) throw assignmentsErr;

    const assignments = (assignmentsData ?? []) as AssignmentRow[];
    const assignmentIds = assignments.map((a) => a.id);

    let deliveries: DeliveryRow[] = [];
    let items: DeliveryItemRow[] = [];
    let products: ProductRow[] = [];

    if (assignmentIds.length > 0) {
      const { data: deliveriesData, error: deliveriesErr } = await sb
        .from(T_DELIVERIES)
        .select(
          "id,assignment_id,customer_id,customer_nombre_snapshot,diner_nombre_snapshot,folio,priority,total_expected,total_real,status,created_at",
        )
        .in("assignment_id", assignmentIds)
        .order("created_at", { ascending: true });

      if (deliveriesErr) throw deliveriesErr;
      deliveries = (deliveriesData ?? []) as DeliveryRow[];

      const deliveryIds = deliveries.map((d) => d.id);

      if (deliveryIds.length > 0) {
        const { data: itemsData, error: itemsErr } = await sb
          .from(T_DELIVERY_ITEMS)
          .select(
            "id,delivery_id,product_id,qty_assigned,qty_real,precio_aplicado,created_at",
          )
          .in("delivery_id", deliveryIds)
          .order("created_at", { ascending: true });

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

    const driverMap = new Map<string, DriverRow>();
    (driversData ?? []).forEach((d: DriverRow) => {
      driverMap.set(d.id, d);
    });

    const productMap = new Map<string, ProductRow>();
    products.forEach((p) => {
      productMap.set(String(p.id), p);
    });

    const itemsByDelivery = new Map<string, DeliveryItemReport[]>();
    items.forEach((item) => {
      const qtyAssigned = safeNum(item.qty_assigned, 0);
      const qtyReal = safeNum(item.qty_real, safeNum(item.qty_assigned, 0));
      const precio = safeNum(item.precio_aplicado, 0);
      const productMeta = item.product_id
        ? productMap.get(String(item.product_id))
        : null;
      const productNombre = productMeta?.nombre || "Producto";
      const productKey = buildReportProductKey({
        name: productNombre,
        iceType: productMeta?.ice_type || null,
        kg: productMeta?.kg_por_unidad || null,
        kind: productMeta?.kind || null,
        productId: item.product_id || null,
      });

      const parsed: DeliveryItemReport = {
        ...item,
        product_nombre: productNombre,
        product_key: productKey || normalizeLooseText(productNombre),
        subtotal_estimado: qtyAssigned * precio,
        subtotal_real: qtyReal * precio,
        qty_diff: qtyReal - qtyAssigned,
      };

      if (!itemsByDelivery.has(item.delivery_id)) {
        itemsByDelivery.set(item.delivery_id, []);
      }
      itemsByDelivery.get(item.delivery_id)!.push(parsed);
    });

    const deliveriesByAssignment = new Map<string, DeliveryReport[]>();
    deliveries.forEach((delivery) => {
      const totalDiff =
        safeNum(delivery.total_real, 0) - safeNum(delivery.total_expected, 0);

      const parsed: DeliveryReport = {
        ...delivery,
        items: itemsByDelivery.get(delivery.id) ?? [],
        total_diff: totalDiff,
        diff_state: getDiffState(totalDiff),
      };

      if (!deliveriesByAssignment.has(delivery.assignment_id)) {
        deliveriesByAssignment.set(delivery.assignment_id, []);
      }
      deliveriesByAssignment.get(delivery.assignment_id)!.push(parsed);
    });

    const baseAssignments = assignments.map((assignment) => {
      const driverNombre = assignment.driver_id
        ? driverMap.get(assignment.driver_id)?.nombre || "Chofer"
        : "Sin chofer";

      const driverRow = assignment.driver_id
        ? driverMap.get(assignment.driver_id)
        : null;
      const driverFirebaseCodigo =
        String(driverRow?.firebase_codigo || "").trim() ||
        inventoryDriversData.find(
          (emp) =>
            normalizeLooseText(emp.firebase_nombre) ===
            normalizeLooseText(driverNombre),
        )?.firebase_codigo ||
        null;

      return {
        ...assignment,
        driver_nombre: driverNombre,
        driver_firebase_codigo: driverFirebaseCodigo,
        deliveries: deliveriesByAssignment.get(assignment.id) ?? [],
      };
    });

    const inventoryOutputsByAssignment = await listInventoryOutputsByAssignment(
      baseAssignments.map((assignment) => ({
        assignment_id: assignment.id,
        work_date: assignment.work_date,
        driver_name: assignment.driver_nombre,
        driver_code: assignment.driver_firebase_codigo,
      })),
    );

    const merged: AssignmentReport[] = baseAssignments.map((assignment) => ({
      ...assignment,
      inventory_outputs: inventoryOutputsByAssignment.get(assignment.id) ?? {
        assignment_id: assignment.id,
        driver_name: assignment.driver_nombre || "Chofer",
        driver_code: assignment.driver_firebase_codigo || null,
        work_date: assignment.work_date || "",
        total_qty: 0,
        products: [],
      },
    }));

    const q = query.trim().toLowerCase();
    const filtered = !q
      ? merged
      : merged.filter((assignment) => {
          const haystack = [
            assignment.driver_nombre ?? "",
            assignment.driver_firebase_codigo ?? "",
            assignment.status ?? "",
            assignment.work_date ?? "",
            ...assignment.inventory_outputs.products.flatMap((p) => [
              p.nombre,
              String(p.cantidad),
            ]),
            ...assignment.deliveries.flatMap((d) => [
              d.customer_nombre_snapshot ?? "",
              d.diner_nombre_snapshot ?? "",
              d.folio ?? "",
              d.status ?? "",
              getDiffPresentation(d.total_diff).label,
              ...d.items.flatMap((i) => [
                i.product_nombre ?? "",
                getDiffPresentation(i.qty_diff).label,
              ]),
            ]),
          ]
            .join(" ")
            .toLowerCase();

          return haystack.includes(q);
        });

    const cleanDrivers = ((driversData ?? []) as DriverRow[]).filter(
      (driver) =>
        normalizeLooseText(driver.nombre) !== "PRUEBAS",
    );

    return {
      drivers: cleanDrivers,
      inventoryDrivers: inventoryDriversData,
      rows: filtered,
      productionEmployees: productionEmployeesData,
      productionSales: productionSalesData,
    };
  }, [dateFrom, dateTo, driverFilter, statusFilter, query]);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setPageError("");

      const data = await fetchData();
      setDrivers(data.drivers);
      setInventoryDrivers(data.inventoryDrivers);
      setRows(data.rows);
      setProductionEmployees(data.productionEmployees);
      setProductionSales(data.productionSales);

      setSelectedAssignmentId((prev) => {
        if (prev && data.rows.some((x) => x.id === prev)) return prev;
        return data.rows[0]?.id ?? "";
      });
    } catch (err: any) {
      console.error("Error loading reports data:", {
        message: err?.message,
        details: err?.details,
        hint: err?.hint,
        code: err?.code,
        full: err,
      });
      setPageError(getErrorMessage(err, "No se pudieron cargar los reportes."));
      setRows([]);
      setSelectedAssignmentId("");
    } finally {
      setLoading(false);
    }
  }, [fetchData]);

  const refreshData = useCallback(async () => {
    try {
      setRefreshing(true);
      setPageError("");

      const data = await fetchData();
      setDrivers(data.drivers);
      setInventoryDrivers(data.inventoryDrivers);
      setRows(data.rows);
      setProductionEmployees(data.productionEmployees);
      setProductionSales(data.productionSales);

      setSelectedAssignmentId((prev) => {
        if (prev && data.rows.some((x) => x.id === prev)) return prev;
        return data.rows[0]?.id ?? "";
      });
    } catch (err: any) {
      console.error("Error refreshing reports data:", {
        message: err?.message,
        details: err?.details,
        hint: err?.hint,
        code: err?.code,
        full: err,
      });
      setPageError(
        getErrorMessage(err, "No se pudieron actualizar los reportes."),
      );
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

  const driverOptions = useMemo((): DriverFilterOption[] => {
    const options: DriverFilterOption[] = [];
    const used = new Set<string>();

    drivers
      .filter((d) => d.activo !== false)
      .forEach((d) => {
        options.push({
          id: d.id,
          nombre: d.nombre || "Chofer",
          source: "supabase",
        });
        used.add(normalizeLooseText(d.nombre || "Chofer"));
      });

    inventoryDrivers
      .filter((d) => d.firebase_activo)
      .forEach((d) => {
        const normalized = normalizeLooseText(d.firebase_nombre);
        if (used.has(normalized)) return;

        options.push({
          id: `inventory:${d.firebase_codigo || d.firebase_id}`,
          nombre: d.firebase_nombre || "Transporte",
          firebase_codigo: d.firebase_codigo || null,
          source: "inventory_only",
        });
      });

    return options.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  }, [drivers, inventoryDrivers]);

  const statusOptions = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => {
      if (r.status) set.add(r.status);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const kpis = useMemo(() => {
    const assignmentsCount = rows.length;
    const deliveriesCount = rows.reduce(
      (acc, a) => acc + a.deliveries.length,
      0,
    );

    const customerSet = new Set<string>();
    const driverSet = new Set<string>();

    let totalPieces = 0;
    let totalPiecesReal = 0;
    let totalExpected = 0;
    let totalReal = 0;
    let totalInventoryOutput = 0;
    let moreCount = 0;
    let lessCount = 0;
    let exactCount = 0;

    rows.forEach((assignment) => {
      if (assignment.driver_id) driverSet.add(assignment.driver_id);
      else driverSet.add(`inventory:${assignment.driver_nombre}`);

      totalInventoryOutput += assignment.inventory_outputs.total_qty;

      assignment.deliveries.forEach((delivery) => {
        if (delivery.customer_id) customerSet.add(delivery.customer_id);

        totalExpected += safeNum(delivery.total_expected, 0);
        totalReal += safeNum(delivery.total_real, 0);

        if (delivery.total_diff > 0) moreCount += 1;
        else if (delivery.total_diff < 0) lessCount += 1;
        else exactCount += 1;

        delivery.items.forEach((item) => {
          totalPieces += safeNum(item.qty_assigned, 0);
          totalPiecesReal += safeNum(
            item.qty_real,
            safeNum(item.qty_assigned, 0),
          );
        });
      });
    });

    return {
      assignmentsCount,
      deliveriesCount,
      customersCount: customerSet.size,
      driversCount: driverSet.size,
      totalPieces,
      totalPiecesReal,
      totalExpected,
      totalReal,
      totalInventoryOutput,
      totalDifference: totalReal - totalExpected,
      inventoryVsExpectedDifference: totalInventoryOutput - totalPiecesReal,
      moreCount,
      lessCount,
      exactCount,
    };
  }, [rows]);

  const driverSummary = useMemo((): DriverSummary[] => {
    const map = new Map<string, DriverSummary & { customerSet: Set<string> }>();

    rows.forEach((assignment) => {
      const driverId =
        assignment.driver_id ||
        `inventory:${assignment.driver_nombre || "sin-chofer"}`;
      const driverNombre = assignment.driver_nombre || "Sin chofer";

      if (!map.has(driverId)) {
        map.set(driverId, {
          driver_id: driverId,
          driver_nombre: driverNombre,
          driver_firebase_codigo: assignment.driver_firebase_codigo || null,
          assignments_count: 0,
          deliveries_count: 0,
          customers_count: 0,
          total_pieces: 0,
          total_pieces_real: 0,
          total_expected: 0,
          total_real: 0,
          total_difference: 0,
          inventory_total_pieces: 0,
          inventory_vs_expected_diff: 0,
          more_count: 0,
          less_count: 0,
          exact_count: 0,
          customerSet: new Set<string>(),
        });
      }

      const row = map.get(driverId)!;
      row.assignments_count += 1;
      row.inventory_total_pieces += assignment.inventory_outputs.total_qty;

      assignment.deliveries.forEach((delivery) => {
        row.deliveries_count += 1;
        row.total_expected += safeNum(delivery.total_expected, 0);
        row.total_real += safeNum(delivery.total_real, 0);
        row.total_difference += delivery.total_diff;

        if (delivery.total_diff > 0) row.more_count += 1;
        else if (delivery.total_diff < 0) row.less_count += 1;
        else row.exact_count += 1;

        if (delivery.customer_id) row.customerSet.add(delivery.customer_id);

        delivery.items.forEach((item) => {
          row.total_pieces += safeNum(item.qty_assigned, 0);
          row.total_pieces_real += safeNum(
            item.qty_real,
            safeNum(item.qty_assigned, 0),
          );
        });
      });

      row.inventory_vs_expected_diff =
        row.inventory_total_pieces - row.total_pieces_real;
    });

    const out = Array.from(map.values()).map((r) => ({
      driver_id: r.driver_id,
      driver_nombre: r.driver_nombre,
      driver_firebase_codigo: r.driver_firebase_codigo,
      assignments_count: r.assignments_count,
      deliveries_count: r.deliveries_count,
      customers_count: r.customerSet.size,
      total_pieces: r.total_pieces,
      total_pieces_real: r.total_pieces_real,
      total_expected: r.total_expected,
      total_real: r.total_real,
      total_difference: r.total_difference,
      inventory_total_pieces: r.inventory_total_pieces,
      inventory_vs_expected_diff: r.inventory_vs_expected_diff,
      more_count: r.more_count,
      less_count: r.less_count,
      exact_count: r.exact_count,
    }));

    out.sort(
      (a, b) =>
        b.total_expected - a.total_expected ||
        b.deliveries_count - a.deliveries_count ||
        a.driver_nombre.localeCompare(b.driver_nombre),
    );

    return out;
  }, [rows]);

  const productSummary = useMemo((): ProductSummary[] => {
    const map = new Map<
      string,
      ProductSummary & {
        assignmentSet: Set<string>;
        deliverySet: Set<string>;
        customerSet: Set<string>;
      }
    >();

    rows.forEach((assignment) => {
      assignment.deliveries.forEach((delivery) => {
        delivery.items.forEach((item) => {
          const key =
            item.product_key ||
            item.product_id ||
            item.product_nombre ||
            item.id;

          if (!map.has(key)) {
            map.set(key, {
              product_id: key,
              nombre: item.product_nombre || "Producto",
              total_qty: 0,
              total_qty_real: 0,
              total_importe: 0,
              total_importe_real: 0,
              inventory_total_qty: 0,
              inventory_vs_expected_diff: 0,
              assignments_count: 0,
              deliveries_count: 0,
              customers_count: 0,
              assignmentSet: new Set<string>(),
              deliverySet: new Set<string>(),
              customerSet: new Set<string>(),
            });
          }

          const row = map.get(key)!;
          row.total_qty += safeNum(item.qty_assigned, 0);
          row.total_qty_real += safeNum(
            item.qty_real,
            safeNum(item.qty_assigned, 0),
          );
          row.total_importe += safeNum(item.subtotal_estimado, 0);
          row.total_importe_real += safeNum(item.subtotal_real, 0);
          row.assignmentSet.add(assignment.id);
          row.deliverySet.add(delivery.id);
          if (delivery.customer_id) row.customerSet.add(delivery.customer_id);
        });
      });

      assignment.inventory_outputs.products.forEach((p) => {
        const key = p.key || normalizeLooseText(p.nombre) || p.nombre;

        if (!map.has(key)) {
          map.set(key, {
            product_id: key,
            nombre: p.nombre || "Producto",
            total_qty: 0,
            total_qty_real: 0,
            total_importe: 0,
            total_importe_real: 0,
            inventory_total_qty: 0,
            inventory_vs_expected_diff: 0,
            assignments_count: 0,
            deliveries_count: 0,
            customers_count: 0,
            assignmentSet: new Set<string>(),
            deliverySet: new Set<string>(),
            customerSet: new Set<string>(),
          });
        }

        const row = map.get(key)!;
        row.inventory_total_qty += safeNum(p.cantidad, 0);
      });
    });

    const out: ProductSummary[] = Array.from(map.values()).map((r) => ({
      product_id: r.product_id,
      nombre: r.nombre,
      total_qty: r.total_qty,
      total_qty_real: r.total_qty_real,
      total_importe: r.total_importe,
      total_importe_real: r.total_importe_real,
      inventory_total_qty: r.inventory_total_qty,
      inventory_vs_expected_diff: r.inventory_total_qty - r.total_qty_real,
      assignments_count: r.assignmentSet.size,
      deliveries_count: r.deliverySet.size,
      customers_count: r.customerSet.size,
    }));

    out.sort(
      (a, b) =>
        Math.max(b.total_qty, b.inventory_total_qty) -
          Math.max(a.total_qty, a.inventory_total_qty) ||
        b.total_importe - a.total_importe ||
        a.nombre.localeCompare(b.nombre),
    );

    return out;
  }, [rows]);


  const filteredProductionSales = useMemo(() => {
    const q = normalizeLooseText(query);

    return productionSales.filter((sale) => {
      if (productionEmployeeFilter !== "all") {
        const selectedEmployee = productionEmployees.find(
          (employee) => employee.id === productionEmployeeFilter,
        );

        const matchesById =
          getProductionEmployeeId(sale) === productionEmployeeFilter;

        const matchesByName =
          selectedEmployee &&
          normalizeLooseText(getProductionEmployeeName(sale)) ===
            normalizeLooseText(selectedEmployee.nombre);

        if (!matchesById && !matchesByName) {
          return false;
        }
      }

      if (!q) return true;

      const productNames = (sale.items ?? [])
        .map((item) => getProductionItemName(item))
        .join(" ");

      const haystack = normalizeLooseText(
        [
          sale.folio,
          sale.customer_name,
          getProductionEmployeeName(sale),
          sale.payment_method,
          productNames,
        ].join(" "),
      );

      return haystack.includes(q);
    });
  }, [
    productionSales,
    productionEmployeeFilter,
    productionEmployees,
    query,
  ]);

  const productionKpis = useMemo(() => {
    let totalPieces = 0;
    let totalAmount = 0;
    let efectivo = 0;
    let transferencia = 0;
    let credito = 0;
    const employeeSet = new Set<string>();
    const customerSet = new Set<string>();

    for (const sale of filteredProductionSales) {
      const amount = getProductionSaleTotal(sale);
      const payment = normalizeLooseText(
        sale.payment_method || "EFECTIVO",
      );

      totalPieces += getProductionSaleQty(sale);
      totalAmount += amount;

      const employeeId =
        getProductionEmployeeId(sale) ||
        normalizeLooseText(
          getProductionEmployeeName(sale),
        );

      if (employeeId) employeeSet.add(employeeId);
      if (sale.customer_id) {
        customerSet.add(String(sale.customer_id));
      }

      if (payment === "CREDITO") {
        credito += amount;
      } else if (payment === "TRANSFERENCIA") {
        transferencia += amount;
      } else {
        efectivo += amount;
      }
    }

    return {
      salesCount: filteredProductionSales.length,
      employeesCount: employeeSet.size,
      customersCount: customerSet.size,
      totalPieces,
      totalAmount,
      efectivo,
      transferencia,
      credito,
    };
  }, [filteredProductionSales]);

  const productionEmployeeSummary = useMemo((): ProductionEmployeeSummary[] => {
    return productionEmployees.map((employee) => {
      const sales = filteredProductionSales.filter((sale) => {
        const matchesById =
          getProductionEmployeeId(sale) === employee.id;

        const matchesByName =
          normalizeLooseText(
            getProductionEmployeeName(sale),
          ) === normalizeLooseText(employee.nombre);

        return matchesById || matchesByName;
      });

      let pieces = 0;
      let total = 0;
      let efectivo = 0;
      let transferencia = 0;
      let credito = 0;

      for (const sale of sales) {
        const amount = getProductionSaleTotal(sale);
        const payment = normalizeLooseText(
          sale.payment_method || "EFECTIVO",
        );

        pieces += getProductionSaleQty(sale);
        total += amount;

        if (payment === "CREDITO") {
          credito += amount;
        } else if (payment === "TRANSFERENCIA") {
          transferencia += amount;
        } else {
          efectivo += amount;
        }
      }

      return {
        employee_id: employee.id,
        employee_name: employee.nombre,
        employee_code: employee.codigo || null,
        sales_count: sales.length,
        pieces_count: pieces,
        total_amount: total,
        efectivo,
        transferencia,
        credito,
      };
    });
  }, [productionEmployees, filteredProductionSales]);

  const productionProductSummary = useMemo((): ProductionProductSummary[] => {
    const map = new Map<string, ProductionProductSummary>();

    for (const sale of filteredProductionSales) {
      for (const item of sale.items ?? []) {
        const name = getProductionItemName(item);
        const key =
          buildReportProductKey({
            name,
            productId: item.product_id || null,
          }) || normalizeLooseText(name);

        const current = map.get(key) ?? {
          key,
          nombre: labelFromReportProductKey(key, name),
          qty: 0,
          amount: 0,
        };

        current.qty += getProductionItemQty(item);
        current.amount += getProductionItemSubtotal(item);
        map.set(key, current);
      }
    }

    return Array.from(map.values()).sort(
      (a, b) =>
        b.qty - a.qty ||
        b.amount - a.amount ||
        a.nombre.localeCompare(b.nombre, "es"),
    );
  }, [filteredProductionSales]);

  const executiveSummary = useMemo(() => {
    const topDriver = driverSummary[0];
    const topProduct = productSummary[0];

    let busiestDate = "";
    let busiestDateCount = 0;
    const byDate = new Map<string, number>();

    rows.forEach((a) => {
      const d = a.work_date || "Sin fecha";
      byDate.set(d, (byDate.get(d) ?? 0) + a.deliveries.length);
    });

    byDate.forEach((count, date) => {
      if (count > busiestDateCount) {
        busiestDate = date;
        busiestDateCount = count;
      }
    });

    return {
      topDriver,
      topProduct,
      busiestDate,
      busiestDateCount,
    };
  }, [rows, driverSummary, productSummary]);

  const reportLabel = useMemo(() => {
    if (reportMode === "driver") return "Reporte por chofer";
    if (reportMode === "assignment") return "Reporte detallado por asignación";
    if (reportMode === "production") return "Reporte de ventas de Producción";
    return "Reporte general";
  }, [reportMode]);

  const exportToPdf = useCallback(() => {
    const selectedDriver =
      driverFilter === "all"
        ? "Todos"
        : driverOptions.find((d) => d.id === driverFilter)?.nombre || "Chofer";

    const selectedStatus = statusFilter === "all" ? "Todos" : statusFilter;

    const assignmentsRows = rows
      .map((a) => {
        const totalPieces = a.deliveries.reduce(
          (acc, d) =>
            acc + d.items.reduce((x, i) => x + safeNum(i.qty_assigned, 0), 0),
          0,
        );

        const totalExpected = a.deliveries.reduce(
          (acc, d) => acc + safeNum(d.total_expected, 0),
          0,
        );
        const totalReal = a.deliveries.reduce(
          (acc, d) => acc + safeNum(d.total_real, 0),
          0,
        );
        const totalDifference = totalReal - totalExpected;
        const diffLabel = getDiffPresentation(totalDifference).label;

        return `
          <tr>
            <td>${escapeHtml(formatOnlyDate(a.work_date))}</td>
            <td>${escapeHtml(a.driver_nombre || "—")}</td>
            <td>${escapeHtml(a.driver_firebase_codigo || "—")}</td>
            <td>${a.deliveries.length}</td>
            <td>${totalPieces}</td>
            <td>${a.inventory_outputs.total_qty}</td>
            <td>${escapeHtml(money(totalExpected))}</td>
            <td>${escapeHtml(money(totalReal))}</td>
            <td>${escapeHtml(money(totalDifference))}</td>
            <td>${escapeHtml(diffLabel)}</td>
            <td>${escapeHtml(a.status || "—")}</td>
          </tr>
        `;
      })
      .join("");

    const driversRows = driverSummary
      .map(
        (d) => `
          <tr>
            <td>${escapeHtml(d.driver_nombre)}</td>
            <td>${escapeHtml(d.driver_firebase_codigo || "—")}</td>
            <td>${d.assignments_count}</td>
            <td>${d.deliveries_count}</td>
            <td>${d.customers_count}</td>
            <td>${d.total_pieces}</td>
            <td>${d.inventory_total_pieces}</td>
            <td>${d.total_pieces_real}</td>
            <td>${escapeHtml(money(d.total_expected))}</td>
            <td>${escapeHtml(money(d.total_real))}</td>
            <td>${escapeHtml(money(d.total_difference))}</td>
            <td>${d.more_count}</td>
            <td>${d.exact_count}</td>
            <td>${d.less_count}</td>
          </tr>
        `,
      )
      .join("");

    const productsRows = productSummary
      .slice(0, 25)
      .map(
        (p) => `
          <tr>
            <td>${escapeHtml(p.nombre)}</td>
            <td>${p.total_qty}</td>
            <td>${p.inventory_total_qty}</td>
            <td>${p.total_qty_real}</td>
            <td>${escapeHtml(money(p.total_importe))}</td>
            <td>${escapeHtml(money(p.total_importe_real))}</td>
            <td>${fmtSignedQty(p.inventory_vs_expected_diff)}</td>
            <td>${p.assignments_count}</td>
            <td>${p.deliveries_count}</td>
            <td>${p.customers_count}</td>
          </tr>
        `,
      )
      .join("");


    const productionSalesRows = filteredProductionSales
      .map((sale) => `
        <tr>
          <td>${escapeHtml(formatDate(sale.created_at))}</td>
          <td>${escapeHtml(sale.folio || "VENTA")}</td>
          <td>${escapeHtml(getProductionEmployeeName(sale))}</td>
          <td>${escapeHtml(sale.customer_name || "Público general")}</td>
          <td>${getProductionSaleQty(sale)}</td>
          <td>${escapeHtml(normalizeLooseText(sale.payment_method || "EFECTIVO"))}</td>
          <td>${escapeHtml(money(getProductionSaleTotal(sale)))}</td>
        </tr>
      `)
      .join("");

    const productionEmployeesRows = productionEmployeeSummary
      .map((employee) => `
        <tr>
          <td>${escapeHtml(employee.employee_name)}</td>
          <td>${escapeHtml(employee.employee_code || "—")}</td>
          <td>${employee.sales_count}</td>
          <td>${employee.pieces_count}</td>
          <td>${escapeHtml(money(employee.efectivo))}</td>
          <td>${escapeHtml(money(employee.transferencia))}</td>
          <td>${escapeHtml(money(employee.credito))}</td>
          <td>${escapeHtml(money(employee.total_amount))}</td>
        </tr>
      `)
      .join("");

    const productionProductsRows = productionProductSummary
      .map((product) => `
        <tr>
          <td>${escapeHtml(product.nombre)}</td>
          <td>${product.qty}</td>
          <td>${escapeHtml(money(product.amount))}</td>
        </tr>
      `)
      .join("");

    const detailBlock =
      reportMode === "assignment" && selectedAssignment
        ? `
        <section class="block">
          <h2>Detalle de asignación seleccionada</h2>
          <div class="meta-grid">
            <div><strong>Fecha:</strong> ${escapeHtml(formatOnlyDate(selectedAssignment.work_date))}</div>
            <div><strong>Chofer:</strong> ${escapeHtml(selectedAssignment.driver_nombre || "—")}</div>
            <div><strong>Código inventario:</strong> ${escapeHtml(selectedAssignment.driver_firebase_codigo || "—")}</div>
            <div><strong>Estatus:</strong> ${escapeHtml(selectedAssignment.status || "—")}</div>
            <div><strong>Entregas:</strong> ${selectedAssignment.deliveries.length}</div>
            <div><strong>Salida inventario:</strong> ${selectedAssignment.inventory_outputs.total_qty} pzas</div>
          </div>
        </section>

        <section class="block">
          <h2>Salidas inventario por producto</h2>
          <table>
            <thead>
              <tr>
                <th>Producto</th>
                <th>Cantidad salida inventario</th>
              </tr>
            </thead>
            <tbody>
              ${
                selectedAssignment.inventory_outputs.products.length === 0
                  ? '<tr><td colspan="2">Sin salidas de inventario registradas para este chofer en la fecha.</td></tr>'
                  : selectedAssignment.inventory_outputs.products
                      .map(
                        (p) => `
                          <tr>
                            <td>${escapeHtml(p.nombre)}</td>
                            <td>${p.cantidad}</td>
                          </tr>
                        `,
                      )
                      .join("")
              }
            </tbody>
          </table>
        </section>

        <section class="block">
          <h2>Detalle por cliente</h2>
          ${
            selectedAssignment.deliveries.length === 0
              ? "<p>Sin entregas registradas.</p>"
              : selectedAssignment.deliveries
                  .map(
                    (d, idx) => `
                    <div style="border:1px solid #d1d5db;border-radius:12px;padding:12px;margin-bottom:16px;">
                      <div style="margin-bottom:10px;">
                        <div style="font-size:14px;font-weight:700;">
                          ${idx + 1}. ${escapeHtml(d.customer_nombre_snapshot || "Cliente")}
                        </div>
                        <div style="font-size:12px;color:#6b7280;margin-top:4px;">
                          Comedor: ${escapeHtml(d.diner_nombre_snapshot || "Sin comedor")} •
                          Folio: ${escapeHtml(d.folio || "—")} •
                          Prioridad: ${safeNum(d.priority, 0)} •
                          Estado: ${escapeHtml(d.status || "—")}
                        </div>
                      </div>

                      <table style="margin-bottom:10px;">
                        <thead>
                          <tr>
                            <th>Total esperado</th>
                            <th>Total real</th>
                            <th>Diferencia</th>
                            <th>Resultado</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr>
                            <td>${escapeHtml(money(d.total_expected))}</td>
                            <td>${escapeHtml(money(d.total_real))}</td>
                            <td>${escapeHtml(money(d.total_diff))}</td>
                            <td>${escapeHtml(getDiffPresentation(d.total_diff).label)}</td>
                          </tr>
                        </tbody>
                      </table>

                      <table>
                        <thead>
                          <tr>
                            <th>Producto</th>
                            <th>Cant. esperada</th>
                            <th>Cant. real</th>
                            <th>Diferencia</th>
                            <th>Importe esperado</th>
                            <th>Importe real</th>
                            <th>Resultado</th>
                          </tr>
                        </thead>
                        <tbody>
                          ${
                            d.items.length === 0
                              ? '<tr><td colspan="7">Sin productos registrados</td></tr>'
                              : d.items
                                  .map(
                                    (item) => `
                                    <tr>
                                      <td>${escapeHtml(item.product_nombre || "Producto")}</td>
                                      <td>${safeNum(item.qty_assigned, 0)}</td>
                                      <td>${safeNum(item.qty_real, safeNum(item.qty_assigned, 0))}</td>
                                      <td>${escapeHtml(fmtSignedQty(item.qty_diff))}</td>
                                      <td>${escapeHtml(money(item.subtotal_estimado))}</td>
                                      <td>${escapeHtml(money(item.subtotal_real))}</td>
                                      <td>${escapeHtml(getDiffPresentation(item.qty_diff).label)}</td>
                                    </tr>
                                  `,
                                  )
                                  .join("")
                          }
                        </tbody>
                      </table>
                    </div>
                  `,
                  )
                  .join("")
          }
        </section>
      `
        : "";

    const html = `
      <html>
        <head>
          <title>${reportLabel}</title>
          <meta charset="utf-8" />
          <style>
            body { font-family: Arial, Helvetica, sans-serif; color: #111827; margin: 24px; }
            .header { border-bottom: 2px solid #d1d5db; padding-bottom: 12px; margin-bottom: 20px; }
            .title { font-size: 24px; font-weight: 700; margin: 0; }
            .subtitle { font-size: 12px; color: #6b7280; margin-top: 6px; }
            .meta-grid {
              display: grid;
              grid-template-columns: repeat(2, minmax(0, 1fr));
              gap: 10px;
              margin: 12px 0 20px;
              font-size: 13px;
            }
            .kpis {
              display: grid;
              grid-template-columns: repeat(4, minmax(0, 1fr));
              gap: 12px;
              margin-bottom: 20px;
            }
            .kpi {
              border: 1px solid #d1d5db;
              border-radius: 12px;
              padding: 12px;
            }
            .kpi-label { font-size: 12px; color: #6b7280; margin-bottom: 6px; }
            .kpi-value { font-size: 20px; font-weight: 700; }
            .block { margin-bottom: 24px; }
            h2 { font-size: 16px; margin: 0 0 10px; }
            table { width: 100%; border-collapse: collapse; font-size: 12px; }
            th, td {
              border: 1px solid #d1d5db;
              padding: 8px;
              text-align: left;
              vertical-align: top;
            }
            th { background: #f3f4f6; }
            .footer { margin-top: 20px; font-size: 11px; color: #6b7280; }
            @media print { body { margin: 14px; } }
          </style>
        </head>
        <body>
          <div class="header">
            <h1 class="title">${escapeHtml(reportLabel)}</h1>
            <div class="subtitle">
              Sistema de Entregas + Inventario • Generado el ${escapeHtml(formatDate(new Date().toISOString()))}
            </div>
          </div>

          <section class="block">
            <h2>Filtros aplicados</h2>
            <div class="meta-grid">
              <div><strong>Desde:</strong> ${escapeHtml(formatOnlyDate(dateFrom))}</div>
              <div><strong>Hasta:</strong> ${escapeHtml(formatOnlyDate(dateTo))}</div>
              <div><strong>Chofer:</strong> ${escapeHtml(selectedDriver)}</div>
              <div><strong>Estatus:</strong> ${escapeHtml(selectedStatus)}</div>
            </div>
          </section>

          <section class="kpis">
            <div class="kpi"><div class="kpi-label">Asignaciones</div><div class="kpi-value">${kpis.assignmentsCount}</div></div>
            <div class="kpi"><div class="kpi-label">Entregas</div><div class="kpi-value">${kpis.deliveriesCount}</div></div>
            <div class="kpi"><div class="kpi-label">Clientes</div><div class="kpi-value">${kpis.customersCount}</div></div>
            <div class="kpi"><div class="kpi-label">Choferes</div><div class="kpi-value">${kpis.driversCount}</div></div>
            <div class="kpi"><div class="kpi-label">Piezas esperadas</div><div class="kpi-value">${kpis.totalPieces}</div></div>
            <div class="kpi"><div class="kpi-label">Piezas reales</div><div class="kpi-value">${kpis.totalPiecesReal}</div></div>
            <div class="kpi"><div class="kpi-label">Salida inventario</div><div class="kpi-value">${kpis.totalInventoryOutput}</div></div>
            <div class="kpi"><div class="kpi-label">Total esperado</div><div class="kpi-value">${escapeHtml(money(kpis.totalExpected))}</div></div>
            <div class="kpi"><div class="kpi-label">Total real</div><div class="kpi-value">${escapeHtml(money(kpis.totalReal))}</div></div>
            <div class="kpi"><div class="kpi-label">Diferencia real</div><div class="kpi-value">${escapeHtml(money(kpis.totalDifference))}</div></div>
            <div class="kpi"><div class="kpi-label">Inv vs real</div><div class="kpi-value">${kpis.inventoryVsExpectedDifference}</div></div>
            <div class="kpi"><div class="kpi-label">Más / Exacto / Menos</div><div class="kpi-value">${kpis.moreCount} / ${kpis.exactCount} / ${kpis.lessCount}</div></div>
          </section>

          <section class="block">
            <h2>Resumen por asignación</h2>
            <table>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Chofer</th>
                  <th>Código inv.</th>
                  <th>Entregas</th>
                  <th>Piezas esperadas</th>
                  <th>Salida inventario</th>
                  <th>Total esperado</th>
                  <th>Total real</th>
                  <th>Diferencia</th>
                  <th>Estado</th>
                  <th>Estatus</th>
                </tr>
              </thead>
              <tbody>
                ${assignmentsRows || '<tr><td colspan="11">Sin datos</td></tr>'}
              </tbody>
            </table>
          </section>

          <section class="block">
            <h2>Resumen por chofer</h2>
            <table>
              <thead>
                <tr>
                  <th>Chofer</th>
                  <th>Código inv.</th>
                  <th>Asignaciones</th>
                  <th>Entregas</th>
                  <th>Clientes</th>
                  <th>Pzas esp.</th>
                  <th>Salida inventario</th>
                  <th>Pzas reales</th>
                  <th>Total esperado</th>
                  <th>Total real</th>
                  <th>Diferencia</th>
                  <th>Más</th>
                  <th>Exactas</th>
                  <th>Menos</th>
                </tr>
              </thead>
              <tbody>
                ${driversRows || '<tr><td colspan="14">Sin datos</td></tr>'}
              </tbody>
            </table>
          </section>

          <section class="block">
            <h2>Consolidado por producto</h2>
            <table>
              <thead>
                <tr>
                  <th>Producto</th>
                  <th>Pzas esperadas</th>
                  <th>Salida inventario</th>
                  <th>Pzas reales</th>
                  <th>Importe esperado</th>
                  <th>Importe real</th>
                  <th>Inv vs real</th>
                  <th>Asignaciones</th>
                  <th>Entregas</th>
                  <th>Clientes</th>
                </tr>
              </thead>
              <tbody>
                ${productsRows || '<tr><td colspan="10">Sin datos</td></tr>'}
              </tbody>
            </table>
          </section>

          ${
            reportMode === "general" || reportMode === "production"
              ? `
                <section class="block">
                  <h2>Ventas de Producción</h2>
                  <div class="kpis">
                    <div class="kpi"><div class="kpi-label">Ventas</div><div class="kpi-value">${productionKpis.salesCount}</div></div>
                    <div class="kpi"><div class="kpi-label">Empleados con actividad</div><div class="kpi-value">${productionKpis.employeesCount}</div></div>
                    <div class="kpi"><div class="kpi-label">Piezas</div><div class="kpi-value">${productionKpis.totalPieces}</div></div>
                    <div class="kpi"><div class="kpi-label">Total vendido</div><div class="kpi-value">${escapeHtml(money(productionKpis.totalAmount))}</div></div>
                  </div>

                  <table>
                    <thead>
                      <tr>
                        <th>Fecha</th>
                        <th>Folio</th>
                        <th>Empleado</th>
                        <th>Cliente</th>
                        <th>Piezas</th>
                        <th>Pago</th>
                        <th>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${productionSalesRows || '<tr><td colspan="7">Sin ventas de Producción</td></tr>'}
                    </tbody>
                  </table>
                </section>

                <section class="block">
                  <h2>Producción por empleado</h2>
                  <table>
                    <thead>
                      <tr>
                        <th>Empleado</th>
                        <th>Código</th>
                        <th>Ventas</th>
                        <th>Piezas</th>
                        <th>Efectivo</th>
                        <th>Transferencia</th>
                        <th>Crédito</th>
                        <th>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${productionEmployeesRows || '<tr><td colspan="8">Sin empleados de Producción</td></tr>'}
                    </tbody>
                  </table>
                </section>

                <section class="block">
                  <h2>Productos vendidos por Producción</h2>
                  <table>
                    <thead>
                      <tr>
                        <th>Producto</th>
                        <th>Piezas</th>
                        <th>Importe</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${productionProductsRows || '<tr><td colspan="3">Sin productos vendidos</td></tr>'}
                    </tbody>
                  </table>
                </section>
              `
              : ""
          }

          ${detailBlock}

          <div class="footer">
            Documento ejecutivo generado desde el módulo de reportes.
          </div>
        </body>
      </html>
    `;

    const win = window.open("", "_blank", "width=1100,height=900");
    if (!win) return;

    win.document.open();
    win.document.write(html);
    win.document.close();

    setTimeout(() => {
      win.focus();
      win.print();
    }, 450);
  }, [
    dateFrom,
    dateTo,
    driverFilter,
    driverOptions,
    driverSummary,
    kpis,
    productSummary,
    reportLabel,
    reportMode,
    rows,
    selectedAssignment,
    statusFilter,
    filteredProductionSales,
    productionEmployeeSummary,
    productionProductSummary,
    productionKpis,
  ]);

  if (guard.loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#0A1A2F] via-[#1E4A7A] to-[#2D1B3A]">
        <Skeleton />
      </div>
    );
  }

  if (!guard.isAuthed) return null;

  const totalDiffPresentation = getDiffPresentation(kpis.totalDifference);
  const inventoryExpectedTone = getDiffPresentation(
    kpis.inventoryVsExpectedDifference,
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0A1A2F] via-[#1E4A7A]/90 to-[#2D1B3A]">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: -18 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-4">
              <div className="rounded-2xl bg-gradient-to-br from-blue-500 to-sky-400 p-3 shadow-lg">
                <BarChart3 className="h-8 w-8 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">Reportes</h1>
                <p className="text-sm text-white/55">
                  Vista ejecutiva de entregas + inventario por chofer,
                  asignación y producto.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => router.push(PATHS.admin.dashboard)}
                className="flex items-center gap-2 rounded-xl bg-white/10 px-4 py-2 text-sm text-white/80 hover:bg-white/20 transition-colors"
              >
                Dashboard
                <ChevronRight className="h-4 w-4" />
              </button>

              <button
                onClick={() => router.push("/admin/reportes/minuta")}
                className="flex items-center gap-2 rounded-xl border border-amber-400/20 bg-amber-500/20 px-4 py-2 text-sm font-semibold text-amber-100 transition-colors hover:bg-amber-500/30"
              >
                <ClipboardList className="h-4 w-4" />
                Minuta
              </button>

              <button
                onClick={() => void refreshData()}
                disabled={refreshing}
                className="rounded-xl bg-white/10 p-3 text-white/80 hover:bg-white/20 disabled:opacity-50"
                title="Refrescar"
              >
                <RefreshCw
                  className={cx("h-4 w-4", refreshing && "animate-spin")}
                />
              </button>

              <button
                onClick={exportToPdf}
                disabled={rows.length === 0}
                className={cx(
                  "flex items-center gap-2 rounded-xl px-4 py-3 font-medium transition-all shadow-lg",
                  rows.length === 0
                    ? "bg-white/10 text-white/30 cursor-not-allowed"
                    : "bg-gradient-to-r from-blue-900 to-blue-600 text-white hover:from-sky-400 hover:to-sky-500",
                )}
              >
                <Download className="h-4 w-4" />
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
              className="mb-6 rounded-xl bg-red-500/20 border border-red-500/30 p-4"
            >
              <div className="flex items-center gap-3 text-red-200">
                <AlertCircle className="h-5 w-5" />
                <div>
                  <p className="font-medium">
                    No se pudieron cargar los reportes
                  </p>
                  <p className="text-sm text-red-100/85">{pageError}</p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="mb-5 rounded-2xl bg-white/5 backdrop-blur-xl border border-white/10 p-4">
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-7">
            <FieldBlock label="Modo de reporte">
              <select
                value={reportMode}
                onChange={(e) => setReportMode(e.target.value as ReportMode)}
                className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-[#1E4A7A]"
              >
                <option value="general" className="bg-[#0A1A2F] text-white">
                  General
                </option>
                <option value="driver" className="bg-[#0A1A2F] text-white">
                  Por chofer
                </option>
                <option value="assignment" className="bg-[#0A1A2F] text-white">
                  Detallado por asignación
                </option>
                <option value="production" className="bg-[#0A1A2F] text-white">
                  Ventas de Producción
                </option>
              </select>
            </FieldBlock>

            <FieldBlock label="Desde">
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-[#1E4A7A]"
              />
            </FieldBlock>

            <FieldBlock label="Hasta">
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-[#1E4A7A]"
              />
            </FieldBlock>

            <FieldBlock label="Chofer">
              <select
                value={driverFilter}
                onChange={(e) => setDriverFilter(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-[#1E4A7A]"
              >
                <option value="all" className="bg-[#0A1A2F] text-white">
                  Todos
                </option>
                {driverOptions.map((d) => (
                  <option
                    key={d.id}
                    value={d.id}
                    className="bg-[#0A1A2F] text-white"
                  >
                    {d.nombre}
                    {d.firebase_codigo ? ` • ${d.firebase_codigo}` : ""}
                    {d.source === "inventory_only" ? " • solo inventario" : ""}
                  </option>
                ))}
              </select>
            </FieldBlock>

            <FieldBlock label="Empleado Producción">
              <select
                value={productionEmployeeFilter}
                onChange={(e) => setProductionEmployeeFilter(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-[#1E4A7A]"
              >
                <option value="all" className="bg-[#0A1A2F] text-white">
                  Todos
                </option>
                {productionEmployees.map((employee) => (
                  <option
                    key={employee.id}
                    value={employee.id}
                    className="bg-[#0A1A2F] text-white"
                  >
                    {employee.nombre}
                    {employee.codigo ? ` • ${employee.codigo}` : ""}
                  </option>
                ))}
              </select>
            </FieldBlock>

            <FieldBlock label="Estatus">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-[#1E4A7A]"
              >
                <option value="all" className="bg-[#0A1A2F] text-white">
                  Todos
                </option>
                {statusOptions.map((s) => (
                  <option key={s} value={s} className="bg-[#0A1A2F] text-white">
                    {s}
                  </option>
                ))}
              </select>
            </FieldBlock>

            <FieldBlock label="Buscar">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Chofer, cliente, folio, producto..."
                  className="w-full rounded-xl border border-white/10 bg-white/5 pl-9 pr-3 py-3 text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-[#1E4A7A]"
                />
              </div>
            </FieldBlock>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              onClick={() => void loadData()}
              className="rounded-xl bg-white/10 px-4 py-2 text-sm text-white/80 hover:bg-white/20"
            >
              Aplicar filtros
            </button>

            <button
              onClick={() => {
                setDateFrom(todayStr);
                setDateTo(todayStr);
                setDriverFilter("all");
                setStatusFilter("all");
                setProductionEmployeeFilter("all");
                setQuery("");
                setReportMode("general");
              }}
              className="rounded-xl bg-white/10 px-4 py-2 text-sm text-white/80 hover:bg-white/20"
            >
              Limpiar
            </button>

            <span className="ml-auto text-sm text-white/55">
              Rango:{" "}
              <span className="font-semibold text-white">
                {formatOnlyDate(dateFrom)}
              </span>{" "}
              —{" "}
              <span className="font-semibold text-white">
                {formatOnlyDate(dateTo)}
              </span>
            </span>
          </div>
        </div>

        <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="lg:col-span-1">
            <div className="rounded-2xl bg-white/5 backdrop-blur-xl border border-white/10 overflow-hidden">
              <div className="border-b border-white/10 p-4">
                <p className="text-white font-semibold flex items-center gap-2">
                  <ClipboardList className="h-4 w-4" />
                  Asignaciones del rango
                </p>
                <p className="text-xs text-white/50 mt-1">
                  Selecciona una asignación para revisar el detalle.
                </p>
              </div>

              <div className="divide-y divide-white/10 max-h-[72vh] overflow-y-auto">
                {loading ? (
                  <div className="p-6 text-center text-white/50">
                    Cargando...
                  </div>
                ) : rows.length === 0 ? (
                  <div className="p-6 text-center text-white/50">
                    No hay asignaciones para este filtro.
                  </div>
                ) : (
                  rows.map((a) => {
                    const active = a.id === selectedAssignmentId;
                    const totalPieces = a.deliveries.reduce(
                      (acc, d) =>
                        acc +
                        d.items.reduce(
                          (x, i) => x + safeNum(i.qty_assigned, 0),
                          0,
                        ),
                      0,
                    );
                    const totalPiecesReal = a.deliveries.reduce(
                      (acc, d) =>
                        acc +
                        d.items.reduce(
                          (x, i) =>
                            x + safeNum(i.qty_real, safeNum(i.qty_assigned, 0)),
                          0,
                        ),
                      0,
                    );
                    const totalExpected = a.deliveries.reduce(
                      (acc, d) => acc + safeNum(d.total_expected, 0),
                      0,
                    );
                    const totalReal = a.deliveries.reduce(
                      (acc, d) => acc + safeNum(d.total_real, 0),
                      0,
                    );
                    const totalDifference = totalReal - totalExpected;
                    const diffTone = getDiffPresentation(totalDifference);
                    const inventoryExpectedDiff =
                      a.inventory_outputs.total_qty - totalPiecesReal;
                    const invTone = getDiffPresentation(inventoryExpectedDiff);

                    return (
                      <button
                        key={a.id}
                        onClick={() => setSelectedAssignmentId(a.id)}
                        className={cx(
                          "w-full text-left p-4 hover:bg-white/5 transition",
                          active && "bg-white/10",
                        )}
                      >
                        <div className="flex items-start gap-3">
                          <div className="h-10 w-10 rounded-full bg-white/10 flex items-center justify-center text-white font-bold shrink-0">
                            {initials(a.driver_nombre)}
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="text-white font-medium truncate">
                                  {a.driver_nombre || "Chofer"}
                                </p>
                                <p className="text-xs text-white/50 mt-1">
                                  {formatOnlyDate(a.work_date)}
                                  {a.driver_firebase_codigo
                                    ? ` • ${a.driver_firebase_codigo}`
                                    : ""}
                                </p>
                              </div>

                              <span className="text-[11px] px-2 py-1 rounded-full border bg-white/10 border-white/10 text-white/70 shrink-0">
                                {a.status || "—"}
                              </span>
                            </div>

                            <div className="mt-2 flex flex-wrap gap-2">
                              <span className="text-[11px] px-2 py-1 rounded-full border bg-white/10 border-white/10 text-white/70">
                                {a.deliveries.length} entregas
                              </span>
                              <span className="text-[11px] px-2 py-1 rounded-full border bg-blue-500/10 border-blue-400/20 text-blue-100">
                                Esp: {totalPieces} pzas
                              </span>
                              <span className="text-[11px] px-2 py-1 rounded-full border bg-cyan-500/10 border-cyan-400/20 text-cyan-100">
                                Inv: {a.inventory_outputs.total_qty} pzas
                              </span>
                              <span className="text-[11px] px-2 py-1 rounded-full border bg-emerald-500/10 border-emerald-400/20 text-emerald-100">
                                Esp: {money(totalExpected)}
                              </span>
                              <span className="text-[11px] px-2 py-1 rounded-full border bg-violet-500/10 border-violet-400/20 text-violet-100">
                                Real: {money(totalReal)}
                              </span>
                              <span
                                className={cx(
                                  "text-[11px] px-2 py-1 rounded-full border",
                                  diffTone.chip,
                                )}
                              >
                                {diffTone.shortLabel}: {money(totalDifference)}
                              </span>
                              <span
                                className={cx(
                                  "text-[11px] px-2 py-1 rounded-full border",
                                  invTone.chip,
                                )}
                              >
                                Inv vs real:{" "}
                                {fmtSignedQty(inventoryExpectedDiff)}
                              </span>
                            </div>
                          </div>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          <div className="lg:col-span-2 space-y-6">
            <div className="rounded-2xl bg-white/5 backdrop-blur-xl border border-white/10 overflow-hidden">
              <div className="border-b border-white/10 p-4">
                <p className="text-white font-semibold">{reportLabel}</p>
                <p className="text-xs text-white/50">
                  Resumen ejecutivo consolidado del rango seleccionado.
                </p>
              </div>

              <div className="p-4 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <SideKpi
                    title="Chofer líder"
                    value={executiveSummary.topDriver?.driver_nombre || "—"}
                    icon={<Truck className="h-4 w-4" />}
                  />
                  <SideKpi
                    title="Producto líder"
                    value={executiveSummary.topProduct?.nombre || "—"}
                    icon={<Package className="h-4 w-4" />}
                  />
                  <SideKpi
                    title="Fecha más cargada"
                    value={
                      executiveSummary.busiestDate
                        ? formatOnlyDate(executiveSummary.busiestDate)
                        : "—"
                    }
                    icon={<CalendarDays className="h-4 w-4" />}
                  />
                  <SideKpi
                    title="Entregas esa fecha"
                    value={executiveSummary.busiestDateCount || 0}
                    icon={<Layers3 className="h-4 w-4" />}
                  />
                </div>
              </div>
            </div>

            <div className="rounded-2xl bg-white/5 backdrop-blur-xl border border-white/10 overflow-hidden">
              <div className="border-b border-white/10 p-4">
                <p className="text-white font-semibold flex items-center gap-2">
                  <Package className="h-4 w-4" />
                  Consolidado por producto
                </p>
                <p className="text-xs text-white/50 mt-1">
                  Productos con movimiento en entregas y salidas de inventario.
                </p>
              </div>

              <div className="max-h-[34vh] overflow-y-auto divide-y divide-white/10">
                {productSummary.length === 0 ? (
                  <div className="p-6 text-center text-white/50">
                    Sin datos.
                  </div>
                ) : (
                  productSummary.slice(0, 25).map((p) => {
                    const importeDiff = p.total_importe_real - p.total_importe;
                    const tone = getDiffPresentation(importeDiff);
                    const invTone = getDiffPresentation(
                      p.inventory_vs_expected_diff,
                    );

                    return (
                      <div key={p.product_id} className="px-4 py-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-white text-sm font-medium">
                              {p.nombre}
                            </p>
                            <p className="text-xs text-white/50 mt-1">
                              Asignaciones: {p.assignments_count} • Entregas:{" "}
                              {p.deliveries_count} • Clientes:{" "}
                              {p.customers_count}
                            </p>
                            <div className="mt-2 flex flex-wrap gap-2">
                              <span className="text-[11px] px-2 py-1 rounded-full border bg-blue-500/10 border-blue-400/20 text-blue-100">
                                Esp: {p.total_qty} pzas
                              </span>
                              <span className="text-[11px] px-2 py-1 rounded-full border bg-cyan-500/10 border-cyan-400/20 text-cyan-100">
                                Inv: {p.inventory_total_qty} pzas
                              </span>
                              <span className="text-[11px] px-2 py-1 rounded-full border bg-violet-500/10 border-violet-400/20 text-violet-100">
                                Real: {p.total_qty_real} pzas
                              </span>
                              <span
                                className={cx(
                                  "text-[11px] px-2 py-1 rounded-full border",
                                  tone.chip,
                                )}
                              >
                                {tone.label}: {money(importeDiff)}
                              </span>
                              <span
                                className={cx(
                                  "text-[11px] px-2 py-1 rounded-full border",
                                  invTone.chip,
                                )}
                              >
                                Inv vs real:{" "}
                                {fmtSignedQty(p.inventory_vs_expected_diff)}
                              </span>
                            </div>
                          </div>

                          <div className="text-right shrink-0">
                            <p className="text-white font-semibold">
                              {money(p.total_importe)}
                            </p>
                            <p className="text-xs text-white/50">
                              Real: {money(p.total_importe_real)}
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            <div className="rounded-2xl bg-white/5 backdrop-blur-xl border border-white/10 overflow-hidden">


              {!selectedAssignment ? (
                <div className="p-10 text-center text-white/60">
                  Selecciona una asignación de la izquierda.
                </div>
              ) : (
                <div className="p-4 space-y-4">

                  <div className="rounded-2xl bg-black/10 border border-white/10 overflow-hidden">
                    <div className="border-b border-white/10 px-4 py-3">
                      <p className="text-white font-medium flex items-center gap-2">
                        <Warehouse className="h-4 w-4" />
                        Salidas inventario del chofer en esa fecha
                      </p>
                      <p className="text-xs text-white/50">
                        Lo que producción le dio al chofer en inventario.
                      </p>
                    </div>

                    <div className="p-4">
                      {selectedAssignment.inventory_outputs.products.length ===
                      0 ? (
                        <div className="text-center text-white/50 py-6">
                          Sin salidas de inventario registradas para este chofer
                          en la fecha.
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                          {selectedAssignment.inventory_outputs.products.map(
                            (p) => (
                              <div
                                key={`${selectedAssignment.id}-${p.nombre}`}
                                className="rounded-xl bg-white/5 border border-white/10 p-3 flex items-center justify-between gap-3"
                              >
                                <div className="min-w-0">
                                  <p className="text-sm text-white font-medium">
                                    {p.nombre}
                                  </p>
                                  <p className="text-xs text-white/45 mt-1">
                                    Salida inventario
                                  </p>
                                </div>
                                <div className="text-right shrink-0">
                                  <p className="text-sm font-semibold text-cyan-100">
                                    {p.cantidad} pzas
                                  </p>
                                </div>
                              </div>
                            ),
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {selectedAssignment.deliveries.length === 0 ? (
                    <div className="p-8 text-center text-white/60">
                      Esta asignación no tiene entregas.
                    </div>
                  ) : (
                    <div className="rounded-2xl bg-black/10 border border-white/10 overflow-hidden">
                      <div className="border-b border-white/10 px-4 py-3">
                        <p className="text-white font-medium">
                          Detalle por cliente
                        </p>
                        <p className="text-xs text-white/50">
                          Cliente, folio, prioridad, totales y productos.
                        </p>
                      </div>

                      <div className="max-h-[48vh] overflow-y-auto divide-y divide-white/10">
                        {selectedAssignment.deliveries.map((d, idx) => {
                          const diffTone = getDiffPresentation(d.total_diff);

                          return (
                            <div key={d.id} className="px-4 py-4">
                              <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-start gap-3">
                                    <div className="h-10 w-10 rounded-full bg-white/10 flex items-center justify-center text-white font-bold shrink-0">
                                      {initials(d.customer_nombre_snapshot)}
                                    </div>

                                    <div className="min-w-0">
                                      <p className="text-white font-medium">
                                        {idx + 1}.{" "}
                                        {d.customer_nombre_snapshot ||
                                          "Cliente"}
                                      </p>
                                      <p className="text-xs text-white/50 mt-1">
                                        {d.diner_nombre_snapshot ||
                                          "Sin comedor"}
                                      </p>

                                      <div className="mt-2 flex flex-wrap gap-2">
                                        <span className="px-2 py-1 rounded-full text-xs bg-white/10 border border-white/10 text-white/70 inline-flex items-center gap-1">
                                          <Hash className="h-3 w-3" />
                                          {d.folio || "—"}
                                        </span>

                                        <span className="px-2 py-1 rounded-full text-xs bg-white/10 border border-white/10 text-white/70">
                                          Prioridad {safeNum(d.priority, 0)}
                                        </span>

                                        <span className="px-2 py-1 rounded-full text-xs bg-white/10 border border-white/10 text-white/70">
                                          {d.status || "—"}
                                        </span>

                                        <span className="px-2 py-1 rounded-full text-xs bg-blue-500/10 border border-blue-400/20 text-blue-100">
                                          {d.items.reduce(
                                            (acc, i) =>
                                              acc + safeNum(i.qty_assigned, 0),
                                            0,
                                          )}{" "}
                                          pzas esp.
                                        </span>

                                        <span className="px-2 py-1 rounded-full text-xs bg-violet-500/10 border border-violet-400/20 text-violet-100">
                                          {d.items.reduce(
                                            (acc, i) =>
                                              acc +
                                              safeNum(
                                                i.qty_real,
                                                safeNum(i.qty_assigned, 0),
                                              ),
                                            0,
                                          )}{" "}
                                          pzas reales
                                        </span>

                                        <span
                                          className={cx(
                                            "px-2 py-1 rounded-full text-xs border",
                                            diffTone.chip,
                                          )}
                                        >
                                          {diffTone.label}
                                        </span>
                                      </div>
                                    </div>
                                  </div>

                                  {d.items.length > 0 && (
                                    <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
                                      {d.items.map((item) => {
                                        const qtyAssigned = safeNum(
                                          item.qty_assigned,
                                          0,
                                        );
                                        const qtyReal = safeNum(
                                          item.qty_real,
                                          safeNum(item.qty_assigned, 0),
                                        );
                                        const qtyDiff = qtyReal - qtyAssigned;
                                        const itemTone =
                                          getDiffPresentation(qtyDiff);

                                        return (
                                          <div
                                            key={item.id}
                                            className="rounded-xl bg-white/5 border border-white/10 p-3 flex items-center justify-between gap-3"
                                          >
                                            <div className="min-w-0">
                                              <p className="text-sm text-white font-medium">
                                                {item.product_nombre}
                                              </p>
                                              <p className="text-xs text-white/45 mt-1">
                                                Precio:{" "}
                                                {money(item.precio_aplicado)}
                                              </p>
                                              <div className="mt-2 flex flex-wrap gap-2">
                                                <span className="text-[11px] px-2 py-1 rounded-full border bg-blue-500/10 border-blue-400/20 text-blue-100">
                                                  Esp: {qtyAssigned}
                                                </span>
                                                <span className="text-[11px] px-2 py-1 rounded-full border bg-violet-500/10 border-violet-400/20 text-violet-100">
                                                  Real: {qtyReal}
                                                </span>
                                                <span
                                                  className={cx(
                                                    "text-[11px] px-2 py-1 rounded-full border",
                                                    itemTone.chip,
                                                  )}
                                                >
                                                  {itemTone.label}:{" "}
                                                  {fmtSignedQty(qtyDiff)}
                                                </span>
                                              </div>
                                            </div>

                                            <div className="text-right shrink-0 min-w-[150px]">
                                              <p className="text-sm text-white font-semibold">
                                                Esp:{" "}
                                                {money(item.subtotal_estimado)}
                                              </p>
                                              <p className="text-xs text-white/45">
                                                Real:{" "}
                                                {money(item.subtotal_real)}
                                              </p>
                                              <p
                                                className={cx(
                                                  "text-xs mt-1 font-medium",
                                                  itemTone.text,
                                                )}
                                              >
                                                {itemTone.label}
                                              </p>
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  )}
                                </div>

                                <div className="text-left xl:text-right shrink-0 min-w-[220px]">
                                  <p className="text-xs text-white/40">
                                    Total esperado
                                  </p>
                                  <p className="text-white font-semibold">
                                    {money(d.total_expected)}
                                  </p>

                                  <p className="text-xs text-white/40 mt-2">
                                    Total real
                                  </p>
                                  <p className="text-white font-semibold">
                                    {money(d.total_real)}
                                  </p>

                                  <p className="text-xs text-white/40 mt-2">
                                    Diferencia
                                  </p>
                                  <p
                                    className={cx(
                                      "font-semibold",
                                      diffTone.text,
                                    )}
                                  >
                                    {money(d.total_diff)}
                                  </p>

                                  <div className="mt-2">
                                    <span
                                      className={cx(
                                        "inline-flex rounded-full border px-2 py-1 text-xs",
                                        diffTone.chip,
                                      )}
                                    >
                                      {diffTone.label}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {(reportMode === "general" || reportMode === "production") && (
          <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-2">
            <div className="rounded-2xl bg-white/5 backdrop-blur-xl border border-white/10 overflow-hidden">
              <div className="border-b border-white/10 p-4">
                <p className="text-white font-semibold flex items-center gap-2">
                  <Factory className="h-4 w-4" />
                  Ventas de Producción por empleado
                </p>
                <p className="text-xs text-white/50 mt-1">
                  Incluye empleados activos aunque no hayan vendido en el rango.
                </p>
              </div>

              <div className="max-h-[46vh] overflow-y-auto divide-y divide-white/10">
                {productionEmployeeSummary.length === 0 ? (
                  <div className="p-6 text-center text-white/50">
                    Sin empleados de Producción.
                  </div>
                ) : (
                  productionEmployeeSummary.map((employee) => (
                    <div key={employee.employee_id} className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold text-white">
                            {employee.employee_name}
                          </p>
                          <p className="mt-1 text-xs text-white/45">
                            {employee.employee_code || "Sin código"}
                          </p>
                        </div>

                        <p className="text-lg font-bold text-emerald-100">
                          {money(employee.total_amount)}
                        </p>
                      </div>

                      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
                        <MiniResume
                          label="Ventas"
                          value={employee.sales_count}
                          icon={<ListOrdered className="h-4 w-4" />}
                        />
                        <MiniResume
                          label="Piezas"
                          value={employee.pieces_count}
                          icon={<Boxes className="h-4 w-4" />}
                        />
                        <MiniResume
                          label="Efectivo"
                          value={money(employee.efectivo)}
                          icon={<DollarSign className="h-4 w-4" />}
                        />
                        <MiniResume
                          label="Transfer."
                          value={money(employee.transferencia)}
                          icon={<CircleDollarSign className="h-4 w-4" />}
                        />
                        <MiniResume
                          label="Crédito"
                          value={money(employee.credito)}
                          icon={<Scale className="h-4 w-4" />}
                        />
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="rounded-2xl bg-white/5 backdrop-blur-xl border border-white/10 overflow-hidden">
              <div className="border-b border-white/10 p-4">
                <p className="text-white font-semibold flex items-center gap-2">
                  <Package className="h-4 w-4" />
                  Productos vendidos por Producción
                </p>
                <p className="text-xs text-white/50 mt-1">
                  Piezas e importe dentro del rango seleccionado.
                </p>
              </div>

              <div className="max-h-[46vh] overflow-y-auto divide-y divide-white/10">
                {productionProductSummary.length === 0 ? (
                  <div className="p-6 text-center text-white/50">
                    Sin productos vendidos por Producción.
                  </div>
                ) : (
                  productionProductSummary.map((product) => (
                    <div
                      key={product.key}
                      className="flex items-center justify-between gap-4 p-4"
                    >
                      <div>
                        <p className="font-semibold text-white">
                          {product.nombre}
                        </p>
                        <p className="mt-1 text-xs text-white/45">
                          {product.qty} piezas
                        </p>
                      </div>

                      <p className="font-bold text-emerald-100">
                        {money(product.amount)}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
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
      <label className="block text-sm text-white/70 mb-2">{label}</label>
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
    <div className="rounded-2xl bg-white/5 border border-white/10 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-white/50">{label}</p>
          <p className="text-lg font-bold text-white mt-1 break-words">
            {value}
          </p>
        </div>
        <div className="rounded-xl bg-white/10 p-2 text-white/80 shrink-0">
          {icon}
        </div>
      </div>
    </div>
  );
}

function SideKpi({
  title,
  value,
  icon,
}: {
  title: string;
  value: React.ReactNode;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-xl bg-white/5 border border-white/10 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs text-white/50">{title}</p>
          <p className="text-sm font-semibold text-white mt-1 break-words">
            {value}
          </p>
        </div>
        <div className="rounded-lg bg-white/10 p-2 text-white/80 shrink-0">
          {icon}
        </div>
      </div>
    </div>
  );
}

function MiniResume({
  label,
  value,
  icon,
}: {
  label: string;
  value: React.ReactNode;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-xl bg-white/5 border border-white/10 p-3">
      <div className="flex items-center gap-2 text-white/50 text-xs">
        {icon}
        {label}
      </div>
      <div className="text-white font-semibold mt-1 break-words text-sm">
        {value}
      </div>
    </div>
  );
}

function StatusChip({
  label,
  tone,
}: {
  label: string;
  tone: "more" | "less" | "exact";
}) {
  const cls =
    tone === "more"
      ? "bg-emerald-500/10 border-emerald-400/20 text-emerald-100"
      : tone === "less"
        ? "bg-red-500/10 border-red-400/20 text-red-100"
        : "bg-white/10 border-white/10 text-white/70";

  return (
    <span className={cx("text-[11px] px-2 py-1 rounded-full border", cls)}>
      {label}
    </span>
  );
}

function Skeleton() {
  return (
    <div className="flex h-screen items-center justify-center">
      <div className="w-full max-w-md space-y-4">
        <div className="h-12 w-48 animate-pulse rounded-xl bg-white/10 mx-auto" />
        <div className="h-64 animate-pulse rounded-2xl bg-white/5" />
      </div>
    </div>
  );
}