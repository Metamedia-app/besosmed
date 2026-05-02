/**
 * Daftar kata kasar sederhana (Bisa ditambah nanti)
 */
const badWords = [
  'anjing', 'babi', 'monyet', 'bangsat', 'tolol', 'goblok', 
  'kontol', 'memek', 'pepek', 'itil', 'perek', 'lonte',
  'fuck', 'shit', 'asshole', 'bitch', 'idiot'
];

/**
 * Cek apakah teks mengandung kata kasar
 */
export function containsToxicWords(text) {
  if (!text) return false;
  const lowerText = text.toLowerCase();
  return badWords.some(word => lowerText.includes(word));
}
