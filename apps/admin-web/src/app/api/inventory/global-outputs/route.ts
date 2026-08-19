import { NextResponse } from "next/server";
import admin from "firebase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
  batch?: boolean | null;
  afectaStock?: boolean | null;
  salidaSubtipo?: string | null;
  salidaDestino?: string | null;
  destinatario?: string | null;
  clienteNombre?: string | null;
  motivo?: string | null;
  observaciones?: string | null;
  fecha?: any;
  createdAt?: any;
  updatedAt?: any;
  productoCodigo?: string | null;
  bolsaVaciaCodigo?: string | null;
  productoNombre?: string | null;
  tipoHielo?: string | null;
  pesoKg?: number | string | null;
  inventoryKey?: string | null;
  cantidad?: number | string | null;
  deltaPrincipal?: number | string | null;
  items?: MovementItem[] | null;
};

type PlainDoc = {
  id: string;
  data: MovementDoc;
};

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function normalize(value: unknown) {
  return clean(value)
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

function compact(value: unknown) {
  return normalize(value).replace(/[^A-Z0-9]+/g, "");
}

function toNumber(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function envAny(...names: string[]) {
  for (const name of names) {
    const value = process.env[name];
    if (value && String(value).trim()) {
      return String(value).trim();
    }
  }

  return "";
}

function getPrivateKey(value: string) {
  return clean(value)
    .replace(/^"|"$/g, "")
    .replace(/^'|'$/g, "")
    .replace(/\\n/g, "\n");
}

function getFirebaseAdminDb() {
  const serviceAccountJson = envAny(
    "FIREBASE_SERVICE_ACCOUNT_JSON",
    "INVENTORY_FIREBASE_SERVICE_ACCOUNT_JSON",
  );

  const serviceAccountBase64 = envAny(
    "FIREBASE_SERVICE_ACCOUNT_BASE64",
    "INVENTORY_FIREBASE_SERVICE_ACCOUNT_BASE64",
  );

  const projectId = envAny(
    "FIREBASE_PROJECT_ID",
    "INVENTORY_FIREBASE_PROJECT_ID",
    "NEXT_PUBLIC_INVENTORY_FIREBASE_PROJECT_ID",
    "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
  );

  const clientEmail = envAny(
    "FIREBASE_CLIENT_EMAIL",
    "INVENTORY_FIREBASE_CLIENT_EMAIL",
  );

  const privateKey = envAny(
    "FIREBASE_PRIVATE_KEY",
    "INVENTORY_FIREBASE_PRIVATE_KEY",
  );

  try {
    /*
     * IMPORTANTE:
     *
     * admin.apps.length > 0 NO garantiza que exista
     * la aplicación [DEFAULT].
     *
     * Otro módulo del proyecto puede haber inicializado
     * Firebase Admin con un nombre personalizado.
     *
     * admin.firestore() sin pasar app intenta usar
     * únicamente [DEFAULT], provocando:
     *
     * "The default Firebase app does not exist"
     */
    const defaultApp = admin.apps.find(
      (app) => app?.name === "[DEFAULT]",
    );

    if (defaultApp) {
      return admin.firestore(defaultApp);
    }

    /*
     * Crear la app DEFAULT sólo cuando realmente
     * no existe.
     */
    if (serviceAccountJson) {
      const parsed = JSON.parse(serviceAccountJson);

      const app = admin.initializeApp({
        credential: admin.credential.cert(parsed),
        projectId:
          parsed.project_id ||
          parsed.projectId ||
          projectId ||
          undefined,
      });

      return admin.firestore(app);
    }

    if (serviceAccountBase64) {
      const parsed = JSON.parse(
        Buffer.from(serviceAccountBase64, "base64").toString("utf8"),
      );

      const app = admin.initializeApp({
        credential: admin.credential.cert(parsed),
        projectId:
          parsed.project_id ||
          parsed.projectId ||
          projectId ||
          undefined,
      });

      return admin.firestore(app);
    }

    if (projectId && clientEmail && privateKey) {
      const app = admin.initializeApp({
        credential: admin.credential.cert({
          projectId,
          clientEmail,
          privateKey: getPrivateKey(privateKey),
        }),
        projectId,
      });

      return admin.firestore(app);
    }
  } catch (error) {
    console.error(
      "[global-outputs] Firebase Admin init error:",
      error,
    );
  }

  return null;
}

function getClientFirebaseConfig() {
  const apiKey = envAny(
    "NEXT_PUBLIC_INVENTORY_FIREBASE_API_KEY",
    "NEXT_PUBLIC_FIREBASE_API_KEY",
    "FIREBASE_API_KEY",
  );

  const authDomain = envAny(
    "NEXT_PUBLIC_INVENTORY_FIREBASE_AUTH_DOMAIN",
    "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
    "FIREBASE_AUTH_DOMAIN",
  );

  const projectId = envAny(
    "NEXT_PUBLIC_INVENTORY_FIREBASE_PROJECT_ID",
    "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
    "FIREBASE_PROJECT_ID",
  );

  const storageBucket = envAny(
    "NEXT_PUBLIC_INVENTORY_FIREBASE_STORAGE_BUCKET",
    "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET",
    "FIREBASE_STORAGE_BUCKET",
  );

  const messagingSenderId = envAny(
    "NEXT_PUBLIC_INVENTORY_FIREBASE_MESSAGING_SENDER_ID",
    "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
    "FIREBASE_MESSAGING_SENDER_ID",
  );

  const appId = envAny(
    "NEXT_PUBLIC_INVENTORY_FIREBASE_APP_ID",
    "NEXT_PUBLIC_FIREBASE_APP_ID",
    "FIREBASE_APP_ID",
  );

  if (!apiKey || !projectId || !appId) {
    return null;
  }

  return {
    apiKey,
    authDomain,
    projectId,
    storageBucket,
    messagingSenderId,
    appId,
  };
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
  return clean(match?.[1] || "");
}

function driverMatches(
  movement: MovementDoc,
  driverCode?: string | null,
  driverName?: string | null,
) {
  const destinatario = clean(movement.destinatario);
  const clienteNombre = clean(movement.clienteNombre);
  const combined = `${destinatario} ${clienteNombre}`;
  const combinedCompact = compact(combined);

  const wantedCode = clean(driverCode);
  const codeFromMovement = extractCode(destinatario);

  if (
    wantedCode &&
    combinedCompact.includes(compact(wantedCode))
  ) {
    return true;
  }

  if (
    wantedCode &&
    compact(codeFromMovement) === compact(wantedCode)
  ) {
    return true;
  }

  if (driverName) {
    const wanted = normalize(driverName);
    const text = normalize(combined);

    if (wanted && text.includes(wanted)) {
      return true;
    }

    const tokens = wanted
      .split(" ")
      .filter((x) => x.length >= 3);

    const matches = tokens.filter(
      (t) => text.includes(t),
    ).length;

    if (
      tokens.length > 0 &&
      matches >= Math.min(2, tokens.length)
    ) {
      return true;
    }
  }

  return false;
}

function normalizeIceType(value?: string | null) {
  const text = normalize(value);

  if (text.includes("BARRA")) return "BARRA";
  if (text.includes("GOURMET")) return "GOURMET";
  if (text.includes("ENFRIAR")) return "ENFRIAR";
  if (text.includes("FRAP")) return "FRAP";
  if (text.includes("ROLITO")) return "ROLITO";
  if (text.includes("NORMAL")) return "ROLITO";

  return text
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function extractKg(...values: unknown[]) {
  for (const value of values) {
    if (
      typeof value === "number" &&
      Number.isFinite(value) &&
      value > 0
    ) {
      return String(value).replace(/\.0+$/, "");
    }

    const text = normalize(value);
    const match = text.match(
      /(\d+(?:\.\d+)?)\s*(KG|KILO|KILOS)/,
    );

    if (match?.[1]) {
      return match[1].replace(/\.0+$/, "");
    }
  }

  return "";
}

function productLabel(item: MovementItem) {
  const name = clean(item.productoNombre);

  if (name) {
    return name;
  }

  const tipo = clean(item.tipoHielo);
  const kg = toNumber(item.pesoKg);

  if (tipo && kg > 0) {
    return `${tipo} ${kg}KG`;
  }

  return clean(
    item.productoCodigo ||
      item.bolsaVaciaCodigo ||
      item.inventoryKey ||
      "PRODUCTO",
  );
}

function productKey(item: MovementItem) {
  const label = productLabel(item);

  const tipo = normalizeIceType(
    item.tipoHielo || label,
  );

  const kg = extractKg(
    item.pesoKg,
    label,
    item.inventoryKey,
  );

  if (
    tipo === "BARRA" ||
    normalize(label).includes("BARRA")
  ) {
    return "BARRA";
  }

  if (tipo && kg) {
    return `${tipo}_${kg}`;
  }

  if (tipo) {
    return tipo;
  }

  return normalize(label)
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function movementItems(raw: MovementDoc): MovementItem[] {
  if (
    Array.isArray(raw.items) &&
    raw.items.length > 0
  ) {
    return raw.items;
  }

  return [
    {
      bolsaVaciaCodigo:
        raw.bolsaVaciaCodigo ||
        raw.productoCodigo,

      productoCodigo:
        raw.productoCodigo ||
        raw.bolsaVaciaCodigo,

      productoNombre:
        raw.productoNombre,

      tipoHielo:
        raw.tipoHielo,

      pesoKg:
        raw.pesoKg,

      inventoryKey:
        raw.inventoryKey,

      cantidad:
        raw.cantidad,

      delta:
        raw.deltaPrincipal,
    },
  ];
}

function isSalidaTransporte(raw: MovementDoc) {
  const tipo = normalize(raw.tipo);
  const salidaSubtipo = normalize(raw.salidaSubtipo);
  const salidaDestino = normalize(raw.salidaDestino);
  const destinatario = normalize(raw.destinatario);

  const isSalida =
    tipo.includes("SALIDA") ||
    salidaSubtipo.includes("ENTREGA_TRANSPORTE") ||
    salidaDestino.includes("TRANSPORTE");

  const isTransporte =
    salidaSubtipo === "ENTREGA_TRANSPORTE" ||
    salidaDestino === "TRANSPORTE" ||
    destinatario.includes("(");

  return isSalida && isTransporte;
}

function isDevolucionTransporte(raw: MovementDoc) {
  const tipo = normalize(raw.tipo);
  const motivo = normalize(raw.motivo);
  const observaciones = normalize(raw.observaciones);
  const destinatario = normalize(raw.destinatario);
  const clienteNombre = normalize(raw.clienteNombre);

  const combined =
    `${tipo} ${motivo} ${observaciones} ${destinatario} ${clienteNombre}`;

  const isDevolucion =
    tipo.includes("DEVOLUCION") ||
    tipo.includes("DEVOLUCIÓN") ||
    motivo.includes("[DEV:TRANSPORTE]") ||
    motivo.includes("DEV:TRANSPORTE") ||
    observaciones.includes("[DEV:TRANSPORTE]") ||
    observaciones.includes("DEV:TRANSPORTE");

  const isTransporte =
    destinatario.includes("TRANSPORTE") ||
    clienteNombre.includes("TRANSPORTE") ||
    combined.includes("TRANSPORTE") ||
    destinatario.includes("(");

  return isDevolucion && isTransporte;
}

function getDocTime(raw: MovementDoc) {
  const value =
    raw.fecha ||
    raw.createdAt ||
    raw.updatedAt;

  if (!value) {
    return null;
  }

  if (typeof value?.toDate === "function") {
    return value.toDate() as Date;
  }

  if (value instanceof Date) {
    return value;
  }

  if (typeof value === "number") {
    const d = new Date(value);

    return Number.isNaN(d.getTime())
      ? null
      : d;
  }

  if (typeof value === "string") {
    const d = new Date(value);

    return Number.isNaN(d.getTime())
      ? null
      : d;
  }

  if (
    typeof value === "object" &&
    value !== null
  ) {
    const seconds = Number(
      (value as any).seconds ??
      (value as any)._seconds,
    );

    if (
      Number.isFinite(seconds) &&
      seconds > 0
    ) {
      return new Date(
        seconds * 1000,
      );
    }
  }

  return null;
}

type MatchedSalidaDoc = {
  id: string;
  data: MovementDoc;
  time: Date | null;
  totals: Record<string, number>;
  labels: Record<string, string>;
  sortTime: number;
};

type MatchedDevolucionDoc =
  MatchedSalidaDoc;

function totalsForMovement(
  raw: MovementDoc,
) {
  const totals:
    Record<string, number> = {};

  const labels:
    Record<string, string> = {};

  for (
    const item of
      movementItems(raw)
  ) {
    const qty = Math.abs(
      toNumber(
        item.cantidad ??
          item.delta,
      ),
    );

    if (qty <= 0) {
      continue;
    }

    const key =
      productKey(item);

    const label =
      productLabel(item);

    if (!key) {
      continue;
    }

    totals[key] =
      (totals[key] || 0) +
      qty;

    if (!labels[key]) {
      labels[key] = label;
    }
  }

  return {
    totals,
    labels,
  };
}

function docTotalQty(
  doc: MatchedSalidaDoc,
) {
  return Object.values(
    doc.totals,
  ).reduce(
    (acc, qty) =>
      acc + toNumber(qty),
    0,
  );
}

function docKeys(
  doc: MatchedSalidaDoc,
) {
  return Object.keys(
    doc.totals,
  ).filter(
    (key) =>
      toNumber(
        doc.totals[key],
      ) > 0,
  );
}

function isCompleteBatchSalida(
  doc: MatchedSalidaDoc,
) {
  const keys =
    docKeys(doc);

  const itemsCount =
    Array.isArray(
      doc.data.items,
    )
      ? doc.data.items.length
      : 0;

  return (
    keys.length >= 2 ||
    itemsCount >= 2
  );
}

function selectEffectiveSalidaDocs(
  matched: MatchedSalidaDoc[],
  driverCode?: string | null,
  driverName?: string | null,
) {
  /*
   * IMPORTANTE:
   *
   * No descartamos movimientos del mismo
   * chofer/día.
   *
   * Un chofer puede recibir múltiples salidas
   * durante el mismo día y todas deben sumarse.
   */
  void driverCode;
  void driverName;

  return [...matched].sort(
    (a, b) =>
      a.sortTime -
      b.sortTime,
  );
}

async function readMovementsWithAdmin(
  start: Date,
  end: Date,
): Promise<PlainDoc[]> {
  const db =
    getFirebaseAdminDb();

  if (!db) {
    return [];
  }

  const docs =
    new Map<
      string,
      PlainDoc
    >();

  const startTs =
    admin.firestore.Timestamp.fromDate(
      start,
    );

  const endTs =
    admin.firestore.Timestamp.fromDate(
      end,
    );

  const addSnap = (
    snap:
      | FirebaseFirestore.QuerySnapshot
      | null,
  ) => {
    snap?.docs.forEach(
      (d) => {
        docs.set(
          d.id,
          {
            id: d.id,
            data:
              d.data() as MovementDoc,
          },
        );
      },
    );
  };

  const fechaSnap =
    await db
      .collection(
        "movimientos",
      )
      .where(
        "fecha",
        ">=",
        startTs,
      )
      .where(
        "fecha",
        "<",
        endTs,
      )
      .limit(2500)
      .get()
      .catch(
        (error) => {
          console.warn(
            "[global-outputs] admin fecha query warn:",
            error,
          );

          return null;
        },
      );

  addSnap(fechaSnap);

  const createdAtSnap =
    await db
      .collection(
        "movimientos",
      )
      .where(
        "createdAt",
        ">=",
        startTs,
      )
      .where(
        "createdAt",
        "<",
        endTs,
      )
      .limit(2500)
      .get()
      .catch(
        (error) => {
          console.warn(
            "[global-outputs] admin createdAt query warn:",
            error,
          );

          return null;
        },
      );

  addSnap(createdAtSnap);

  return Array.from(
    docs.values(),
  );
}

async function readMovementsWithClient(
  start: Date,
  end: Date,
): Promise<PlainDoc[]> {
  const config =
    getClientFirebaseConfig();

  if (!config) {
    return [];
  }

  const firebaseApp =
    await import(
      "firebase/app"
    );

  const firestore =
    await import(
      "firebase/firestore"
    );

  const appName =
    "inventory-global-outputs";

  const app =
    firebaseApp
      .getApps()
      .find(
        (x) =>
          x.name === appName,
      ) ||
    firebaseApp.initializeApp(
      config,
      appName,
    );

  const db =
    firestore.getFirestore(
      app,
    );

  const docs =
    new Map<
      string,
      PlainDoc
    >();

  const startTs =
    firestore.Timestamp.fromDate(
      start,
    );

  const endTs =
    firestore.Timestamp.fromDate(
      end,
    );

  const fechaSnap =
    await firestore
      .getDocs(
        firestore.query(
          firestore.collection(
            db,
            "movimientos",
          ),
          firestore.where(
            "fecha",
            ">=",
            startTs,
          ),
          firestore.where(
            "fecha",
            "<",
            endTs,
          ),
          firestore.limit(
            2500,
          ),
        ),
      )
      .catch(
        (error) => {
          console.warn(
            "[global-outputs] client fecha query warn:",
            error,
          );

          return null;
        },
      );

  fechaSnap?.docs.forEach(
    (d) => {
      docs.set(
        d.id,
        {
          id: d.id,
          data:
            d.data() as MovementDoc,
        },
      );
    },
  );

  const createdAtSnap =
    await firestore
      .getDocs(
        firestore.query(
          firestore.collection(
            db,
            "movimientos",
          ),
          firestore.where(
            "createdAt",
            ">=",
            startTs,
          ),
          firestore.where(
            "createdAt",
            "<",
            endTs,
          ),
          firestore.limit(
            2500,
          ),
        ),
      )
      .catch(
        (error) => {
          console.warn(
            "[global-outputs] client createdAt query warn:",
            error,
          );

          return null;
        },
      );

  createdAtSnap?.docs.forEach(
    (d) => {
      docs.set(
        d.id,
        {
          id: d.id,
          data:
            d.data() as MovementDoc,
        },
      );
    },
  );

  return Array.from(
    docs.values(),
  );
}

export async function GET(
  req: Request,
) {
  try {
    const url =
      new URL(req.url);

    const date =
      clean(
        url.searchParams.get(
          "date",
        ),
      );

    const driverCode =
      clean(
        url.searchParams.get(
          "driverCode",
        ),
      );

    const driverName =
      clean(
        url.searchParams.get(
          "driverName",
        ),
      );

    if (
      !date ||
      !/^\d{4}-\d{2}-\d{2}$/.test(
        date,
      )
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Falta date YYYY-MM-DD",
        },
        {
          status: 400,
        },
      );
    }

    if (
      !driverCode &&
      !driverName
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Falta driverCode o driverName",
        },
        {
          status: 400,
        },
      );
    }

    const hasAdminConfig =
      !!envAny(
        "FIREBASE_SERVICE_ACCOUNT_JSON",
        "INVENTORY_FIREBASE_SERVICE_ACCOUNT_JSON",
      ) ||
      !!envAny(
        "FIREBASE_SERVICE_ACCOUNT_BASE64",
        "INVENTORY_FIREBASE_SERVICE_ACCOUNT_BASE64",
      ) ||
      (
        !!envAny(
          "FIREBASE_PROJECT_ID",
          "INVENTORY_FIREBASE_PROJECT_ID",
          "NEXT_PUBLIC_INVENTORY_FIREBASE_PROJECT_ID",
        ) &&
        !!envAny(
          "FIREBASE_CLIENT_EMAIL",
          "INVENTORY_FIREBASE_CLIENT_EMAIL",
        ) &&
        !!envAny(
          "FIREBASE_PRIVATE_KEY",
          "INVENTORY_FIREBASE_PRIVATE_KEY",
        )
      );

    const hasClientConfig =
      !!getClientFirebaseConfig();

    if (
      !hasAdminConfig &&
      !hasClientConfig
    ) {
      return NextResponse.json(
        {
          ok: false,

          error:
            "No hay credenciales Firebase. El route acepta FIREBASE_PROJECT_ID/FIREBASE_CLIENT_EMAIL/FIREBASE_PRIVATE_KEY o NEXT_PUBLIC_INVENTORY_FIREBASE_*.",

          debug: {
            hasFIREBASE_PROJECT_ID:
              !!process.env
                .FIREBASE_PROJECT_ID,

            hasFIREBASE_CLIENT_EMAIL:
              !!process.env
                .FIREBASE_CLIENT_EMAIL,

            hasFIREBASE_PRIVATE_KEY:
              !!process.env
                .FIREBASE_PRIVATE_KEY,

            hasNEXT_PUBLIC_INVENTORY_FIREBASE_PROJECT_ID:
              !!process.env
                .NEXT_PUBLIC_INVENTORY_FIREBASE_PROJECT_ID,

            hasNEXT_PUBLIC_INVENTORY_FIREBASE_API_KEY:
              !!process.env
                .NEXT_PUBLIC_INVENTORY_FIREBASE_API_KEY,

            hasNEXT_PUBLIC_INVENTORY_FIREBASE_APP_ID:
              !!process.env
                .NEXT_PUBLIC_INVENTORY_FIREBASE_APP_ID,
          },
        },
        {
          status: 500,
        },
      );
    }

    const start =
      dateStart(date);

    const end =
      dateEndExclusive(date);

    let source:
      | "admin"
      | "client" =
      "admin";

    let docs =
      await readMovementsWithAdmin(
        start,
        end,
      );

    if (
      docs.length === 0
    ) {
      source = "client";

      docs =
        await readMovementsWithClient(
          start,
          end,
        );
    }

    const qtyByKey:
      Record<
        string,
        number
      > = {};

    const labelByKey:
      Record<
        string,
        string
      > = {};

    const devolucionesByKey:
      Record<
        string,
        number
      > = {};

    const devolucionesLabelByKey:
      Record<
        string,
        string
      > = {};

    let scanned = 0;

    let matchedSalida = 0;

    let matchedSalidaDriver = 0;

    let matchedDevolucion = 0;

    let matchedDevolucionDriver = 0;

    const matchedDocs:
      MatchedSalidaDoc[] = [];

    const matchedDevolucionDocs:
      MatchedDevolucionDoc[] = [];

    for (
      const entry of docs
    ) {
      scanned += 1;

      const raw =
        entry.data;

      const docDate =
        getDocTime(raw);

      if (
        docDate &&
        (
          docDate < start ||
          docDate >= end
        )
      ) {
        continue;
      }

      const matchesDriver =
        driverMatches(
          raw,
          driverCode,
          driverName,
        );

      if (
        isSalidaTransporte(
          raw,
        )
      ) {
        matchedSalida += 1;

        if (
          matchesDriver
        ) {
          matchedSalidaDriver +=
            1;

          const {
            totals,
            labels,
          } =
            totalsForMovement(
              raw,
            );

          const hasQty =
            Object.values(
              totals,
            ).some(
              (qty) =>
                qty > 0,
            );

          if (hasQty) {
            matchedDocs.push(
              {
                id: entry.id,
                data: raw,
                time: docDate,
                totals,
                labels,
                sortTime:
                  docDate?.getTime() ||
                  0,
              },
            );
          }
        }
      }

      if (
        isDevolucionTransporte(
          raw,
        )
      ) {
        matchedDevolucion +=
          1;

        if (
          matchesDriver
        ) {
          matchedDevolucionDriver +=
            1;

          const {
            totals,
            labels,
          } =
            totalsForMovement(
              raw,
            );

          const hasQty =
            Object.values(
              totals,
            ).some(
              (qty) =>
                qty > 0,
            );

          if (hasQty) {
            matchedDevolucionDocs.push(
              {
                id: entry.id,
                data: raw,
                time: docDate,
                totals,
                labels,
                sortTime:
                  docDate?.getTime() ||
                  0,
              },
            );
          }
        }
      }
    }

    const effectiveDocs =
      selectEffectiveSalidaDocs(
        matchedDocs,
        driverCode,
        driverName,
      );

    for (
      const doc of
        effectiveDocs
    ) {
      for (
        const [
          key,
          qty,
        ] of Object.entries(
          doc.totals,
        )
      ) {
        if (
          qty <= 0
        ) {
          continue;
        }

        qtyByKey[key] =
          (
            qtyByKey[key] ||
            0
          ) + qty;

        if (
          !labelByKey[key]
        ) {
          labelByKey[key] =
            doc.labels[key] ||
            key;
        }
      }
    }

    for (
      const doc of
        matchedDevolucionDocs
    ) {
      for (
        const [
          key,
          qty,
        ] of Object.entries(
          doc.totals,
        )
      ) {
        if (
          qty <= 0
        ) {
          continue;
        }

        devolucionesByKey[key] =
          (
            devolucionesByKey[
              key
            ] ||
            0
          ) + qty;

        if (
          !devolucionesLabelByKey[
            key
          ]
        ) {
          devolucionesLabelByKey[
            key
          ] =
            doc.labels[key] ||
            labelByKey[key] ||
            key;
        }
      }
    }

    return NextResponse.json(
      {
        ok: true,

        date,
        driverCode,
        driverName,

        qtyByKey,
        labelByKey,

        devolucionesByKey,
        devolucionesLabelByKey,

        totalProducts:
          Object.keys(
            qtyByKey,
          ).length,

        totalDevolucionesProducts:
          Object.keys(
            devolucionesByKey,
          ).length,

        debug: {
          source,

          scanned,

          matchedSalida,

          matchedDriver:
            matchedSalidaDriver,

          matchedSalidaDriver,

          matchedDevolucion,

          matchedDevolucionDriver,

          effectiveSalidaDocs:
            effectiveDocs.length,

          devolucionDocs:
            matchedDevolucionDocs.length,

          skippedPossibleSnapshots:
            Math.max(
              0,
              matchedDocs.length -
                effectiveDocs.length,
            ),

          matchedDocIds:
            matchedDocs.map(
              (doc) =>
                doc.id,
            ),

          matchedDocTotals:
            matchedDocs.map(
              (doc) => ({
                id: doc.id,

                total:
                  docTotalQty(
                    doc,
                  ),

                keys:
                  doc.totals,

                isCompleteBatch:
                  isCompleteBatchSalida(
                    doc,
                  ),
              }),
            ),

          effectiveDocIds:
            effectiveDocs.map(
              (doc) =>
                doc.id,
            ),

          effectiveDocTotals:
            effectiveDocs.map(
              (doc) => ({
                id: doc.id,

                total:
                  docTotalQty(
                    doc,
                  ),

                keys:
                  doc.totals,
              }),
            ),

          devolucionDocIds:
            matchedDevolucionDocs.map(
              (doc) =>
                doc.id,
            ),

          devolucionDocTotals:
            matchedDevolucionDocs.map(
              (doc) => ({
                id: doc.id,

                total:
                  docTotalQty(
                    doc,
                  ),

                keys:
                  doc.totals,
              }),
            ),

          hasAdminConfig,
          hasClientConfig,
        },
      },
    );
  } catch (error) {
    console.error(
      "[global-outputs] error:",
      error,
    );

    return NextResponse.json(
      {
        ok: false,

        error:
          error instanceof Error
            ? error.message
            : String(error),
      },
      {
        status: 500,
      },
    );
  }
}