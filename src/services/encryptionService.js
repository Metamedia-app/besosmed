import crypto from 'crypto';

// Gunakan key dari ENV, jika tidak ada pakai default (tapi WAJIB isi di ENV untuk produksi)
const ENCRYPTION_KEY = process.env.CHAT_ENCRYPTION_KEY || 'kunci_rahasia_32_karakter_anda_d'; 
const IV_LENGTH = 16; // Untuk AES, IV selalu 16 bytes

/**
 * Enkripsi teks mentah
 * @param {string} text 
 * @returns {string} iv:encryptedData
 */
export function encryptMessage(text) {
  if (!text) return '';
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
  let encrypted = cipher.update(text);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return iv.toString('hex') + ':' + encrypted.toString('hex');
}

/**
 * Dekripsi teks dari database
 * @param {string} text (format: iv:encryptedData)
 * @returns {string} mentah
 */
export function decryptMessage(text) {
  if (!text || !text.includes(':')) return text; // Jika tidak ada IV, berarti teks mentah/lama
  try {
    const textParts = text.split(':');
    const iv = Buffer.from(textParts.shift(), 'hex');
    const encryptedText = Buffer.from(textParts.join(':'), 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
  } catch (error) {
    console.error('Decryption failed:', error.message);
    return '[Gagal mendekripsi pesan]';
  }
}
