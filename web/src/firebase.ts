import { initializeApp } from 'firebase/app';
import { getAnalytics } from 'firebase/analytics';
import { getAuth, GoogleAuthProvider, type Auth } from 'firebase/auth';
import { getDatabase, type Database } from 'firebase/database';
import { getStorage, type FirebaseStorage } from 'firebase/storage';
import { isLocalBackend } from './config';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL as string,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as string,
  messagingSenderId: import.meta.env
    .VITE_FIREBASE_MESSAGING_SENDER_ID as string,
  appId: import.meta.env.VITE_FIREBASE_APP_ID as string,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID as string,
};

const app = isLocalBackend ? null : initializeApp(firebaseConfig);
export const analytics = app ? getAnalytics(app) : null;

// Initialize Auth
export const auth = (app ? getAuth(app) : null) as Auth;
export const googleProvider = new GoogleAuthProvider();

// Initialize Realtime Database
export const db = (app ? getDatabase(app) : null) as Database;

// Initialize Storage
export const storage = (app ? getStorage(app) : null) as FirebaseStorage;

export default app;
