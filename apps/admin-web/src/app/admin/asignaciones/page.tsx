"use client";

import React, { useMemo, useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";

import {
  ClipboardList,
  Plus,
  Search,
  RefreshCw,
  ChevronRight,
  Users,
  X,
  AlertCircle,
  CalendarDays,
  Truck,
  Tag,
  Minus,
  PlusCircle,
  Trash2,
  Package,
  DollarSign,
  Layers3,
  Sparkles,
  ArrowUp,
  ArrowDown,
  CheckCircle2,
  AlertTriangle,
  ShieldCheck,
  ListOrdered,
  UserRound,
  Hash,
  CircleDollarSign,
  Boxes,
  Download,
  FileText,
  Route,
  Gauge,
  Clock3,
  Flag,
  Ban,
} from "lucide-react";

import { PATHS } from "@/lib/constants/paths";
import { useAdminGuard } from "@/lib/hooks/useAdminGuard";
import { supabaseBrowser } from "@/lib/supabase/client";
import {
  useAssignmentsBuilderAdmin,
  type BatchCustomer,
  type ProductForCustomerUI,
} from "@/lib/hooks/useAssignamentBuilderAdmin";

function cx(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function money(n?: number | null) {
  if (typeof n !== "number" || Number.isNaN(n)) return "—";
  return n.toLocaleString("es-MX", { style: "currency", currency: "MXN" });
}

function moneyPlain(n?: number | null) {
  const v = typeof n === "number" && !Number.isNaN(n) ? n : 0;
  return v.toLocaleString("es-MX", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function initials(name: string) {
  return String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function safeNum(v: unknown, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function priorityTone(priority?: number | null) {
  const p = safeNum(priority, 100);
  if (p <= 10) return "bg-red-500/20 text-red-100 border-red-500/30";
  if (p <= 30) return "bg-orange-500/20 text-orange-100 border-orange-500/30";
  if (p <= 60) return "bg-yellow-500/20 text-yellow-100 border-yellow-500/30";
  return "bg-white/10 text-white/70 border-white/10";
}

function priorityLabel(priority?: number | null) {
  const p = safeNum(priority, 100);
  if (p <= 10) return "Urgente";
  if (p <= 30) return "Alta";
  if (p <= 60) return "Media";
  return "Baja";
}

function escapeHtml(value: string) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatOnlyDate(value?: string | null) {
  if (!value) return "—";
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("es-MX", { dateStyle: "medium" }).format(
    parsed,
  );
}

function formatDateTime(value?: string | null) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;

  return new Intl.DateTimeFormat("es-MX", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(parsed);
}

function normalizeDeliveryStatus(status?: string | null) {
  return String(status || "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function isConfirmedDeliveryStatus(status?: string | null) {
  const s = normalizeDeliveryStatus(status);

  return [
    "ENTREGADA",
    "CONFIRMADA",
    "FINALIZADA",
    "COMPLETADA",
    "CERRADA",
    "LIQUIDADA",
  ].includes(s);
}

function isCancelledDeliveryStatus(status?: string | null) {
  const s = normalizeDeliveryStatus(status);
  return ["CANCELADA", "CANCELADO", "ANULADA", "ANULADO"].includes(s);
}

function canCancelDelivery(status?: string | null) {
  const s = normalizeDeliveryStatus(status);
  if (!s) return true;
  return !isConfirmedDeliveryStatus(s) && !isCancelledDeliveryStatus(s);
}

function signedQty(n: number) {
  if (n > 0) return `+${n}`;
  if (n < 0) return `${n}`;
  return "0";
}

function formatKm(n?: number | null) {
  if (typeof n !== "number" || Number.isNaN(n)) return "—";
  return `${n.toLocaleString("es-MX", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })} km`;
}

function normalizeTextPdf(value?: string | null) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function normalizeLooseText(value?: string | null) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

function normalizeIceTypeForPdf(value?: string | null) {
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

function extractKgForPdf(...values: Array<string | number | null | undefined>) {
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

function buildProductKeyForPdf(input: {
  name?: string | null;
  iceType?: string | null;
  kg?: number | string | null;
  kind?: string | null;
  productId?: string | null;
}) {
  const name = normalizeLooseText(input.name);
  const iceType = normalizeIceTypeForPdf(input.iceType);
  const kind = normalizeLooseText(input.kind);

  if (iceType === "BARRA" || name.includes("BARRA") || kind.includes("BARRA")) {
    return "BARRA";
  }

  const kg = extractKgForPdf(
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

function labelFromProductKeyForPdf(key: string, fallback?: string | null) {
  const clean = String(key || "")
    .trim()
    .toUpperCase();
  if (clean === "BARRA") return "BARRA";

  const [typeRaw, kg] = clean.split("_");
  const type = typeRaw === "FRAPPE" ? "FRAP" : typeRaw;

  if (type && kg) return `${type} ${kg}KG`;
  return String(fallback || clean || "PRODUCTO").trim();
}

function productSortWeightForPdf(key: string) {
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

  const idx = order.indexOf(String(key || "").toUpperCase());
  return idx === -1 ? 999 : idx;
}

type PdfProductMeta = {
  id: string;
  nombre?: string | null;
  nombre_comercial?: string | null;
  firebase_tipo_hielo?: string | null;
  peso_kg?: number | string | null;
  kind?: string | null;
  ice_type?: string | null;
  kg_por_unidad?: number | string | null;
};

function getPdfProductNameFromMeta(meta?: PdfProductMeta | null) {
  const direct = String(meta?.nombre || meta?.nombre_comercial || "").trim();
  if (direct && normalizeLooseText(direct) !== "PRODUCTO") return direct;

  const key = buildProductKeyForPdf({
    name: direct,
    iceType: meta?.ice_type || meta?.firebase_tipo_hielo || null,
    kg: meta?.kg_por_unidad || meta?.peso_kg || null,
    kind: meta?.kind || null,
    productId: meta?.id || null,
  });

  return labelFromProductKeyForPdf(key, direct || "PRODUCTO");
}

function getPdfItemProductName(
  item: any,
  productById: Map<string, PdfProductMeta>,
) {
  const productId = String(item?.product_id || "").trim();
  const meta = productById.get(productId);
  const fromMeta = getPdfProductNameFromMeta(meta);

  if (fromMeta && normalizeLooseText(fromMeta) !== "PRODUCTO") return fromMeta;

  const fromItem = String(
    item?.product_nombre ||
      item?.nombre ||
      item?.product_name ||
      item?.producto_nombre ||
      item?.products?.nombre ||
      "",
  ).trim();

  return fromItem || fromMeta || "PRODUCTO";
}

function getPdfItemProductKey(
  item: any,
  productById: Map<string, PdfProductMeta>,
) {
  const productId = String(item?.product_id || "").trim();
  const meta = productById.get(productId);
  const name = getPdfItemProductName(item, productById);

  return buildProductKeyForPdf({
    name,
    iceType: meta?.ice_type || meta?.firebase_tipo_hielo || null,
    kg: meta?.kg_por_unidad || meta?.peso_kg || null,
    kind: meta?.kind || null,
    productId,
  });
}

function buildInventoryProductKeyForPdf(
  item?: InventoryMovementBatchItem | null,
) {
  const label = getInventoryItemLabel(item);
  return buildProductKeyForPdf({
    name: label,
    iceType: item?.tipoHielo || null,
    kg: item?.pesoKg || null,
    kind: null,
    productId: item?.productoCodigo || item?.bolsaVaciaCodigo || null,
  });
}

function firstNumeric(...values: unknown[]) {
  for (const value of values) {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

function formatClientPdfName(
  customerName?: string | null,
  dinerName?: string | null,
) {
  const customer = String(customerName || "").trim();
  const diner = String(dinerName || "").trim();

  if (customer && diner) return `${customer} - ${diner}`;
  return customer || diner || "CLIENTE";
}

function getItemUnitPrice(
  item: {
    qty_assigned?: number | null;
    qty_real?: number | null;
    subtotal_expected?: number | null;
    subtotal_real?: number | null;
    total_expected?: number | null;
    total_real?: number | null;
    price?: number | null;
    precio?: number | null;
    unit_price?: number | null;
    precio_unitario?: number | null;
    unit_price_expected?: number | null;
    precio_unitario_expected?: number | null;
    unit_price_real?: number | null;
    precio_unitario_real?: number | null;
  },
  confirmed: boolean,
) {
  const qtyAssigned = firstNumeric(item?.qty_assigned, 0);
  const qtyReal = firstNumeric(item?.qty_real, qtyAssigned, 0);

  const subtotalExpected = firstNumeric(
    item?.subtotal_expected,
    item?.total_expected,
    0,
  );

  const subtotalReal = firstNumeric(
    item?.subtotal_real,
    item?.total_real,
    subtotalExpected,
    0,
  );

  const explicitExpectedUnit = firstNumeric(
    item?.price,
    item?.precio,
    item?.unit_price,
    item?.precio_unitario,
    item?.unit_price_expected,
    item?.precio_unitario_expected,
    0,
  );

  const explicitRealUnit = firstNumeric(
    item?.unit_price_real,
    item?.precio_unitario_real,
    explicitExpectedUnit,
    0,
  );

  if (confirmed) {
    if (explicitRealUnit > 0) return explicitRealUnit;
    if (qtyReal > 0 && subtotalReal > 0) return subtotalReal / qtyReal;
    if (explicitExpectedUnit > 0) return explicitExpectedUnit;
    if (qtyAssigned > 0 && subtotalExpected > 0)
      return subtotalExpected / qtyAssigned;
    return 0;
  }

  if (explicitExpectedUnit > 0) return explicitExpectedUnit;
  if (qtyAssigned > 0 && subtotalExpected > 0)
    return subtotalExpected / qtyAssigned;
  return 0;
}

type BatchItemDetailed = {
  customer_id: string;
  customer_nombre: string;
  priority: number;
  subtotal: number;
  total_qty: number;
  items: Array<{
    product_id: string;
    nombre: string;
    qty: number;
    suggested_qty: number;
    precio: number;
    subtotal: number;
  }>;
};

type GlobalProductSummary = {
  product_id: string;
  nombre: string;
  total_qty: number;
  total_importe: number;
  customers_count: number;
};

type AssignmentDriverOption = {
  id: string;
  nombre: string;
  activo?: boolean | null;
  current_status?: string | null;
  firebase_codigo?: string | null;
  firebase_nombre?: string | null;
  synced_from_inventory?: boolean;
  only_in_inventory?: boolean;
};

type InventoryMovementBatchItem = {
  bolsaVaciaCodigo?: string | null;
  productoCodigo?: string | null;
  productoNombre?: string | null;
  tipoHielo?: string | null;
  pesoKg?: number | null;
  inventoryKey?: string | null;
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
  pesoKg?: number | null;
  inventoryKey?: string | null;
  cantidad?: number | null;
  deltaPrincipal?: number | null;
  items?: InventoryMovementBatchItem[] | null;
};

type InventoryGlobalOutputsPdf = {
  qtyByKey: Map<string, number>;
  labelByKey: Map<string, string>;
  keyByAlias: Map<string, string>;
};

function hasRealDriverId(value: unknown) {
  return String(value ?? "").trim().length > 0;
}

function toDateStart(value: string) {
  const d = new Date(`${value}T00:00:00`);
  return d;
}

function toDateEndExclusive(value: string) {
  const d = new Date(`${value}T00:00:00`);
  d.setDate(d.getDate() + 1);
  return d;
}

function normalizeProductAlias(value?: string | null) {
  return normalizeLooseText(value).replace(/\s+/g, " ").trim();
}

function buildInventoryPdfKeyFromParts(
  bolsaVaciaCodigo?: string | null,
  tipoHielo?: string | null,
  pesoKg?: number | null,
) {
  const bv = String(bolsaVaciaCodigo || "")
    .trim()
    .toUpperCase();
  const tipo = String(tipoHielo || "")
    .trim()
    .toUpperCase();
  const kg = safeNum(pesoKg, 0);

  if (bv && tipo && kg > 0) return `${bv}__${tipo}__${kg}`;
  if (bv && tipo) return `${bv}__${tipo}`;
  return "";
}

function getInventoryItemLabel(item?: InventoryMovementBatchItem | null) {
  const byName = String(item?.productoNombre || "").trim();
  if (byName) return byName;

  const codigo = String(
    item?.productoCodigo || item?.bolsaVaciaCodigo || "",
  ).trim();
  const tipo = String(item?.tipoHielo || "").trim();
  const kg = safeNum(item?.pesoKg, 0);

  if (codigo && tipo && kg > 0) return `${tipo} ${kg}KG`;
  if (codigo && tipo) return `${codigo} ${tipo}`;
  return codigo || tipo || "PRODUCTO";
}

function getInventoryItemKey(item?: InventoryMovementBatchItem | null) {
  const explicit = String(item?.inventoryKey || "").trim();
  if (explicit) return explicit.toUpperCase();

  const byParts = buildInventoryPdfKeyFromParts(
    item?.bolsaVaciaCodigo || item?.productoCodigo,
    item?.tipoHielo,
    item?.pesoKg,
  );

  if (byParts) return byParts;

  return normalizeProductAlias(getInventoryItemLabel(item));
}

function addInventoryAlias(
  keyByAlias: Map<string, string>,
  key: string,
  value?: string | null,
) {
  const alias = normalizeProductAlias(value);
  if (!alias || !key) return;
  keyByAlias.set(alias, key);
}

function resolvePdfProductKey(
  productName: string,
  inventory: InventoryGlobalOutputsPdf,
) {
  const alias = normalizeProductAlias(productName);
  return inventory.keyByAlias.get(alias) || alias;
}

function canonicalInventoryOutputKeyForPdf(
  keyRaw?: string | null,
  labelRaw?: string | null,
) {
  const raw = String(keyRaw || "")
    .trim()
    .toUpperCase();
  const label = String(labelRaw || "").trim();

  if (!raw && !label) return "";

  // Si la API ya manda una llave canónica, respetarla SIEMPRE.
  // Esto evita que FRAP_15 se vuelva ROLITO_15 cuando el label genérico
  // viene como "Bolsa vacía 15KG".
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

    // En llaves compuestas del inventario, la parte 2 suele ser el tipo
    // real de hielo. No dejar que el label genérico reemplace ese tipo.
    const tipo = normalizeIceTypeForPdf(parts[1] || raw);
    const kg = extractKgForPdf(parts[2], label, raw);

    if (tipo === "BARRA") return "BARRA";
    if (tipo && kg) return `${tipo}_${kg}`;
    if (tipo) return tipo;
  }

  return buildProductKeyForPdf({
    name: label || raw,
    iceType: raw || label,
    kg: extractKgForPdf(raw, label) || null,
    kind: null,
    productId: raw,
  });
}

function getInventoryQtyForPdfKey(
  inventory: InventoryGlobalOutputsPdf,
  productKey: string,
) {
  const key = String(productKey || "")
    .trim()
    .toUpperCase();
  if (!key) return 0;

  const direct = inventory.qtyByKey.get(key);
  if (typeof direct === "number") return direct;

  const alias = inventory.keyByAlias.get(normalizeProductAlias(key));
  if (alias) return inventory.qtyByKey.get(alias) ?? 0;

  return 0;
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

function compactPdfText(value?: string | null) {
  return normalizeLooseText(value).replace(/[^A-Z0-9]+/g, "");
}

function movementMatchesDriver(
  movement: InventoryMovementDoc,
  driverName?: string | null,
  driverCode?: string | null,
) {
  const normalizedDestinatario = normalizeLooseText(movement.destinatario);
  const normalizedCliente = normalizeLooseText(movement.clienteNombre);
  const combined = normalizeLooseText(
    `${movement.destinatario || ""} ${movement.clienteNombre || ""}`,
  );
  const compactCombined = compactPdfText(
    `${movement.destinatario || ""} ${movement.clienteNombre || ""}`,
  );

  const candidates = buildDriverDestinatarioCandidates(driverName, driverCode);

  if (!candidates.length) return false;

  const directMatch = candidates.some((candidate) => {
    if (!candidate) return false;
    return (
      normalizedDestinatario.includes(candidate) ||
      normalizedCliente.includes(candidate) ||
      compactCombined.includes(compactPdfText(candidate))
    );
  });

  if (directMatch) return true;

  const code = compactPdfText(driverCode);
  if (code && compactCombined.includes(code)) return true;

  const nameTokens = normalizeLooseText(driverName)
    .split(" ")
    .map((x) => x.trim())
    .filter((x) => x.length >= 3);

  if (nameTokens.length >= 2) {
    const matches = nameTokens.filter((token) =>
      combined.includes(token),
    ).length;
    return matches >= Math.min(2, nameTokens.length);
  }

  return false;
}

async function getInventoryGlobalOutputsForDriverPdf(
  workDate: string,
  driverId?: string | null,
  driverName?: string | null,
  driverCode?: string | null,
): Promise<InventoryGlobalOutputsPdf> {
  const qtyByKey = new Map<string, number>();
  const labelByKey = new Map<string, string>();
  const keyByAlias = new Map<string, string>();

  if (!workDate || (!driverName && !driverCode && !driverId)) {
    return { qtyByKey, labelByKey, keyByAlias };
  }

  const attempts: Array<{ driverCode?: string; driverName?: string }> = [];
  const cleanDriverCode = String(driverCode || "").trim();
  const cleanDriverName = String(driverName || "").trim();

  if (cleanDriverCode && cleanDriverName) {
    attempts.push({ driverCode: cleanDriverCode, driverName: cleanDriverName });
  }

  if (cleanDriverName) {
    attempts.push({ driverName: cleanDriverName });
  }

  if (cleanDriverCode) {
    attempts.push({ driverCode: cleanDriverCode });
  }

  if (attempts.length === 0) {
    return { qtyByKey, labelByKey, keyByAlias };
  }

  for (const attempt of attempts) {
    try {
      const params = new URLSearchParams();
      params.set("date", workDate);

      // MUY IMPORTANTE:
      // No mandamos driverId de Supabase como driverCode.
      // driverCode solo debe ser el código de inventario/Firebase, ej. USR003.
      if (attempt.driverCode) params.set("driverCode", attempt.driverCode);
      if (attempt.driverName) params.set("driverName", attempt.driverName);

      const response = await fetch(
        `/api/inventory/global-outputs?${params.toString()}`,
        {
          method: "GET",
          cache: "no-store",
        },
      );

      const json = await response.json().catch(() => null);

      if (!response.ok || !json?.ok) {
        console.warn("[PDF SALIDAS GLOBAL] API sin salidas válidas:", {
          status: response.status,
          attempt,
          error: json?.error || json,
        });
        continue;
      }

      const rawQtyByKey = json.qtyByKey || {};
      const rawLabelByKey = json.labelByKey || {};
      let loaded = 0;

      for (const [keyRaw, qtyRaw] of Object.entries(rawQtyByKey)) {
        const rawKey = String(keyRaw || "")
          .trim()
          .toUpperCase();
        const rawLabel = String(
          rawLabelByKey[keyRaw] ||
            rawLabelByKey[rawKey] ||
            labelFromProductKeyForPdf(rawKey),
        ).trim();

        const key = canonicalInventoryOutputKeyForPdf(rawKey, rawLabel);
        const qty = Math.abs(firstNumeric(qtyRaw, 0));

        if (!key || qty <= 0) continue;

        const label = labelFromProductKeyForPdf(key, rawLabel);

        qtyByKey.set(key, (qtyByKey.get(key) ?? 0) + qty);
        if (!labelByKey.has(key)) labelByKey.set(key, label);

        addInventoryAlias(keyByAlias, key, key);
        addInventoryAlias(keyByAlias, key, rawKey);
        addInventoryAlias(keyByAlias, key, rawLabel);
        addInventoryAlias(keyByAlias, key, label);
        addInventoryAlias(
          keyByAlias,
          key,
          labelFromProductKeyForPdf(key, label),
        );

        loaded += qty;
      }

      if (loaded > 0) {
        console.info("[PDF SALIDAS GLOBAL] Salidas cargadas:", {
          attempt,
          qtyByKey: Object.fromEntries(qtyByKey),
          debug: json.debug,
        });

        return { qtyByKey, labelByKey, keyByAlias };
      }

      console.warn(
        "[PDF SALIDAS GLOBAL] API respondió ok pero sin cantidades:",
        {
          attempt,
          debug: json.debug,
          qtyByKey: json.qtyByKey,
        },
      );
    } catch (error) {
      console.warn(
        "[PDF SALIDAS GLOBAL] No se pudo leer /api/inventory/global-outputs:",
        {
          attempt,
          error,
        },
      );
    }
  }

  return { qtyByKey, labelByKey, keyByAlias };
}

export default function AdminAsignacionesPage() {
  const router = useRouter();
  const guard = useAdminGuard();
  const api = useAssignmentsBuilderAdmin();

  const [driverId, setDriverId] = useState<string>("");
  const [qCustomer, setQCustomer] = useState("");
  const [openBuilder, setOpenBuilder] = useState(false);
  const [batch, setBatch] = useState<BatchCustomer[]>([]);
  const [cancellingDeliveryId, setCancellingDeliveryId] = useState<
    string | null
  >(null);

  const assignableDrivers = useMemo(() => {
    return (api.drivers as AssignmentDriverOption[])
      .filter((d) => d.activo && hasRealDriverId(d.id))
      .sort((a, b) => {
        const aName = String(a.nombre || a.firebase_nombre || "")
          .trim()
          .toLowerCase();
        const bName = String(b.nombre || b.firebase_nombre || "")
          .trim()
          .toLowerCase();
        return aName.localeCompare(bName, "es");
      });
  }, [api.drivers]);

  const inventoryOnlyDrivers = useMemo(() => {
    return (api.drivers as AssignmentDriverOption[])
      .filter((d) => d.activo && !hasRealDriverId(d.id))
      .sort((a, b) => {
        const aName = String(a.nombre || a.firebase_nombre || "")
          .trim()
          .toLowerCase();
        const bName = String(b.nombre || b.firebase_nombre || "")
          .trim()
          .toLowerCase();
        return aName.localeCompare(bName, "es");
      });
  }, [api.drivers]);

  const selectedAssignableDriver = useMemo(() => {
    return assignableDrivers.find((d) => d.id === driverId) ?? null;
  }, [assignableDrivers, driverId]);

  useEffect(() => {
    if (!driverId) return;
    const stillExists = assignableDrivers.some((d) => d.id === driverId);
    if (!stillExists) {
      setDriverId("");
    }
  }, [driverId, assignableDrivers]);

  const customersFiltered = useMemo(() => {
    const s = qCustomer.trim().toLowerCase();
    const base = api.customers.filter((c) => c.activo);

    if (!s) return base.slice(0, 40);

    return base
      .filter((c) => {
        const diner = String(c.diner_nombre ?? "").toLowerCase();
        const tel = String(c.telefono ?? "").toLowerCase();
        return (
          c.nombre.toLowerCase().includes(s) ||
          diner.includes(s) ||
          tel.includes(s)
        );
      })
      .slice(0, 80);
  }, [api.customers, qCustomer]);

  const batchByCustomer = useMemo(
    () => new Map(batch.map((b) => [b.customer_id, b])),
    [batch],
  );

  const batchSorted = useMemo(() => {
    return [...batch].sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100));
  }, [batch]);

  function openMassBuilder() {
    const selectedDriverStillValid =
      driverId && assignableDrivers.some((d) => d.id === driverId)
        ? driverId
        : "";

    const selectedAssignmentDriverStillValid =
      api.selectedAssignment?.driver_id &&
      assignableDrivers.some((d) => d.id === api.selectedAssignment?.driver_id)
        ? api.selectedAssignment.driver_id
        : "";

    const d =
      selectedDriverStillValid ||
      selectedAssignmentDriverStillValid ||
      assignableDrivers[0]?.id ||
      "";

    setDriverId(d);
    setBatch([]);
    setQCustomer("");
    setOpenBuilder(true);
  }

  function addCustomerToBatch(customerId: string) {
    setBatch((prev) => {
      if (prev.some((x) => x.customer_id === customerId)) return prev;

      return [
        ...prev,
        {
          customer_id: customerId,
          priority: 50,
          items: [],
        },
      ];
    });
  }

  function removeCustomerFromBatch(customerId: string) {
    setBatch((prev) => prev.filter((x) => x.customer_id !== customerId));
  }

  function setPriority(customerId: string, value: number) {
    const v = clamp(Math.floor(safeNum(value, 50)), 1, 100);
    setBatch((prev) =>
      prev.map((b) =>
        b.customer_id === customerId ? { ...b, priority: v } : b,
      ),
    );
  }

  function bumpPriority(customerId: string, delta: number) {
    setBatch((prev) =>
      prev.map((b) =>
        b.customer_id === customerId
          ? { ...b, priority: clamp((b.priority ?? 50) + delta, 1, 100) }
          : b,
      ),
    );
  }

  function setPriorityPreset(customerId: string, value: number) {
    setBatch((prev) =>
      prev.map((b) =>
        b.customer_id === customerId
          ? { ...b, priority: clamp(value, 1, 100) }
          : b,
      ),
    );
  }

  function addItem(customerId: string, product: ProductForCustomerUI) {
    setBatch((prev) =>
      prev.map((b) => {
        if (b.customer_id !== customerId) return b;
        if (b.items.some((it) => it.product_id === product.id)) return b;

        return {
          ...b,
          items: [
            ...b.items,
            {
              product_id: product.id,
              qty: Math.max(1, product.suggested_qty ?? 1),
            },
          ],
        };
      }),
    );
  }

  function removeItem(customerId: string, productId: string) {
    setBatch((prev) =>
      prev.map((b) => {
        if (b.customer_id !== customerId) return b;
        return {
          ...b,
          items: b.items.filter((it) => it.product_id !== productId),
        };
      }),
    );
  }

  function setQty(customerId: string, productId: string, qty: number) {
    const q = Math.max(1, Math.floor(safeNum(qty, 1)));

    setBatch((prev) =>
      prev.map((b) => {
        if (b.customer_id !== customerId) return b;
        return {
          ...b,
          items: b.items.map((it) =>
            it.product_id === productId ? { ...it, qty: q } : it,
          ),
        };
      }),
    );
  }

  function applySuggestedQty(customerId: string, productId: string) {
    const allowed = api.productsForCustomer(customerId);
    const p = allowed.find((x) => x.id === productId);
    if (!p) return;
    setQty(customerId, productId, p.suggested_qty || 1);
  }

  function fillSuggestedForCustomer(customerId: string) {
    const allowed = api.productsForCustomer(customerId);

    setBatch((prev) =>
      prev.map((b) => {
        if (b.customer_id !== customerId) return b;

        const existing = new Map(b.items.map((it) => [it.product_id, it]));
        const nextItems = [...b.items];

        for (const p of allowed) {
          const current = existing.get(p.id);
          const suggested = Math.max(1, p.suggested_qty || 1);

          if (current) {
            current.qty = suggested;
          } else {
            nextItems.push({
              product_id: p.id,
              qty: suggested,
            });
          }
        }

        return { ...b, items: [...nextItems] };
      }),
    );
  }

  function getCustomerSubtotal(customerId: string) {
    const row = batch.find((b) => b.customer_id === customerId);
    if (!row) return 0;

    const allowed = api.productsForCustomer(customerId);
    const map = new Map(allowed.map((p) => [p.id, p]));

    return row.items.reduce((acc, it) => {
      const p = map.get(it.product_id);
      if (!p) return acc;
      return acc + (p.precio_cliente_final || 0) * safeNum(it.qty, 0);
    }, 0);
  }

  function getCustomerItemsDetailed(customerId: string) {
    const row = batch.find((b) => b.customer_id === customerId);
    if (!row) return [];

    const allowed = api.productsForCustomer(customerId);
    const map = new Map(allowed.map((p) => [p.id, p]));

    return row.items
      .map((it) => {
        const p = map.get(it.product_id);
        if (!p) return null;
        return {
          product_id: it.product_id,
          nombre: p.nombre,
          qty: it.qty,
          suggested_qty: p.suggested_qty,
          precio: p.precio_cliente_final,
          subtotal: p.precio_cliente_final * it.qty,
        };
      })
      .filter(Boolean) as BatchItemDetailed["items"];
  }

  const routeTotal = useMemo(() => {
    return batch.reduce(
      (acc, b) => acc + getCustomerSubtotal(b.customer_id),
      0,
    );
  }, [batch]);

  const routeQty = useMemo(() => {
    return batch.reduce(
      (acc, b) => acc + b.items.reduce((a, it) => a + safeNum(it.qty, 0), 0),
      0,
    );
  }, [batch]);

  const batchDetailed = useMemo((): BatchItemDetailed[] => {
    return batchSorted.map((b) => {
      const c = api.customers.find((x) => x.id === b.customer_id);
      const items = getCustomerItemsDetailed(b.customer_id);

      return {
        customer_id: b.customer_id,
        customer_nombre: c?.nombre || b.customer_id,
        priority: b.priority,
        subtotal: getCustomerSubtotal(b.customer_id),
        total_qty: items.reduce((acc, it) => acc + it.qty, 0),
        items,
      };
    });
  }, [batchSorted, api.customers, batch]);

  const globalProductSummary = useMemo((): GlobalProductSummary[] => {
    const map = new Map<
      string,
      GlobalProductSummary & { customerSet: Set<string> }
    >();

    for (const customer of batchDetailed) {
      for (const item of customer.items) {
        if (!map.has(item.product_id)) {
          map.set(item.product_id, {
            product_id: item.product_id,
            nombre: item.nombre,
            total_qty: 0,
            total_importe: 0,
            customers_count: 0,
            customerSet: new Set<string>(),
          });
        }

        const row = map.get(item.product_id)!;
        row.total_qty += item.qty;
        row.total_importe += item.subtotal;
        row.customerSet.add(customer.customer_id);
      }
    }

    const out: GlobalProductSummary[] = Array.from(map.values()).map((r) => ({
      product_id: r.product_id,
      nombre: r.nombre,
      total_qty: r.total_qty,
      total_importe: r.total_importe,
      customers_count: r.customerSet.size,
    }));

    out.sort(
      (a, b) => b.total_qty - a.total_qty || a.nombre.localeCompare(b.nombre),
    );
    return out;
  }, [batchDetailed]);

  const batchOk = useMemo(() => {
    if (!driverId) return false;
    if (!assignableDrivers.some((d) => d.id === driverId)) return false;
    if (!api.workDate) return false;
    if (batch.length === 0) return false;
    if (batch.some((b) => b.items.length === 0)) return false;
    return true;
  }, [driverId, assignableDrivers, api.workDate, batch]);

  async function saveBatch() {
    if (!batchOk) return;

    const validDriver = assignableDrivers.find((d) => d.id === driverId);
    if (!validDriver) {
      alert("Selecciona un chofer válido con acceso completo en entregas.");
      return;
    }

    const assignmentId = await api.getOrCreateAssignment(
      validDriver.id,
      api.workDate,
    );
    if (!assignmentId) return;

    const res = await api.createDeliveriesBatch(assignmentId, batch);

    if (res.ok) {
      setOpenBuilder(false);
      setBatch([]);
      setQCustomer("");
      api.setSelectedAssignmentId(assignmentId);
      await api.refreshDay(api.workDate);
    }
  }

  const selectedAssignmentDeliveriesAll = useMemo(() => {
    return [...api.deliveriesDetailedOfSelected].sort(
      (a, b) => safeNum(a.priority, 100) - safeNum(b.priority, 100),
    );
  }, [api.deliveriesDetailedOfSelected]);

  const selectedAssignmentDeliveriesSorted = useMemo(() => {
    return selectedAssignmentDeliveriesAll.filter(
      (d) => !isCancelledDeliveryStatus(d.status),
    );
  }, [selectedAssignmentDeliveriesAll]);

  const cancelledDeliveries = useMemo(() => {
    return selectedAssignmentDeliveriesAll.filter((d) =>
      isCancelledDeliveryStatus(d.status),
    );
  }, [selectedAssignmentDeliveriesAll]);

  const selectedAssignmentTotal = useMemo(() => {
    return selectedAssignmentDeliveriesSorted.reduce(
      (acc, d) => acc + safeNum(d.total_expected, 0),
      0,
    );
  }, [selectedAssignmentDeliveriesSorted]);

  const confirmedDeliveriesCount = useMemo(() => {
    return selectedAssignmentDeliveriesSorted.filter((d) =>
      isConfirmedDeliveryStatus(d.status),
    ).length;
  }, [selectedAssignmentDeliveriesSorted]);

  const pendingDeliveriesCount = useMemo(() => {
    return selectedAssignmentDeliveriesSorted.filter(
      (d) => !isConfirmedDeliveryStatus(d.status),
    ).length;
  }, [selectedAssignmentDeliveriesSorted]);

  const selectedRoute = api.selectedAssignment?.route ?? null;
  const routeKmTotal =
    typeof selectedRoute?.km_start === "number" &&
    typeof selectedRoute?.km_end === "number"
      ? selectedRoute.km_end - selectedRoute.km_start
      : null;

  const cancelDelivery = useCallback(async (deliveryId: string) => {
    const { error } = await (
      supabaseBrowser as never as {
        from: (table: string) => {
          update: (payload: Record<string, unknown>) => {
            eq: (
              column: string,
              value: string,
            ) => Promise<{ error: Error | null }>;
          };
        };
      }
    )
      .from("deliveries")
      .update({
        status: "CANCELADA",
      })
      .eq("id", deliveryId);

    if (error) throw error;
  }, []);

  const handleCancelDelivery = useCallback(
    async (deliveryId: string) => {
      const ok = window.confirm(
        "¿Seguro que deseas cancelar esta entrega?\n\nLa entrega no se borrará, solo cambiará a estado CANCELADA.",
      );
      if (!ok) return;

      try {
        setCancellingDeliveryId(deliveryId);
        await cancelDelivery(deliveryId);
        await api.refreshDay(api.workDate);
      } catch (error: unknown) {
        console.error(error);
        const message =
          error instanceof Error
            ? error.message
            : "No se pudo cancelar la entrega. Revisa que la base de datos permita el estado CANCELADA.";
        alert(message);
      } finally {
        setCancellingDeliveryId(null);
      }
    },
    [api, cancelDelivery],
  );

  const exportSelectedAssignmentPdf = useCallback(async () => {
    if (!api.selectedAssignmentId || !api.selectedAssignment) return;

    const driverName = api.selectedAssignment.driver_nombre || "CHOFER";
    const workDate = api.workDate || "";
    const route = api.selectedAssignment.route;

    const driverMeta = (api.drivers as AssignmentDriverOption[]).find(
      (d) => d.id === api.selectedAssignment?.driver_id,
    );

    const driverCodeForInventory =
      String(driverMeta?.firebase_codigo || "").trim() || null;

    const inventoryGlobal = await getInventoryGlobalOutputsForDriverPdf(
      workDate,
      api.selectedAssignment.driver_id,
      driverName,
      driverCodeForInventory,
    );

    const routeStatus = String(route?.status || "NO_INICIADA");
    const routeStartedAt = formatDateTime(route?.started_at);
    const routeEndedAt = formatDateTime(route?.ended_at);
    const routeKmStart =
      typeof route?.km_start === "number" ? String(route.km_start) : "—";
    const routeKmEnd =
      typeof route?.km_end === "number" ? String(route.km_end) : "—";
    const routeKmTotalPdf =
      typeof route?.km_start === "number" && typeof route?.km_end === "number"
        ? route.km_end - route.km_start
        : null;

    const deliveries = [...selectedAssignmentDeliveriesAll].sort((a, b) => {
      const af = String(a.folio || "");
      const bf = String(b.folio || "");
      return af.localeCompare(bf, "es", { numeric: true });
    });

    const deliveryProductIds = Array.from(
      new Set(
        deliveries
          .flatMap((delivery) => delivery.items || [])
          .map((item) => String(item?.product_id || "").trim())
          .filter(Boolean),
      ),
    );

    const productById = new Map<string, PdfProductMeta>();

    for (const p of api.products || []) {
      productById.set(String(p.id), {
        id: String(p.id),
        nombre: p.nombre,
        kind: p.kind,
        ice_type: p.ice_type,
        kg_por_unidad: p.kg_por_unidad,
      });
    }

    const missingProductIds = deliveryProductIds.filter(
      (id) => !productById.has(id),
    );

    if (missingProductIds.length > 0) {
      const { data: settingRows } = await (supabaseBrowser as never as any)
        .from("inventory_product_settings")
        .select("id,nombre_comercial,firebase_tipo_hielo,peso_kg")
        .in("id", missingProductIds);

      for (const p of settingRows ?? []) {
        productById.set(String(p.id), {
          id: String(p.id),
          nombre_comercial: p.nombre_comercial ?? null,
          firebase_tipo_hielo: p.firebase_tipo_hielo ?? null,
          peso_kg: p.peso_kg ?? null,
        });
      }
    }

    const stillMissingProductIds = deliveryProductIds.filter(
      (id) => !productById.has(id),
    );

    if (stillMissingProductIds.length > 0) {
      const { data: productRows } = await (supabaseBrowser as never as any)
        .from("products")
        .select("id,nombre,kind,ice_type,kg_por_unidad")
        .in("id", stillMissingProductIds);

      for (const p of productRows ?? []) {
        productById.set(String(p.id), {
          id: String(p.id),
          nombre: p.nombre ?? null,
          kind: p.kind ?? null,
          ice_type: p.ice_type ?? null,
          kg_por_unidad: p.kg_por_unidad ?? null,
        });
      }
    }

    const productKeyLabelMap = new Map<string, string>();

    for (const delivery of deliveries) {
      for (const item of delivery.items || []) {
        const productKey = getPdfItemProductKey(item, productById);
        if (!productKey) continue;

        const productName = getPdfItemProductName(item, productById);
        const label = labelFromProductKeyForPdf(productKey, productName);

        if (!productKeyLabelMap.has(productKey)) {
          productKeyLabelMap.set(productKey, label);
        }
      }
    }

    const productKeys = Array.from(productKeyLabelMap.keys()).sort((a, b) => {
      const wa = productSortWeightForPdf(a);
      const wb = productSortWeightForPdf(b);
      if (wa !== wb) return wa - wb;

      const an = productKeyLabelMap.get(a) || a;
      const bn = productKeyLabelMap.get(b) || b;
      return an.localeCompare(bn, "es", { sensitivity: "base", numeric: true });
    });

    const assignedByProduct = new Map<string, number>();
    const soldByProduct = new Map<string, number>();

    for (const productKey of productKeys) {
      assignedByProduct.set(productKey, 0);
      soldByProduct.set(productKey, 0);
    }

    let totalEfectivo = 0;
    let totalCredito = 0;
    let totalVenta = 0;

    const headerTopHtml = productKeys
      .map((productKey) => {
        const productLabel = productKeyLabelMap.get(productKey) || productKey;

        return `
          <th rowspan="2" class="center product-group">${escapeHtml(productLabel)}</th>
        `;
      })
      .join("");

    const rowsHtml = deliveries
      .map((delivery, idx) => {
        const confirmed = isConfirmedDeliveryStatus(delivery.status);
        const cancelled = isCancelledDeliveryStatus(delivery.status);

        const rowByProduct = new Map<
          string,
          {
            qtyAssigned: number;
            qtyReal: number;
            unitPrice: number;
          }
        >();

        for (const productKey of productKeys) {
          rowByProduct.set(productKey, {
            qtyAssigned: 0,
            qtyReal: 0,
            unitPrice: 0,
          });
        }

        for (const item of delivery.items || []) {
          const productKey = getPdfItemProductKey(item, productById);
          if (!productKey) continue;

          if (!rowByProduct.has(productKey)) {
            rowByProduct.set(productKey, {
              qtyAssigned: 0,
              qtyReal: 0,
              unitPrice: 0,
            });
          }

          const qtyAssigned = firstNumeric(item?.qty_assigned, 0);
          const qtyReal = firstNumeric(item?.qty_real, qtyAssigned, 0);

          // Precio por cliente del producto asignado.
          // Usamos false para priorizar el precio esperado/asignado,
          // así el PDF muestra el precio pactado por cliente aunque la entrega
          // ya esté confirmada y exista qty_real/subtotal_real.
          const unitPrice = getItemUnitPrice(item, false);

          const current = rowByProduct.get(productKey)!;
          current.qtyAssigned += qtyAssigned;
          current.qtyReal += qtyReal;

          if (unitPrice > 0 && current.unitPrice <= 0) {
            current.unitPrice = unitPrice;
          }

          assignedByProduct.set(
            productKey,
            (assignedByProduct.get(productKey) ?? 0) + qtyAssigned,
          );

          if (confirmed && !cancelled) {
            soldByProduct.set(
              productKey,
              (soldByProduct.get(productKey) ?? 0) + qtyReal,
            );
          }
        }

        let rowRealTotal = 0;

        if (confirmed && !cancelled) {
          rowRealTotal = firstNumeric(delivery.total_real, 0);

          if (rowRealTotal <= 0) {
            rowRealTotal = (delivery.items || []).reduce(
              (acc: number, item) => {
                const qtyAssigned = firstNumeric(item?.qty_assigned, 0);
                const qtyReal = firstNumeric(item?.qty_real, qtyAssigned, 0);

                const subtotalReal = firstNumeric(
                  item?.subtotal_real,
                  item?.subtotal_expected,
                  0,
                );

                if (subtotalReal > 0) return acc + subtotalReal;

                const unitPrice = getItemUnitPrice(item, true);
                return acc + unitPrice * qtyReal;
              },
              0,
            );
          }

          const paymentMethod = normalizeTextPdf(
            delivery.payment_method || "EFECTIVO",
          );

          if (paymentMethod === "CREDITO" || paymentMethod === "CRÉDITO") {
            totalCredito += rowRealTotal;
          } else {
            totalEfectivo += rowRealTotal;
          }

          totalVenta += rowRealTotal;
        }

        const productCells = productKeys
          .map((productKey) => {
            const row = rowByProduct.get(productKey) ?? {
              qtyAssigned: 0,
              qtyReal: 0,
              unitPrice: 0,
            };

            // En la hoja operativa queremos ver lo que se ASIGNÓ al cliente
            // y el PRECIO POR CLIENTE de ese producto.
            // Las ventas reales siguen calculándose abajo con qty_real para
            // BOLSAS VENDIDAS, EFECTIVO, CRÉDITO y VENTA TOTAL.
            const qtyAssignedToShow = cancelled ? 0 : row.qtyAssigned;
            const qtyLabel =
              qtyAssignedToShow > 0 ? `${qtyAssignedToShow}` : "";
            const priceLabel =
              qtyAssignedToShow > 0 && row.unitPrice > 0
                ? `$ ${moneyPlain(row.unitPrice)}`
                : "";

            return `
              <td class="center qty-cell">
                ${
                  qtyLabel
                    ? `
                      <div class="cell-qty">${qtyLabel}</div>
                      <div class="cell-price">${priceLabel}</div>
                    `
                    : ""
                }
              </td>
            `;
          })
          .join("");

        const clientName = cancelled
          ? "CANCELADO"
          : formatClientPdfName(
              delivery.customer_nombre_snapshot,
              delivery.diner_nombre_snapshot,
            );

        const paymentMethod = normalizeTextPdf(
          delivery.payment_method || "EFECTIVO",
        );

        const efectivo =
          confirmed && !cancelled && paymentMethod !== "CREDITO"
            ? rowRealTotal
            : 0;

        const credito =
          confirmed && !cancelled && paymentMethod === "CREDITO"
            ? rowRealTotal
            : 0;

        return `
          <tr>
            <td class="center">${idx + 1}</td>
            <td>${escapeHtml(String(delivery.folio || "—"))}</td>
            <td>${escapeHtml(clientName)}</td>
            ${productCells}
            <td class="money">${efectivo > 0 ? `$ ${moneyPlain(efectivo)}` : cancelled ? "$ -" : ""}</td>
            <td class="money">${credito > 0 ? `$ ${moneyPlain(credito)}` : cancelled ? "$ -" : ""}</td>
          </tr>
        `;
      })
      .join("");

    const minRows = 22;
    const blankRowsCount = Math.max(0, minRows - deliveries.length);
    const blankProductCells = productKeys.map(() => `<td></td>`).join("");

    const blankRowsHtml = Array.from({ length: blankRowsCount })
      .map(
        (_, i) => `
          <tr>
            <td class="center">${deliveries.length + i + 1}</td>
            <td></td>
            <td></td>
            ${blankProductCells}
            <td class="money">${i === 0 ? "$ -" : ""}</td>
            <td class="money">${i === 0 ? "$ -" : ""}</td>
          </tr>
        `,
      )
      .join("");

    const bolsasVendidasRowProducts = productKeys
      .map((productKey) => {
        // BOLSAS VENDIDAS = lo realmente entregado al cliente.
        // Usa únicamente entregas confirmadas y no canceladas.
        const qty = soldByProduct.get(productKey) ?? 0;

        return `
          <td class="center summary-qty summary-cell-summary summary-merge-cell">${qty}</td>
        `;
      })
      .join("");

    const salidasGlobalRowProducts = productKeys
      .map((productKey) => {
        const qty = getInventoryQtyForPdfKey(inventoryGlobal, productKey);
        return `
          <td class="center summary-qty summary-cell-summary summary-merge-cell">${qty}</td>
        `;
      })
      .join("");

    const diffRowProducts = productKeys
      .map((productKey) => {
        // DIFERENCIA correcta:
        // - SALIDAS GLOBAL = lo que salió de Salidas Page para el chofer/producto.
        // - ENTREGADO REAL = suma de lo que realmente dejó a clientes en la app.
        //
        // Si faltó entregar producto:  salidas > entregado  => positivo.
        // Si entregó de más/sobró contra la salida: entregado > salidas => negativo.
        // Si concuerda: 0.
        const salidasGlobal = getInventoryQtyForPdfKey(
          inventoryGlobal,
          productKey,
        );
        const entregadoReal = soldByProduct.get(productKey) ?? 0;
        const diffRaw = salidasGlobal - entregadoReal;
        const diff = Math.abs(diffRaw) < 0.0001 ? 0 : diffRaw;

        const cls =
          diff > 0 ? "diff-positive" : diff < 0 ? "diff-negative" : "diff-zero";

        return `
          <td class="center summary-qty summary-cell-summary summary-merge-cell ${cls}">${signedQty(diff)}</td>
        `;
      })
      .join("");

    const summaryRowsHtml = `
      <tr class="summary-row summary-row-dark">
        <th colspan="3" class="summary-label summary-dark">BOLSAS VENDIDAS:</th>
        ${bolsasVendidasRowProducts}
        <td class="summary-dark"></td>
        <td class="summary-dark"></td>
      </tr>
      <tr class="summary-row summary-row-dark">
        <th colspan="3" class="summary-label summary-dark">SALIDAS GLOBAL:</th>
        ${salidasGlobalRowProducts}
        <td class="summary-dark"></td>
        <td class="summary-dark"></td>
      </tr>
      <tr class="summary-row summary-row-dark">
        <th colspan="3" class="summary-label summary-dark">DIFERENCIA:</th>
        ${diffRowProducts}
        <td class="summary-dark"></td>
        <td class="summary-dark"></td>
      </tr>
    `;

    const html = `
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Hoja operativa de ruta</title>
          <style>
            @page {
              size: legal landscape;
              margin: 8mm;
            }

            body {
              font-family: Arial, Helvetica, sans-serif;
              color: #111827;
              margin: 0;
              font-size: 10px;
            }

            .sheet {
              width: 100%;
            }

            .top {
              display: grid;
              grid-template-columns: 1fr 1fr 1fr;
              gap: 8px;
              margin-bottom: 6px;
              align-items: start;
            }

            .left-meta,
            .right-meta {
              font-size: 10px;
              line-height: 1.35;
              white-space: pre-line;
              font-weight: 700;
            }

            .center-meta {
              text-align: center;
              font-size: 10px;
              line-height: 1.2;
            }

            .title {
              font-weight: 700;
              font-size: 12px;
              letter-spacing: .3px;
            }

            table {
              width: 100%;
              border-collapse: collapse;
              table-layout: fixed;
            }

            th, td {
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
              font-size: 8px;
            }

            .center {
              text-align: center;
            }

            .money {
              text-align: right;
              white-space: nowrap;
            }

            .product-group {
              font-size: 8px;
              background: #f7f7f7;
            }

            .mini-col {
              font-size: 7px;
              padding: 1px 2px;
              background: #fff;
            }

            .qty-cell {
              font-size: 8px;
              line-height: 1.05;
            }

            .cell-qty {
              font-size: 9px;
              font-weight: 700;
              line-height: 1.05;
            }

            .cell-price {
              margin-top: 1px;
              font-size: 6.5px;
              font-weight: 700;
              color: #374151;
              line-height: 1.05;
              white-space: nowrap;
            }

            .price-cell {
              font-size: 8px;
            }

            .summary-row th,
            .summary-row td {
              font-size: 8px;
              padding: 3px 4px;
            }

            .summary-row-dark th,
            .summary-row-dark td {
              background: #d1d5db !important;
              color: #111827 !important;
            }

            .summary-dark {
              background: #cbd5e1 !important;
              color: #111827 !important;
            }

            .summary-label {
              text-align: left;
              font-weight: 700;
            }

            .summary-qty {
              text-align: center;
              font-weight: 700;
              font-size: 9px;
              letter-spacing: 0.5px;
            }

            .summary-cell-summary {
              background: #e5e7eb !important;
              color: #111827 !important;
            }

            .summary-price {
              background: #fff;
            }

            .summary-merge-cell {
              text-align: center;
              vertical-align: middle;
            }

            .footer-wrap {
              margin-top: 8px;
              display: grid;
              grid-template-columns: 1fr 220px;
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
              padding: 4px;
              font-size: 9px;
            }

            .venta-total-box {
              border: 1px solid #4b5563;
              text-align: center;
              padding: 8px 6px;
            }

            .venta-total-label {
              font-size: 10px;
              font-weight: 700;
              margin-bottom: 4px;
            }

            .venta-total-value {
              font-size: 22px;
              font-weight: 700;
            }

            .diff-positive {
              color: #166534 !important;
              font-weight: 700;
            }

            .diff-negative {
              color: #991b1b !important;
              font-weight: 700;
            }

            .diff-zero {
              color: #111827 !important;
              font-weight: 700;
            }
          </style>
        </head>
        <body>
          <div class="sheet">
            <div class="top">
              <div class="left-meta">
NOMBRE:
FECHA:
              </div>

              <div class="center-meta">
                <div class="title">${escapeHtml(String(driverName).toUpperCase())}</div>
                <div>${escapeHtml(formatOnlyDate(workDate))}</div>
                <div style="margin-top:8px;font-weight:700;">CHOFER</div>
              </div>

              <div class="right-meta">
ESTADO RUTA: ${escapeHtml(routeStatus)}
INICIO RUTA: ${escapeHtml(routeStartedAt)}
FIN RUTA: ${escapeHtml(routeEndedAt)}
KM INICIAL: ${escapeHtml(routeKmStart)}
KM FINAL: ${escapeHtml(routeKmEnd)}
KM RECORRIDOS: ${escapeHtml(
      routeKmTotalPdf === null ? "—" : String(routeKmTotalPdf),
    )}
              </div>
            </div>

            <table>
              <thead>
                <tr>
                  <th rowspan="2" style="width:24px;">N°</th>
                  <th rowspan="2" style="width:76px;">REMISIÓN</th>
                  <th rowspan="2" style="width:210px;">CLIENTE</th>
                  ${headerTopHtml}
                  <th rowspan="2" style="width:86px;">EFECTIVO</th>
                  <th rowspan="2" style="width:86px;">CRÉDITO</th>
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
                      <td class="money">$ ${moneyPlain(totalEfectivo)}</td>
                      <td class="money">$ ${moneyPlain(totalCredito)}</td>
                    </tr>
                  </tbody>
                </table>

                <div class="venta-total-box">
                  <div class="venta-total-label">VENTA TOTAL</div>
                  <div class="venta-total-value">$ ${moneyPlain(totalVenta)}</div>
                </div>
              </div>
            </div>
          </div>
        </body>
      </html>
    `;

    const win = window.open("", "_blank", "width=1400,height=900");
    if (!win) return;

    win.document.open();
    win.document.write(html);
    win.document.close();

    setTimeout(() => {
      win.focus();
      win.print();
    }, 400);
  }, [
    api.selectedAssignmentId,
    api.selectedAssignment,
    api.workDate,
    api.drivers,
    api.products,
    selectedAssignmentDeliveriesAll,
  ]);

  const exportBatchDraftPdf = useCallback(() => {
    if (!driverId || batchDetailed.length === 0) return;

    const driverName =
      assignableDrivers.find((d) => d.id === driverId)?.nombre ||
      api.selectedAssignment?.driver_nombre ||
      "CHOFER";

    const rowsHtml = batchDetailed
      .map((customer, idx) => {
        const itemsHtml =
          customer.items.length === 0
            ? `<tr><td colspan="5" class="center muted">Sin productos</td></tr>`
            : customer.items
                .map(
                  (item) => `
                  <tr>
                    <td>${escapeHtml(item.nombre)}</td>
                    <td class="center">${item.qty}</td>
                    <td class="center">${item.suggested_qty}</td>
                    <td class="money">$ ${moneyPlain(item.precio)}</td>
                    <td class="money">$ ${moneyPlain(item.subtotal)}</td>
                  </tr>
                `,
                )
                .join("");

        return `
          <div class="customer-card">
            <div class="customer-head">
              <div>
                <div class="customer-title">${idx + 1}. ${escapeHtml(customer.customer_nombre)}</div>
                <div class="customer-sub">Borrador de carga • Total cliente: $ ${moneyPlain(customer.subtotal)}</div>
              </div>
            </div>

            <table>
              <thead>
                <tr>
                  <th>Producto</th>
                  <th style="width:90px;">Cant.</th>
                  <th style="width:90px;">Sug.</th>
                  <th style="width:120px;">Precio</th>
                  <th style="width:120px;">Subtotal</th>
                </tr>
              </thead>
              <tbody>
                ${itemsHtml}
              </tbody>
            </table>
          </div>
        `;
      })
      .join("");

    const html = `
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Borrador de ruta</title>
          <style>
            @page { size: letter portrait; margin: 16mm; }

            body {
              font-family: Arial, Helvetica, sans-serif;
              color: #111827;
              margin: 0;
              font-size: 12px;
            }

            .top {
              display: grid;
              grid-template-columns: 1fr 1fr 1fr;
              gap: 8px;
              margin-bottom: 14px;
              align-items: start;
            }

            .left-meta {
              font-size: 12px;
              line-height: 1.45;
              white-space: pre-line;
            }

            .center-meta {
              text-align: center;
              font-size: 12px;
              line-height: 1.4;
            }

            .title {
              font-weight: 700;
              letter-spacing: .4px;
            }

            .summary {
              display: grid;
              grid-template-columns: repeat(4, 1fr);
              gap: 10px;
              margin-bottom: 14px;
            }

            .stat {
              border: 1px solid #4b5563;
              padding: 10px;
            }

            .stat-label {
              font-size: 11px;
              color: #6b7280;
              margin-bottom: 6px;
            }

            .stat-value {
              font-size: 18px;
              font-weight: 700;
            }

            .customer-card {
              border: 1px solid #4b5563;
              padding: 10px;
              margin-bottom: 12px;
              break-inside: avoid;
            }

            .customer-head {
              display: flex;
              justify-content: space-between;
              align-items: start;
              gap: 12px;
              margin-bottom: 8px;
            }

            .customer-title {
              font-size: 14px;
              font-weight: 700;
            }

            .customer-sub {
              font-size: 11px;
              color: #6b7280;
              margin-top: 3px;
            }

            table {
              width: 100%;
              border-collapse: collapse;
              table-layout: fixed;
            }

            th, td {
              border: 1px solid #4b5563;
              padding: 6px 6px;
              vertical-align: middle;
              word-wrap: break-word;
            }

            th {
              background: #f3f4f6;
              font-size: 11px;
            }

            .center { text-align: center; }
            .money { text-align: right; white-space: nowrap; }
            .muted { color: #6b7280; }
          </style>
        </head>
        <body>
          <div class="top">
            <div class="left-meta">
NOMBRE: ${escapeHtml(driverName)}
FECHA: ${escapeHtml(formatOnlyDate(api.workDate))}
            </div>

            <div class="center-meta">
              <div class="title">${escapeHtml(String(driverName).toUpperCase())}</div>
              <div>${escapeHtml(formatOnlyDate(api.workDate))}</div>
              <div style="margin-top:10px;font-weight:700;">BORRADOR DE RUTA</div>
            </div>

            <div></div>
          </div>

          <div class="summary">
            <div class="stat">
              <div class="stat-label">Clientes</div>
              <div class="stat-value">${batch.length}</div>
            </div>
            <div class="stat">
              <div class="stat-label">Productos</div>
              <div class="stat-value">${batch.reduce((acc, b) => acc + b.items.length, 0)}</div>
            </div>
            <div class="stat">
              <div class="stat-label">Piezas</div>
              <div class="stat-value">${routeQty}</div>
            </div>
            <div class="stat">
              <div class="stat-label">Total esperado</div>
              <div class="stat-value">$ ${moneyPlain(routeTotal)}</div>
            </div>
          </div>

          ${rowsHtml}
        </body>
      </html>
    `;

    const win = window.open("", "_blank", "width=1200,height=900");
    if (!win) return;

    win.document.open();
    win.document.write(html);
    win.document.close();

    setTimeout(() => {
      win.focus();
      win.print();
    }, 400);
  }, [
    driverId,
    batchDetailed,
    assignableDrivers,
    api.selectedAssignment,
    api.workDate,
    batch,
    routeQty,
    routeTotal,
  ]);

  if (guard.loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#0A1A2F] via-[#1E4A7A] to-[#2D1B3A]">
        <Skeleton />
      </div>
    );
  }

  if (!guard.isAuthed) return null;

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
              <div className="rounded-2xl bg-gradient-to-br from-[#1E4A7A] to-[#2D1B3A] p-3 shadow-lg">
                <ClipboardList className="h-8 w-8 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">Asignaciones</h1>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => router.push(PATHS.admin.dashboard)}
                className="flex items-center gap-2 rounded-xl bg-white/10 px-4 py-2 text-sm text-white/80 transition-colors hover:bg-white/20"
              >
                Dashboard
                <ChevronRight className="h-4 w-4" />
              </button>

              <button
                onClick={() => api.refreshDay(api.workDate)}
                disabled={api.loading}
                className="rounded-xl bg-white/10 p-3 text-white/80 hover:bg-white/20 disabled:opacity-50"
                title="Refrescar"
              >
                <RefreshCw
                  className={cx("h-4 w-4", api.loading && "animate-spin")}
                />
              </button>

              <button
                onClick={openMassBuilder}
                className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#1E4A7A] to-[#2E6B9E] px-4 py-3 font-medium text-white shadow-lg transition-all hover:from-[#2E6B9E] hover:to-[#1E4A7A]"
              >
                <Plus className="h-5 w-5" />
                Crear Entrega
              </button>
            </div>
          </div>
        </motion.div>

        <AnimatePresence>
          {api.err && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mb-6 rounded-xl border border-red-500/30 bg-red-500/20 p-4"
            >
              <div className="flex items-center gap-3 text-red-200">
                <AlertCircle className="h-5 w-5" />
                <span>{api.err}</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="mb-5 flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-xl sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-white/80">
            <CalendarDays className="h-4 w-4" />
            <span className="text-sm">Fecha</span>
          </div>

          <input
            type="date"
            value={api.workDate}
            onChange={(e) => api.setWorkDate(e.target.value)}
            className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-[#1E4A7A]"
          />
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="lg:col-span-1">
            <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl">
              <div className="border-b border-white/10 p-4">
                <p className="flex items-center gap-2 font-semibold text-white">
                  <Truck className="h-4 w-4" />
                  Asignaciones del día
                </p>
                <p className="mt-1 text-xs text-white/50">{api.workDate}</p>
              </div>

              <div className="max-h-[70vh] divide-y divide-white/10 overflow-y-auto">
                {api.loading ? (
                  <div className="p-6 text-center text-white/50">
                    Cargando...
                  </div>
                ) : api.assignmentsOfDay.length === 0 ? (
                  <div className="p-6 text-center text-white/50">
                    No hay asignaciones este día
                  </div>
                ) : (
                  api.assignmentsOfDay.map((a) => {
                    const kmDone =
                      typeof a.route?.km_start === "number" &&
                      typeof a.route?.km_end === "number"
                        ? a.route.km_end - a.route.km_start
                        : null;

                    return (
                      <button
                        key={a.id}
                        onClick={() => api.setSelectedAssignmentId(a.id)}
                        className={cx(
                          "w-full p-4 text-left transition hover:bg-white/5",
                          api.selectedAssignmentId === a.id && "bg-white/10",
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <p className="font-medium text-white">
                              {a.driver_nombre ?? "Chofer"}
                            </p>
                            <p className="mt-1 text-xs text-white/50">
                              Entregas:{" "}
                              <span className="text-white/80">
                                {a.deliveries_count ?? 0}
                              </span>
                            </p>

                            <div className="mt-2 flex flex-wrap gap-2">
                              <span className="rounded-full border border-white/10 bg-white/10 px-2 py-1 text-[11px] text-white/70">
                                Ruta: {a.route?.status || "NO_INICIADA"}
                              </span>

                              {kmDone !== null && (
                                <span className="rounded-full border border-blue-500/20 bg-blue-500/10 px-2 py-1 text-[11px] text-blue-100">
                                  {formatKm(kmDone)}
                                </span>
                              )}
                            </div>
                          </div>

                          <span className="rounded-full border border-white/10 bg-white/10 px-2 py-1 text-xs text-white/70">
                            {a.status}
                          </span>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          <div className="lg:col-span-2">
            <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl">
              <div className="flex items-center justify-between border-b border-white/10 p-4">
                <div>
                  <p className="font-semibold text-white">Resumen operativo</p>
                  <p className="text-xs text-white/50">
                    {api.selectedAssignment?.driver_nombre ? (
                      <>
                        {api.selectedAssignment.driver_nombre} • {api.workDate}
                      </>
                    ) : (
                      "Selecciona una asignación"
                    )}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  {api.selectedAssignmentId && (
                    <button
                      onClick={exportSelectedAssignmentPdf}
                      className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#6B21A8] to-[#7C3AED] px-3 py-2 text-sm text-white hover:from-[#7C3AED] hover:to-[#6B21A8]"
                      title="Exportar hoja operativa"
                    >
                      <FileText className="h-4 w-4" />
                      Exportar PDF
                    </button>
                  )}

                  <button
                    onClick={() =>
                      api.selectedAssignmentId && api.refreshDay(api.workDate)
                    }
                    className="rounded-xl bg-white/10 p-2 text-white/80 hover:bg-white/20"
                    title="Refrescar"
                  >
                    <RefreshCw className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {!api.selectedAssignmentId ? (
                <div className="p-10 text-center text-white/60">
                  Selecciona una asignación de la izquierda.
                </div>
              ) : (
                <div className="space-y-4 p-4">
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                    <SideKpi
                      title="Chofer"
                      value={api.selectedAssignment?.driver_nombre || "—"}
                      icon={<UserRound className="h-4 w-4" />}
                    />
                    <SideKpi
                      title="Entregas activas"
                      value={selectedAssignmentDeliveriesSorted.length}
                      icon={<ListOrdered className="h-4 w-4" />}
                    />
                    <SideKpi
                      title="Confirmadas"
                      value={confirmedDeliveriesCount}
                      icon={<CheckCircle2 className="h-4 w-4" />}
                    />
                    <SideKpi
                      title="Pendientes"
                      value={pendingDeliveriesCount}
                      icon={<AlertTriangle className="h-4 w-4" />}
                    />
                  </div>

                  <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                    <SideKpi
                      title="Total esperado"
                      value={money(selectedAssignmentTotal)}
                      icon={<CircleDollarSign className="h-4 w-4" />}
                    />
                    <SideKpi
                      title="Estado"
                      value={api.selectedAssignment?.status || "—"}
                      icon={<Tag className="h-4 w-4" />}
                    />
                    <SideKpi
                      title="Ruta"
                      value={selectedRoute?.status || "NO_INICIADA"}
                      icon={<Route className="h-4 w-4" />}
                    />
                    <SideKpi
                      title="Km recorridos"
                      value={formatKm(routeKmTotal)}
                      icon={<Truck className="h-4 w-4" />}
                    />
                  </div>

                  <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                    <SideKpi
                      title="Km inicial"
                      value={formatKm(selectedRoute?.km_start)}
                      icon={<Gauge className="h-4 w-4" />}
                    />
                    <SideKpi
                      title="Km final"
                      value={formatKm(selectedRoute?.km_end)}
                      icon={<Flag className="h-4 w-4" />}
                    />
                    <SideKpi
                      title="Inicio de ruta"
                      value={formatDateTime(selectedRoute?.started_at)}
                      icon={<Clock3 className="h-4 w-4" />}
                    />
                    <SideKpi
                      title="Fin de ruta"
                      value={formatDateTime(selectedRoute?.ended_at)}
                      icon={<Flag className="h-4 w-4" />}
                    />
                  </div>

                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <SideKpi
                      title="Canceladas"
                      value={cancelledDeliveries.length}
                      icon={<Ban className="h-4 w-4" />}
                    />
                    <SideKpi
                      title="Total general registradas"
                      value={selectedAssignmentDeliveriesAll.length}
                      icon={<ClipboardList className="h-4 w-4" />}
                    />
                  </div>

                  {selectedAssignmentDeliveriesSorted.length === 0 ? (
                    <div className="p-8 text-center text-white/60">
                      Esta asignación todavía no tiene entregas activas. Puedes
                      seguir agregando más con
                      <span className="font-semibold text-white">
                        {" "}
                        Captura masiva
                      </span>
                      .
                    </div>
                  ) : (
                    <div className="overflow-hidden rounded-2xl border border-white/10 bg-black/10">
                      <div className="border-b border-white/10 px-4 py-3">
                        <p className="font-medium text-white">
                          Entregas activas de esta asignación
                        </p>
                        <p className="text-xs text-white/50">
                          Cliente, folio, estado, hora de entrega y total
                          esperado
                        </p>
                      </div>

                      <div className="max-h-[52vh] divide-y divide-white/10 overflow-y-auto">
                        {selectedAssignmentDeliveriesSorted.map((d, idx) => {
                          const confirmed = isConfirmedDeliveryStatus(d.status);
                          const canCancel = canCancelDelivery(d.status);
                          const isCancelling = cancellingDeliveryId === d.id;

                          return (
                            <div key={d.id} className="px-4 py-4">
                              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                                <div className="flex items-start gap-3">
                                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 font-bold text-white">
                                    {initials(
                                      d.customer_nombre_snapshot || "CL",
                                    )}
                                  </div>

                                  <div>
                                    <p className="font-medium text-white">
                                      {idx + 1}.{" "}
                                      {d.customer_nombre_snapshot || "Cliente"}
                                    </p>
                                    <p className="text-xs text-white/50">
                                      {d.diner_nombre_snapshot || "Sin comedor"}
                                    </p>

                                    <div className="mt-2 flex flex-wrap gap-2">
                                      <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/10 px-2 py-1 text-xs text-white/70">
                                        <Hash className="h-3 w-3" />
                                        {d.folio}
                                      </span>

                                      <span
                                        className={cx(
                                          "rounded-full border px-2 py-1 text-xs",
                                          priorityTone(d.priority),
                                        )}
                                      >
                                        Prioridad {d.priority ?? "—"} •{" "}
                                        {priorityLabel(d.priority)}
                                      </span>

                                      <span className="rounded-full border border-white/10 bg-white/10 px-2 py-1 text-xs text-white/70">
                                        {d.status}
                                      </span>

                                      <span
                                        className={cx(
                                          "rounded-full border px-2 py-1 text-xs",
                                          confirmed
                                            ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-100"
                                            : "border-amber-500/20 bg-amber-500/10 text-amber-100",
                                        )}
                                      >
                                        Hora entrega:{" "}
                                        {formatDateTime(d.delivered_at)}
                                      </span>

                                      <span className="rounded-full border border-blue-500/20 bg-blue-500/10 px-2 py-1 text-xs text-blue-100">
                                        Pago:{" "}
                                        {String(
                                          d.payment_method || "EFECTIVO",
                                        ).toUpperCase()}
                                      </span>
                                    </div>
                                  </div>
                                </div>

                                <div className="text-left md:text-right">
                                  <p className="text-xs text-white/40">
                                    Total esperado
                                  </p>
                                  <p className="font-semibold text-white">
                                    {money(d.total_expected)}
                                  </p>

                                  {confirmed && (
                                    <>
                                      <p className="mt-2 text-xs text-white/40">
                                        Total real
                                      </p>
                                      <p className="font-semibold text-emerald-200">
                                        {money(d.total_real)}
                                      </p>
                                    </>
                                  )}

                                  <div className="mt-3 flex justify-start md:justify-end">
                                    {canCancel && (
                                      <button
                                        onClick={() =>
                                          handleCancelDelivery(d.id)
                                        }
                                        disabled={isCancelling}
                                        className={cx(
                                          "inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium transition",
                                          isCancelling
                                            ? "cursor-not-allowed bg-white/10 text-white/40"
                                            : "bg-red-500/20 text-red-200 hover:bg-red-500/30",
                                        )}
                                      >
                                        <Ban className="h-3.5 w-3.5" />
                                        {isCancelling
                                          ? "Cancelando..."
                                          : "Cancelar entrega"}
                                      </button>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {cancelledDeliveries.length > 0 && (
                    <div className="overflow-hidden rounded-2xl border border-red-500/20 bg-red-500/10">
                      <div className="border-b border-red-500/20 px-4 py-3">
                        <p className="font-medium text-red-100">
                          Entregas canceladas
                        </p>
                        <p className="text-xs text-red-200/70">
                          Se conservan en historial, pero ya no cuentan en los
                          KPIs operativos.
                        </p>
                      </div>

                      <div className="max-h-[26vh] divide-y divide-red-500/10 overflow-y-auto">
                        {cancelledDeliveries.map((d, idx) => (
                          <div key={d.id} className="px-4 py-4">
                            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                              <div className="flex items-start gap-3">
                                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-500/20 font-bold text-red-100">
                                  {initials(d.customer_nombre_snapshot || "CL")}
                                </div>

                                <div>
                                  <p className="font-medium text-red-100">
                                    {idx + 1}.{" "}
                                    {d.customer_nombre_snapshot || "Cliente"}
                                  </p>
                                  <p className="text-xs text-red-200/70">
                                    {d.diner_nombre_snapshot || "Sin comedor"}
                                  </p>

                                  <div className="mt-2 flex flex-wrap gap-2">
                                    <span className="inline-flex items-center gap-1 rounded-full border border-red-500/20 bg-red-500/10 px-2 py-1 text-xs text-red-100">
                                      <Hash className="h-3 w-3" />
                                      {d.folio}
                                    </span>

                                    <span className="rounded-full border border-red-500/20 bg-red-500/10 px-2 py-1 text-xs text-red-100">
                                      {d.status}
                                    </span>

                                    <span className="rounded-full border border-white/10 bg-white/10 px-2 py-1 text-xs text-white/70">
                                      Hora entrega:{" "}
                                      {formatDateTime(d.delivered_at)}
                                    </span>
                                  </div>
                                </div>
                              </div>

                              <div className="text-left md:text-right">
                                <p className="text-xs text-red-200/60">
                                  Total esperado original
                                </p>
                                <p className="font-semibold text-red-100">
                                  {money(d.total_expected)}
                                </p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {openBuilder && (
          <ModalShell
            title="Captura masiva de entregas"
            onClose={() => !api.busy && setOpenBuilder(false)}
            wide
          >
            <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
              <div className="space-y-5 xl:col-span-2">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
                  <TopStat
                    label="Clientes"
                    value={batch.length}
                    icon={<Users className="h-4 w-4" />}
                  />
                  <TopStat
                    label="Productos"
                    value={batch.reduce((acc, b) => acc + b.items.length, 0)}
                    icon={<Layers3 className="h-4 w-4" />}
                  />
                  <TopStat
                    label="Piezas"
                    value={routeQty}
                    icon={<Package className="h-4 w-4" />}
                  />
                  <TopStat
                    label="Total esperado"
                    value={money(routeTotal)}
                    icon={<DollarSign className="h-4 w-4" />}
                  />
                  <button
                    onClick={exportBatchDraftPdf}
                    disabled={batchDetailed.length === 0}
                    className={cx(
                      "rounded-2xl border p-4 text-left transition",
                      batchDetailed.length === 0
                        ? "cursor-not-allowed border-white/10 bg-white/5 text-white/30"
                        : "border-violet-500/20 bg-violet-500/10 text-violet-100 hover:bg-violet-500/20",
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs opacity-80">Borrador</p>
                        <p className="mt-1 text-lg font-bold">Exportar PDF</p>
                      </div>
                      <div className="rounded-xl bg-white/10 p-2">
                        <Download className="h-4 w-4" />
                      </div>
                    </div>
                  </button>
                </div>

                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-sm text-white/70">
                      Chofer
                    </label>
                    <select
                      value={driverId}
                      onChange={(e) => setDriverId(e.target.value)}
                      className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-[#1E4A7A]"
                    >
                      <option value="">
                        Selecciona un chofer con acceso activo
                      </option>

                      {assignableDrivers.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.nombre}
                          {d.firebase_codigo ? ` • ${d.firebase_codigo}` : ""}
                          {d.current_status ? ` • ${d.current_status}` : ""}
                        </option>
                      ))}
                    </select>

                    <p className="mt-1 text-xs text-white/40">
                      Aquí solo aparecen choferes activos con acceso completo en
                      entregas. Si ya existe asignación para este chofer en esta
                      fecha, se reutiliza y se le agregan nuevas entregas.
                    </p>

                    {selectedAssignableDriver && (
                      <div className="mt-3 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3 text-xs text-emerald-100">
                        Chofer seleccionado:{" "}
                        <b>{selectedAssignableDriver.nombre}</b>
                        {selectedAssignableDriver.firebase_codigo
                          ? ` • Código inventario: ${selectedAssignableDriver.firebase_codigo}`
                          : ""}
                        {selectedAssignableDriver.current_status
                          ? ` • Estado app: ${selectedAssignableDriver.current_status}`
                          : ""}
                      </div>
                    )}

                    {inventoryOnlyDrivers.length > 0 && (
                      <div className="mt-3 rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-100">
                        Hay <b>{inventoryOnlyDrivers.length}</b> chofer(es)
                        activos en inventario sin acceso completo en entregas,
                        por eso no salen en este selector.
                        <div className="mt-2 text-amber-200/80">
                          Completa su acceso primero en la página de{" "}
                          <b>Choferes</b>.
                        </div>
                        <button
                          type="button"
                          onClick={() => router.push("/admin/choferes")}
                          className="mt-3 inline-flex items-center gap-2 rounded-xl bg-white/10 px-3 py-2 text-xs text-white/80 hover:bg-white/20"
                        >
                          <Truck className="h-4 w-4" />
                          Ir a Choferes
                        </button>
                      </div>
                    )}

                    {assignableDrivers.length === 0 && (
                      <div className="mt-3 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-100">
                        No hay choferes asignables en este momento. Necesitas al
                        menos un chofer activo con <b>id real en entregas</b>.
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="mb-2 block text-sm text-white/70">
                      Fecha
                    </label>
                    <input
                      type="date"
                      value={api.workDate}
                      onChange={(e) => api.setWorkDate(e.target.value)}
                      className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-[#1E4A7A]"
                    />
                  </div>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="flex items-center gap-2 font-semibold text-white">
                    <Users className="h-4 w-4" />
                    Agregar clientes
                  </p>

                  <div className="relative mt-3">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
                    <input
                      value={qCustomer}
                      onChange={(e) => setQCustomer(e.target.value)}
                      placeholder="Buscar cliente por nombre / comedor / teléfono..."
                      className="w-full rounded-xl border border-white/10 bg-white/5 py-3 pl-9 pr-3 text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-[#1E4A7A]"
                    />
                  </div>

                  <div className="mt-3 max-h-[220px] space-y-2 overflow-y-auto pr-1">
                    {customersFiltered.map((c) => {
                      const added = batchByCustomer.has(c.id);

                      return (
                        <button
                          key={c.id}
                          onClick={() => !added && addCustomerToBatch(c.id)}
                          disabled={added}
                          className={cx(
                            "flex w-full items-center justify-between rounded-xl border p-3 text-left transition",
                            added
                              ? "cursor-not-allowed border-green-500/20 bg-green-500/10 opacity-80"
                              : "border-white/10 bg-white/5 hover:bg-white/10",
                          )}
                        >
                          <div>
                            <p className="font-medium text-white">{c.nombre}</p>
                            <p className="text-xs text-white/50">
                              {c.diner_nombre || "Sin comedor"} •{" "}
                              {c.telefono || "Sin teléfono"}
                            </p>
                          </div>

                          <span
                            className={cx(
                              "rounded-full border px-2 py-1 text-xs",
                              added
                                ? "border-green-500/20 bg-green-500/10 text-green-200"
                                : "border-white/10 bg-white/10 text-white/70",
                            )}
                          >
                            {added ? "Agregado" : "Agregar"}
                          </span>
                        </button>
                      );
                    })}

                    {customersFiltered.length === 0 && (
                      <p className="text-white/50">No hay resultados.</p>
                    )}
                  </div>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <p className="flex items-center gap-2 font-semibold text-white">
                        <Package className="h-4 w-4" />
                        Entregas a crear ({batch.length})
                      </p>
                      <p className="mt-1 text-xs text-white/50">
                        Captura cantidades por producto. Prioridad 1 = urgente,
                        100 = baja.
                      </p>
                    </div>

                    {batch.length > 0 && (
                      <button
                        onClick={() =>
                          batch.forEach((b) =>
                            fillSuggestedForCustomer(b.customer_id),
                          )
                        }
                        className="inline-flex items-center gap-2 rounded-xl bg-[#1E4A7A] px-3 py-2 text-sm text-white hover:bg-[#2E6B9E]"
                      >
                        <Sparkles className="h-4 w-4" />
                        Sugerir todo
                      </button>
                    )}
                  </div>

                  <div className="mt-4 max-h-[58vh] space-y-4 overflow-y-auto pr-1">
                    {batchSorted.length === 0 ? (
                      <div className="p-8 text-center text-white/50">
                        Agrega clientes arriba para empezar.
                      </div>
                    ) : (
                      batchSorted.map((b) => {
                        const c = api.customers.find(
                          (x) => x.id === b.customer_id,
                        );
                        const allowed = api.productsForCustomer(b.customer_id);
                        const subtotal = getCustomerSubtotal(b.customer_id);
                        const totalQtyCustomer = b.items.reduce(
                          (acc, it) => acc + safeNum(it.qty, 0),
                          0,
                        );

                        return (
                          <div
                            key={b.customer_id}
                            className="rounded-2xl border border-white/10 bg-white/5 p-4"
                          >
                            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                              <div className="flex items-start gap-3">
                                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 font-bold text-white">
                                  {initials(c?.nombre || "CL")}
                                </div>

                                <div>
                                  <p className="font-semibold text-white">
                                    {c?.nombre || b.customer_id}
                                  </p>
                                  <p className="text-xs text-white/50">
                                    {c?.diner_nombre || "Sin comedor"} •{" "}
                                    {c?.telefono || "Sin teléfono"}
                                  </p>

                                  <div className="mt-2 flex flex-wrap gap-2">
                                    <span className="rounded-full border border-white/10 bg-white/10 px-2 py-1 text-xs text-white/70">
                                      {b.items.length} productos
                                    </span>
                                    <span className="rounded-full border border-white/10 bg-white/10 px-2 py-1 text-xs text-white/70">
                                      {totalQtyCustomer} piezas
                                    </span>
                                    <span className="rounded-full border border-white/10 bg-white/10 px-2 py-1 text-xs text-white/70">
                                      Total: {money(subtotal)}
                                    </span>
                                    <span
                                      className={cx(
                                        "rounded-full border px-2 py-1 text-xs",
                                        priorityTone(b.priority),
                                      )}
                                    >
                                      Prioridad {b.priority} •{" "}
                                      {priorityLabel(b.priority)}
                                    </span>
                                  </div>
                                </div>
                              </div>

                              <div className="flex flex-wrap items-center gap-2">
                                <button
                                  onClick={() =>
                                    fillSuggestedForCustomer(b.customer_id)
                                  }
                                  className="inline-flex items-center gap-2 rounded-xl bg-[#1E4A7A] px-3 py-2 text-sm text-white hover:bg-[#2E6B9E]"
                                >
                                  <Sparkles className="h-4 w-4" />
                                  Sugerir
                                </button>

                                <button
                                  onClick={() =>
                                    removeCustomerFromBatch(b.customer_id)
                                  }
                                  className="rounded-xl bg-red-500/20 px-3 py-2 text-red-200 hover:bg-red-500/30"
                                  title="Quitar cliente"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </div>
                            </div>

                            <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-3">
                              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                                <div className="flex items-center gap-2 text-sm text-white/80">
                                  <Tag className="h-4 w-4" />
                                  Prioridad de entrega
                                </div>

                                <div className="flex flex-wrap items-center gap-2">
                                  <button
                                    onClick={() =>
                                      setPriorityPreset(b.customer_id, 1)
                                    }
                                    className={cx(
                                      "rounded-lg border px-3 py-1.5 text-xs",
                                      b.priority === 1
                                        ? "border-red-500/30 bg-red-500/20 text-red-100"
                                        : "border-white/10 bg-white/5 text-white/70",
                                    )}
                                  >
                                    Urgente (1)
                                  </button>
                                  <button
                                    onClick={() =>
                                      setPriorityPreset(b.customer_id, 15)
                                    }
                                    className={cx(
                                      "rounded-lg border px-3 py-1.5 text-xs",
                                      b.priority === 15
                                        ? "border-orange-500/30 bg-orange-500/20 text-orange-100"
                                        : "border-white/10 bg-white/5 text-white/70",
                                    )}
                                  >
                                    Alta (15)
                                  </button>
                                  <button
                                    onClick={() =>
                                      setPriorityPreset(b.customer_id, 50)
                                    }
                                    className={cx(
                                      "rounded-lg border px-3 py-1.5 text-xs",
                                      b.priority === 50
                                        ? "border-yellow-500/30 bg-yellow-500/20 text-yellow-100"
                                        : "border-white/10 bg-white/5 text-white/70",
                                    )}
                                  >
                                    Media (50)
                                  </button>
                                  <button
                                    onClick={() =>
                                      setPriorityPreset(b.customer_id, 100)
                                    }
                                    className={cx(
                                      "rounded-lg border px-3 py-1.5 text-xs",
                                      b.priority === 100
                                        ? "border-white/20 bg-white/20 text-white"
                                        : "border-white/10 bg-white/5 text-white/70",
                                    )}
                                  >
                                    Baja (100)
                                  </button>
                                </div>
                              </div>

                              <div className="mt-3 flex items-center gap-2">
                                <button
                                  onClick={() =>
                                    bumpPriority(b.customer_id, -5)
                                  }
                                  className="rounded-lg bg-white/10 p-2 text-white/70 hover:bg-white/20"
                                  title="Más urgente"
                                >
                                  <ArrowUp className="h-4 w-4" />
                                </button>

                                <input
                                  type="number"
                                  min={1}
                                  max={100}
                                  value={b.priority}
                                  onChange={(e) =>
                                    setPriority(
                                      b.customer_id,
                                      Number(e.target.value),
                                    )
                                  }
                                  className="w-24 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-[#1E4A7A]"
                                />

                                <button
                                  onClick={() => bumpPriority(b.customer_id, 5)}
                                  className="rounded-lg bg-white/10 p-2 text-white/70 hover:bg-white/20"
                                  title="Menos urgente"
                                >
                                  <ArrowDown className="h-4 w-4" />
                                </button>

                                <div className="ml-auto text-xs text-white/50">
                                  1 = más urgente • 100 = menos urgente
                                </div>
                              </div>
                            </div>

                            <div className="mt-4">
                              <div className="mb-2 flex items-center justify-between">
                                <p className="font-medium text-white">
                                  Productos permitidos del cliente
                                </p>
                                <p className="text-xs text-white/50">
                                  Cantidad a cargar + sugerido + stock
                                </p>
                              </div>

                              {allowed.length === 0 ? (
                                <div className="rounded-xl border border-yellow-500/20 bg-yellow-500/10 p-3 text-sm text-yellow-100">
                                  Este cliente no tiene productos activos en{" "}
                                  <b>customer_products</b>.
                                </div>
                              ) : (
                                <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                                  {allowed.map((p) => {
                                    const chosen = b.items.find(
                                      (it) => it.product_id === p.id,
                                    );
                                    const subtotalItem = chosen
                                      ? (p.precio_cliente_final || 0) *
                                        chosen.qty
                                      : 0;
                                    const outOfStock = p.stock_actual <= 0;
                                    const isCustomPrice =
                                      p.precio_override !== null;

                                    return (
                                      <div
                                        key={p.id}
                                        className={cx(
                                          "rounded-xl border p-3 transition",
                                          chosen
                                            ? "border-[#4DADFF]/35 bg-[#4DADFF]/10"
                                            : "border-white/10 bg-white/5",
                                        )}
                                      >
                                        <div className="flex items-start justify-between gap-2">
                                          <div className="min-w-0">
                                            <p className="text-sm font-medium text-white">
                                              {p.nombre}
                                            </p>
                                            <p className="mt-0.5 text-xs text-white/40">
                                              {p.kind?.toUpperCase() ||
                                                "PRODUCTO"}{" "}
                                              • {p.ice_type || "N/A"} •{" "}
                                              {p.kg_por_unidad}kg
                                            </p>

                                            <div className="mt-2 flex flex-wrap gap-2">
                                              <span
                                                className={cx(
                                                  "rounded-full border px-2 py-1 text-[11px]",
                                                  isCustomPrice
                                                    ? "border-green-500/20 bg-green-500/10 text-green-200"
                                                    : "border-white/10 bg-white/10 text-white/70",
                                                )}
                                              >
                                                {isCustomPrice
                                                  ? `Precio cliente: ${money(p.precio_cliente_final)}`
                                                  : `Precio base: ${money(p.precio_cliente_final)}`}
                                              </span>

                                              <span
                                                className={cx(
                                                  "rounded-full border px-2 py-1 text-[11px]",
                                                  outOfStock
                                                    ? "border-red-500/20 bg-red-500/10 text-red-200"
                                                    : "border-white/10 bg-white/10 text-white/70",
                                                )}
                                              >
                                                Stock: {p.stock_actual}
                                              </span>

                                              <span className="rounded-full border border-blue-500/20 bg-blue-500/10 px-2 py-1 text-[11px] text-blue-200">
                                                Sugerido {p.nombre}:{" "}
                                                {p.suggested_qty}
                                              </span>
                                            </div>
                                          </div>

                                          {!chosen ? (
                                            <button
                                              onClick={() =>
                                                addItem(b.customer_id, p)
                                              }
                                              disabled={outOfStock}
                                              className={cx(
                                                "inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm",
                                                outOfStock
                                                  ? "cursor-not-allowed bg-white/10 text-white/30"
                                                  : "bg-white/10 text-white hover:bg-white/20",
                                              )}
                                            >
                                              <PlusCircle className="h-4 w-4" />
                                              Agregar
                                            </button>
                                          ) : (
                                            <button
                                              onClick={() =>
                                                removeItem(b.customer_id, p.id)
                                              }
                                              className="inline-flex items-center gap-2 rounded-xl bg-red-500/20 px-3 py-2 text-sm text-red-200 hover:bg-red-500/30"
                                            >
                                              <X className="h-4 w-4" />
                                              Quitar
                                            </button>
                                          )}
                                        </div>

                                        {chosen && (
                                          <div className="mt-3 rounded-xl border border-white/10 bg-black/10 p-3">
                                            <div className="flex flex-col gap-3">
                                              <div className="flex items-center gap-2">
                                                <button
                                                  onClick={() =>
                                                    setQty(
                                                      b.customer_id,
                                                      p.id,
                                                      chosen.qty - 1,
                                                    )
                                                  }
                                                  className="rounded-lg bg-white/10 p-2 text-white/70 hover:bg-white/20"
                                                  disabled={chosen.qty <= 1}
                                                  title="-1"
                                                >
                                                  <Minus className="h-4 w-4" />
                                                </button>

                                                <input
                                                  type="number"
                                                  min={1}
                                                  value={chosen.qty}
                                                  onChange={(e) =>
                                                    setQty(
                                                      b.customer_id,
                                                      p.id,
                                                      Number(e.target.value),
                                                    )
                                                  }
                                                  className="w-24 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-[#1E4A7A]"
                                                />

                                                <button
                                                  onClick={() =>
                                                    setQty(
                                                      b.customer_id,
                                                      p.id,
                                                      chosen.qty + 1,
                                                    )
                                                  }
                                                  className="rounded-lg bg-white/10 p-2 text-white/70 hover:bg-white/20"
                                                  title="+1"
                                                >
                                                  <PlusCircle className="h-4 w-4" />
                                                </button>

                                                <button
                                                  onClick={() =>
                                                    applySuggestedQty(
                                                      b.customer_id,
                                                      p.id,
                                                    )
                                                  }
                                                  className="ml-2 rounded-lg bg-[#1E4A7A] px-3 py-2 text-xs text-white hover:bg-[#2E6B9E]"
                                                >
                                                  Usar sugerido (
                                                  {p.suggested_qty})
                                                </button>
                                              </div>

                                              <div className="grid grid-cols-1 gap-2 text-xs md:grid-cols-4">
                                                <div className="rounded-lg bg-white/5 p-2 text-white/70">
                                                  <span className="text-white/40">
                                                    Producto:
                                                  </span>{" "}
                                                  <span className="text-white">
                                                    {p.nombre}
                                                  </span>
                                                </div>

                                                <div className="rounded-lg bg-white/5 p-2 text-white/70">
                                                  <span className="text-white/40">
                                                    Cantidad:
                                                  </span>{" "}
                                                  <span className="text-white">
                                                    {chosen.qty}
                                                  </span>
                                                </div>

                                                <div className="rounded-lg bg-white/5 p-2 text-white/70">
                                                  <span className="text-white/40">
                                                    Precio:
                                                  </span>{" "}
                                                  <span className="text-white">
                                                    {money(
                                                      p.precio_cliente_final,
                                                    )}
                                                  </span>
                                                </div>

                                                <div className="rounded-lg bg-white/5 p-2 text-white/70">
                                                  <span className="text-white/40">
                                                    Subtotal:
                                                  </span>{" "}
                                                  <span className="text-white">
                                                    {money(subtotalItem)}
                                                  </span>
                                                </div>
                                              </div>

                                              <div className="rounded-lg border border-blue-500/20 bg-blue-500/10 p-2 text-xs text-blue-100">
                                                Sugerido para <b>{p.nombre}</b>:{" "}
                                                <b>{p.suggested_qty}</b> piezas
                                              </div>

                                              {chosen.qty > p.stock_actual && (
                                                <div className="flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/10 p-2 text-xs text-red-100">
                                                  <AlertTriangle className="h-4 w-4" />
                                                  La cantidad rebasa el stock
                                                  disponible.
                                                </div>
                                              )}

                                              {chosen.qty <= p.stock_actual && (
                                                <div className="flex items-center gap-2 rounded-lg border border-green-500/20 bg-green-500/10 p-2 text-xs text-green-100">
                                                  <CheckCircle2 className="h-4 w-4" />
                                                  Cantidad dentro del stock
                                                  disponible.
                                                </div>
                                              )}
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>

                            {b.items.length === 0 && (
                              <p className="mt-3 text-xs text-red-200">
                                ⚠️ Este cliente no tiene productos
                                seleccionados. No podrás guardar hasta que tenga
                                mínimo 1.
                              </p>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>

                  <div className="mt-5 rounded-2xl border border-white/10 bg-black/10 p-4">
                    <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-4">
                      <MiniResume
                        label="Clientes"
                        value={batch.length}
                        icon={<Users className="h-4 w-4" />}
                      />
                      <MiniResume
                        label="Productos"
                        value={batch.reduce(
                          (acc, b) => acc + b.items.length,
                          0,
                        )}
                        icon={<Layers3 className="h-4 w-4" />}
                      />
                      <MiniResume
                        label="Piezas"
                        value={routeQty}
                        icon={<Package className="h-4 w-4" />}
                      />
                      <MiniResume
                        label="Total"
                        value={money(routeTotal)}
                        icon={<DollarSign className="h-4 w-4" />}
                      />
                    </div>

                    <div className="flex gap-3">
                      <button
                        onClick={() => setOpenBuilder(false)}
                        className="flex-1 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white/70 hover:bg-white/10"
                        disabled={api.busy}
                      >
                        Cancelar
                      </button>

                      <button
                        onClick={saveBatch}
                        disabled={!batchOk || api.busy}
                        className={cx(
                          "inline-flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-3 font-medium transition-all",
                          !batchOk || api.busy
                            ? "cursor-not-allowed bg-white/10 text-white/30"
                            : "bg-gradient-to-r from-[#1E4A7A] to-[#2E6B9E] text-white hover:from-[#2E6B9E] hover:to-[#1E4A7A]",
                        )}
                      >
                        <ShieldCheck className="h-4 w-4" />
                        {api.busy
                          ? "Guardando..."
                          : "Guardar TODO (folios auto)"}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-5 xl:col-span-1">
                <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/5">
                  <div className="border-b border-white/10 px-4 py-3">
                    <p className="flex items-center gap-2 font-medium text-white">
                      <Boxes className="h-4 w-4" />
                      Carga consolidada por producto
                    </p>
                    <p className="text-xs text-white/50">
                      Cuántas piezas llevas asignadas por producto
                    </p>
                  </div>

                  <div className="max-h-[34vh] divide-y divide-white/10 overflow-y-auto">
                    {globalProductSummary.length === 0 ? (
                      <div className="p-6 text-center text-white/50">
                        Aún no hay productos capturados.
                      </div>
                    ) : (
                      globalProductSummary.map((p) => (
                        <div key={p.product_id} className="px-4 py-3">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-medium text-white">
                                {p.nombre}
                              </p>
                              <p className="text-xs text-white/50">
                                Clientes: {p.customers_count}
                              </p>
                            </div>

                            <div className="text-right">
                              <p className="font-semibold text-white">
                                {p.total_qty} pzas
                              </p>
                              <p className="text-xs text-white/50">
                                {money(p.total_importe)}
                              </p>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/5">
                  <div className="border-b border-white/10 px-4 py-3">
                    <p className="flex items-center gap-2 font-medium text-white">
                      <ListOrdered className="h-4 w-4" />
                      Entregas en construcción
                    </p>
                    <p className="text-xs text-white/50">
                      Qué entregas estás armando y qué lleva cada una
                    </p>
                  </div>

                  <div className="max-h-[44vh] divide-y divide-white/10 overflow-y-auto">
                    {batchDetailed.length === 0 ? (
                      <div className="p-6 text-center text-white/50">
                        Aún no agregas clientes.
                      </div>
                    ) : (
                      batchDetailed.map((c) => (
                        <div key={c.customer_id} className="px-4 py-4">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-medium text-white">
                                {c.customer_nombre}
                              </p>
                              <div className="mt-1 flex flex-wrap gap-2">
                                <span
                                  className={cx(
                                    "rounded-full border px-2 py-1 text-[11px]",
                                    priorityTone(c.priority),
                                  )}
                                >
                                  Prio {c.priority} •{" "}
                                  {priorityLabel(c.priority)}
                                </span>
                                <span className="rounded-full border border-white/10 bg-white/10 px-2 py-1 text-[11px] text-white/70">
                                  {c.total_qty} pzas
                                </span>
                              </div>
                            </div>

                            <div className="text-right">
                              <p className="text-xs text-white/40">Subtotal</p>
                              <p className="font-semibold text-white">
                                {money(c.subtotal)}
                              </p>
                            </div>
                          </div>

                          {c.items.length > 0 && (
                            <div className="mt-3 space-y-2">
                              {c.items.map((it) => (
                                <div
                                  key={it.product_id}
                                  className="flex items-center justify-between gap-2 rounded-lg bg-white/5 p-2"
                                >
                                  <div>
                                    <p className="text-xs text-white">
                                      {it.nombre}
                                    </p>
                                    <p className="text-[11px] text-white/45">
                                      Sugerido: {it.suggested_qty}
                                    </p>
                                  </div>
                                  <div className="text-right">
                                    <p className="text-xs font-medium text-white">
                                      {it.qty} pzas
                                    </p>
                                    <p className="text-[11px] text-white/45">
                                      {money(it.subtotal)}
                                    </p>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          </ModalShell>
        )}
      </AnimatePresence>
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
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-white/50">{label}</p>
          <p className="mt-1 text-lg font-bold text-white">{value}</p>
        </div>
        <div className="rounded-xl bg-white/10 p-2 text-white/80">{icon}</div>
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
    <div className="rounded-xl border border-white/10 bg-white/5 p-3">
      <div className="flex items-center gap-2 text-xs text-white/50">
        {icon}
        {label}
      </div>
      <div className="mt-1 font-semibold text-white">{value}</div>
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
    <div className="rounded-xl border border-white/10 bg-white/5 p-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-xs text-white/50">{title}</p>
          <p className="mt-1 text-sm font-semibold text-white">{value}</p>
        </div>
        <div className="rounded-lg bg-white/10 p-2 text-white/80">{icon}</div>
      </div>
    </div>
  );
}

function ModalShell({
  title,
  onClose,
  children,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 overflow-y-auto bg-black/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <div className="flex min-h-full w-full items-start justify-center p-4 sm:p-6">
        <motion.div
          initial={{ scale: 0.95, y: 18 }}
          animate={{ scale: 1, y: 0 }}
          exit={{ scale: 0.95, y: 18 }}
          className={cx(
            "my-8 max-h-[92vh] w-full overflow-y-auto rounded-2xl bg-gradient-to-br from-[#0A1A2F] to-[#1E4A7A] shadow-xl",
            wide ? "max-w-7xl" : "max-w-md",
          )}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="p-6">
            <div className="sticky top-0 z-10 mb-5 flex items-center justify-between bg-gradient-to-br from-[#0A1A2F] to-[#1E4A7A] pb-3">
              <h2 className="text-xl font-bold text-white">{title}</h2>
              <button
                onClick={onClose}
                className="rounded-lg bg-white/10 p-2 text-white/70 hover:bg-white/20"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            {children}
          </div>
        </motion.div>
      </div>
    </motion.div>
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