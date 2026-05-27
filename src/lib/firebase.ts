import { initializeApp, type FirebaseApp } from "firebase/app";
import { getAuth, signInAnonymously, type Auth, type User } from "firebase/auth";
import {
  enableIndexedDbPersistence,
  getFirestore,
  connectFirestoreEmulator,
  type Firestore
} from "firebase/firestore";

export type FirebaseServices = {
  app: FirebaseApp;
  auth: Auth;
  db: Firestore;
};

let services: FirebaseServices | null | undefined;
let persistenceStarted = false;

export function firebaseConfigPresent(): boolean {
  return Boolean(
    import.meta.env.VITE_FIREBASE_API_KEY &&
      import.meta.env.VITE_FIREBASE_PROJECT_ID &&
      import.meta.env.VITE_FIREBASE_APP_ID
  );
}

export function getFirebaseServices(): FirebaseServices | null {
  if (!firebaseConfigPresent()) return null;
  if (services !== undefined) return services;

  const app = initializeApp({
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID
  });
  const auth = getAuth(app);
  const db = getFirestore(app);

  if (import.meta.env.VITE_FIRESTORE_EMULATOR_HOST) {
    const [host, port] = String(import.meta.env.VITE_FIRESTORE_EMULATOR_HOST).split(":");
    connectFirestoreEmulator(db, host, Number(port));
  }

  services = { app, auth, db };
  return services;
}

export async function signInAnonymouslyIfNeeded(): Promise<User | null> {
  const firebase = getFirebaseServices();
  if (!firebase) return null;

  if (!persistenceStarted && typeof window !== "undefined") {
    persistenceStarted = true;
    await enableIndexedDbPersistence(firebase.db).catch(() => undefined);
  }

  if (firebase.auth.currentUser) return firebase.auth.currentUser;
  const credential = await signInAnonymously(firebase.auth);
  return credential.user;
}
