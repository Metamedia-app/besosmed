import admin from 'firebase-admin';
import { readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * Inisialisasi Firebase Admin SDK
 * Digunakan untuk melakukan verifikasi idToken yang dikirim dari mobile/frontend.
 */

let firebaseApp;

try {
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;

  let serviceAccount;

  if (serviceAccountJson) {
    // Metode B: Baca langsung dari String (untuk Railway/Prod)
    try {
      // Membersihkan potensi karakter escape yang rusak atau spasi berlebih
      const cleanedJson = serviceAccountJson.trim();
      serviceAccount = JSON.parse(cleanedJson);
      console.log('[Firebase] Menggunakan konfigurasi dari Environment Variable (JSON String).');
    } catch (parseError) {
      throw new Error(`Format JSON di env tidak valid: ${parseError.message}`);
    }
  } else if (serviceAccountPath) {
    // Metode A: Baca dari File (untuk Lokal)
    const absolutePath = resolve(process.cwd(), serviceAccountPath);
    serviceAccount = JSON.parse(readFileSync(absolutePath, 'utf8'));
    console.log('[Firebase] Menggunakan konfigurasi dari File JSON.');
  }

  if (serviceAccount) {
    // Pastikan private_key meng-handle karakter newline dengan benar
    if (serviceAccount.private_key) {
      serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
    }

    if (!admin.apps.length) {
      firebaseApp = admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
      console.log('[Firebase] Admin SDK berhasil diinisialisasi.');
    }
  } else {
    console.warn('[Firebase] Konfigurasi Firebase tidak ditemukan di .env atau variabel lingkungan.');
  }
} catch (error) {
  console.error('[Firebase] Gagal menginisialisasi Admin SDK:', error.message);
}

export default admin;
