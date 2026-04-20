import { FirebaseApp, getApp, getApps, initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_INVENTORY_FIREBASE_API_KEY!,
  authDomain: process.env.NEXT_PUBLIC_INVENTORY_FIREBASE_AUTH_DOMAIN!,
  projectId: process.env.NEXT_PUBLIC_INVENTORY_FIREBASE_PROJECT_ID!,
  storageBucket: process.env.NEXT_PUBLIC_INVENTORY_FIREBASE_STORAGE_BUCKET!,
  messagingSenderId: process.env.NEXT_PUBLIC_INVENTORY_FIREBASE_MESSAGING_SENDER_ID!,
  appId: process.env.NEXT_PUBLIC_INVENTORY_FIREBASE_APP_ID!,
};

const appName = 'inventory-app';

const existingApp = getApps().find((a) => a.name === appName);
const app: FirebaseApp = existingApp ?? initializeApp(firebaseConfig, appName);

export const inventoryDb = getFirestore(app);