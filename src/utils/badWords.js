import badWordsIndo from 'indonesian-badwords';

/**
 * Daftar kata kasar kustom tambahan (Bisa ditambah manual)
 */
const customBadWords = [
  'lonte', 'perek', 'itil', 'pepek', 'memek', 'kontol'
];

/**
 * Cek apakah teks mengandung kata kasar menggunakan library & kustom
 */
export function containsToxicWords(text) {
  if (!text) return false;
  
  const lowerText = text.toLowerCase();
  
  // 1. Cek dari library indonesian-badwords
  if (badWordsIndo.flag(lowerText)) {
    return true;
  }

  // 2. Cek dari daftar kustom kita (Pembalut kalau library kurang lengkap)
  return customBadWords.some(word => lowerText.includes(word));
}
