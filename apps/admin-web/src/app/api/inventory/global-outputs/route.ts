import { NextResponse } from 'next/server';
import admin from 'firebase-admin';

export const runtime = 'nodejs';

type MovementItem = {
  bolsaVaciaCodigo?: string | null;
  productoCodigo?: string | null;
  productoNombre?: string | null;
  tipoHielo?: string | null;
  pesoKg?: number | string | null;
  inventoryKey?: string | null;
  cantidad?: number | string | null;
  delta?: number | string | null;
};

type MovementDoc = {
  tipo?: string | null;
  salidaSubtipo?: string | null;
  destinatario?: string | null;
  clienteNombre?: string | null;
  fecha?: FirebaseFirestore.Timestamp | Date | string | null;
  productoCodigo?: string | null;
  productoNombre?: string | null;
  tipoHielo?: string | null;
  pesoKg?: number | string | null;
  inventoryKey?: string | null;
  cantidad?: number | string | null;
  deltaPrincipal?: number | string | null;
  items?: MovementItem[] | null;
};

function clean(value: unknown) {
  return String(value ?? '').trim();
}

function normalize(value: unknown) {
  return clean(value)
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

function compact(value: unknown) {
  return normalize(value).replace(/[^A-Z0-9]+/g, '');
}

function toNumber(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function env(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Falta variable de entorno: ${name}`);
  return value;
}

function initFirebaseAdmin() {
  if (admin.apps.length > 0) return;

  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: env('FIREBASE_PROJECT_ID'),
      clientEmail: env('FIREBASE_CLIENT_EMAIL'),
      privateKey: env('FIREBASE_PRIVATE_KEY').replace(/\\n/g, '\n'),
    }),
  });
}

function dateStart(date: string) {
  return new Date(`${date}T00:00:00-06:00`);
}

function dateEndExclusive(date: string) {
  const d = dateStart(date);
  d.setDate(d.getDate() + 1);
  return d;
}

function extractCode(value?: string | null) {
  const match = clean(value).match(/\(([^)]+)\)/);
  return clean(match?.[1] || '');
}

function driverMatches(
  movement: MovementDoc,
  driverCode?: string | null,
  driverName?: string | null
) {
  const combined = `${movement.destinatario || ''} ${movement.clienteNombre || ''}`;

  if (driverCode && compact(combined).includes(compact(driverCode))) return true;

  if (driverName) {
    const wanted = normalize(driverName);
    const text = normalize(combined);

    if (text.includes(wanted)) return true;

    const tokens = wanted.split(' ').filter((x) => x.length >= 3);
    const matches = tokens.filter((t) => text.includes(t)).length;

    return matches >= Math.min(2, tokens.length);
  }

  return false;
}

function normalizeIceType(value?: string | null) {
  const text = normalize(value);

  if (text.includes('BARRA')) return 'BARRA';
  if (text.includes('GOURMET')) return 'GOURMET';
  if (text.includes('ENFRIAR')) return 'ENFRIAR';
  if (text.includes('FRAP')) return 'FRAP';
  if (text.includes('ROLITO')) return 'ROLITO';
  if (text.includes('NORMAL')) return 'ROLITO';

  return text.replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

function extractKg(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
      return String(value).replace(/\.0+$/, '');
    }

    const text = normalize(value);
    const match = text.match(/(\d+(?:\.\d+)?)\s*(KG|KILO|KILOS)/);

    if (match?.[1]) return match[1].replace(/\.0+$/, '');
  }

  return '';
}

function productLabel(item: MovementItem) {
  const name = clean(item.productoNombre);
  if (name) return name;

  const tipo = clean(item.tipoHielo);
  const kg = toNumber(item.pesoKg);

  if (tipo && kg > 0) return `${tipo} ${kg}KG`;

  return clean(
    item.productoCodigo ||
      item.bolsaVaciaCodigo ||
      item.inventoryKey ||
      'PRODUCTO'
  );
}

function productKey(item: MovementItem) {
  const label = productLabel(item);
  const tipo = normalizeIceType(item.tipoHielo || label);
  const kg = extractKg(item.pesoKg, label, item.inventoryKey);

  if (tipo === 'BARRA' || normalize(label).includes('BARRA')) return 'BARRA';
  if (tipo && kg) return `${tipo}_${kg}`;
  if (tipo) return tipo;

  return normalize(label).replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

function movementItems(raw: MovementDoc): MovementItem[] {
  if (Array.isArray(raw.items) && raw.items.length > 0) return raw.items;

  return [
    {
      bolsaVaciaCodigo: raw.productoCodigo,
      productoCodigo: raw.productoCodigo,
      productoNombre: raw.productoNombre,
      tipoHielo: raw.tipoHielo,
      pesoKg: raw.pesoKg,
      inventoryKey: raw.inventoryKey,
      cantidad: raw.cantidad,
      delta: raw.deltaPrincipal,
    },
  ];
}

export async function GET(req: Request) {
  try {
    initFirebaseAdmin();

    const url = new URL(req.url);
    const date = clean(url.searchParams.get('date'));
    const driverCode = clean(url.searchParams.get('driverCode'));
    const driverName = clean(url.searchParams.get('driverName'));

    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json(
        { ok: false, error: 'Falta date YYYY-MM-DD' },
        { status: 400 }
      );
    }

    if (!driverCode && !driverName) {
      return NextResponse.json(
        { ok: false, error: 'Falta driverCode o driverName' },
        { status: 400 }
      );
    }

    const db = admin.firestore();

    const snap = await db
      .collection('movimientos')
      .where('fecha', '>=', admin.firestore.Timestamp.fromDate(dateStart(date)))
      .where('fecha', '<', admin.firestore.Timestamp.fromDate(dateEndExclusive(date)))
      .orderBy('fecha', 'asc')
      .limit(2500)
      .get();

    const qtyByKey: Record<string, number> = {};
    const labelByKey: Record<string, string> = {};

    for (const doc of snap.docs) {
      const raw = doc.data() as MovementDoc;

      if (normalize(raw.tipo) !== 'SALIDA_BOLSA') continue;
      if (normalize(raw.salidaSubtipo) !== 'ENTREGA_TRANSPORTE') continue;
      if (!driverMatches(raw, driverCode || extractCode(raw.destinatario), driverName)) continue;

      for (const item of movementItems(raw)) {
        const qty = Math.abs(toNumber(item.cantidad ?? item.delta));
        if (qty <= 0) continue;

        const key = productKey(item);
        const label = productLabel(item);

        if (!key) continue;

        qtyByKey[key] = (qtyByKey[key] || 0) + qty;
        if (!labelByKey[key]) labelByKey[key] = label;
      }
    }

    return NextResponse.json({
      ok: true,
      date,
      driverCode,
      driverName,
      qtyByKey,
      labelByKey,
      totalProducts: Object.keys(qtyByKey).length,
    });
  } catch (error) {
    console.error('[global-outputs] error:', error);

    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
