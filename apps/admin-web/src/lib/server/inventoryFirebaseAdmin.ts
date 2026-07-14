import admin from 'firebase-admin';

function clean(value: unknown) {
  return String(value ?? '').trim();
}

function envAny(...names: string[]) {
  for (const name of names) {
    const value = process.env[name];

    if (value && clean(value)) {
      return clean(value);
    }
  }

  return '';
}

function getPrivateKey(value: string) {
  return clean(value)
    .replace(/^"|"$/g, '')
    .replace(/^'|'$/g, '')
    .replace(/\\n/g, '\n');
}

function readServiceAccountFromEnv() {
  const serviceAccountJson = envAny(
    'FIREBASE_SERVICE_ACCOUNT_JSON',
    'INVENTORY_FIREBASE_SERVICE_ACCOUNT_JSON',
  );

  if (serviceAccountJson) {
    return JSON.parse(serviceAccountJson);
  }

  const serviceAccountBase64 = envAny(
    'FIREBASE_SERVICE_ACCOUNT_BASE64',
    'INVENTORY_FIREBASE_SERVICE_ACCOUNT_BASE64',
  );

  if (serviceAccountBase64) {
    return JSON.parse(
      Buffer.from(serviceAccountBase64, 'base64').toString('utf8'),
    );
  }

  const projectId = envAny(
    'FIREBASE_PROJECT_ID',
    'INVENTORY_FIREBASE_PROJECT_ID',
    'NEXT_PUBLIC_INVENTORY_FIREBASE_PROJECT_ID',
    'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
  );

  const clientEmail = envAny(
    'FIREBASE_CLIENT_EMAIL',
    'INVENTORY_FIREBASE_CLIENT_EMAIL',
  );

  const privateKey = envAny(
    'FIREBASE_PRIVATE_KEY',
    'INVENTORY_FIREBASE_PRIVATE_KEY',
  );

  if (!projectId || !clientEmail || !privateKey) {
    return null;
  }

  return {
    projectId,
    clientEmail,
    privateKey: getPrivateKey(privateKey),
  };
}

export function getInventoryFirebaseAdminApp() {
  const existingApp = admin.apps.find(
    (app) => app?.name === 'inventory-admin',
  );

  if (existingApp) {
    return existingApp;
  }

  const credentials = readServiceAccountFromEnv();

  if (!credentials) {
    throw new Error(
      'No hay credenciales Firebase Admin configuradas para Inventario.',
    );
  }

  const projectId =
    credentials.project_id ??
    credentials.projectId ??
    envAny(
      'FIREBASE_PROJECT_ID',
      'INVENTORY_FIREBASE_PROJECT_ID',
      'NEXT_PUBLIC_INVENTORY_FIREBASE_PROJECT_ID',
      'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
    );

  return admin.initializeApp(
    {
      credential: admin.credential.cert(credentials),
      projectId: projectId || undefined,
    },
    'inventory-admin',
  );
}

export function getInventoryFirestoreAdmin() {
  const app = getInventoryFirebaseAdminApp();
  return app.firestore();
}

export { admin as inventoryFirebaseAdmin };
