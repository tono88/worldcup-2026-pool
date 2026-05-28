import * as admin from 'firebase-admin';

export const initializeFirebaseAdmin = (): admin.app.App => {
  if (admin.apps.length > 0) {
    return admin.app();
  }

  const databaseURL = process.env.FIREBASE_DATABASE_URL;
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

  if (serviceAccountJson) {
    admin.initializeApp({
      credential: admin.credential.cert(JSON.parse(serviceAccountJson)),
      ...(databaseURL && { databaseURL }),
    });
    return admin.app();
  }

  admin.initializeApp(databaseURL ? { databaseURL } : undefined);
  return admin.app();
};

export const getDatabase = (): admin.database.Database => {
  initializeFirebaseAdmin();
  return admin.database();
};
