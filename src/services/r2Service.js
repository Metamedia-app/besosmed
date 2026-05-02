import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';
import config from '../config/index.js';

// ── R2 Client (S3-compatible) ─────────────────────────────────────────────────
const r2Client = new S3Client({
  region: 'auto',
  endpoint: config.r2.endpoint,
  credentials: {
    accessKeyId: config.r2.accessKeyId,
    secretAccessKey: config.r2.secretAccessKey,
  },
  // Required untuk kompatibilitas R2 dengan AWS SDK v3 terbaru
  requestChecksumCalculation: 'WHEN_REQUIRED',
  responseChecksumValidation: 'WHEN_REQUIRED',
});

// Ekspor client dan Command untuk penggunaan custom (seperti streaming/decryption)
export { r2Client, GetObjectCommand };

// ── Folder map ────────────────────────────────────────────────────────────────
const FOLDERS = {
  image: 'posts/images',
  video: 'posts/videos',
  avatar: 'avatars',
  story_image: 'stories/images',
  story_video: 'stories/videos',
  inbox: 'massage/inbox',
  group: 'massage/grub',
  community: 'massage/community',
};

/**
 * Tentukan ekstensi file dari mimetype
 */
function getExtension(mimetype) {
  const map = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'video/mp4': 'mp4',
    'video/quicktime': 'mov',
    'video/x-msvideo': 'avi',
    'video/webm': 'webm',
  };
  return map[mimetype] || 'bin';
}

/**
 * Upload file ke Cloudflare R2
 * @param {Buffer} fileBuffer - Buffer file
 * @param {string} mimetype   - MIME type (contoh: 'image/jpeg')
 * @param {string} folder     - Jenis folder: 'image' | 'video' | 'avatar' | 'story'
 * @returns {{ key: string, url: string, type: string }}
 */
export async function uploadFile(fileBuffer, mimetype, folder = 'image') {
  const ext = getExtension(mimetype);
  const folderPath = FOLDERS[folder] || FOLDERS.image;
  const key = `${folderPath}/${randomUUID()}.${ext}`;

  const command = new PutObjectCommand({
    Bucket: config.r2.bucketName,
    Key: key,
    Body: fileBuffer,
    ContentType: mimetype,
  });

  await r2Client.send(command);

  const url = `${config.r2.publicUrl}/${key}`;
  const type = mimetype.startsWith('video/') ? 'video' : 'image';

  return { key, url, type };
}


/**
 * Generate presigned URL untuk akses private (opsional, untuk file protected)
 * @param {string} key
 * @param {number} expiresIn - Detik (default: 3600 = 1 jam)
 */
export async function getPresignedUrl(key, expiresIn = 3600) {
  const command = new PutObjectCommand({
    Bucket: config.r2.bucketName,
    Key: key,
  });
  return getSignedUrl(r2Client, command, { expiresIn });
}

/**
 * Test koneksi R2
 */
export async function testR2Connection() {
  try {
    // Upload file kecil sebagai test
    const testKey = `test/connection-test-${Date.now()}.txt`;
    await r2Client.send(new PutObjectCommand({
      Bucket: config.r2.bucketName,
      Key: testKey,
      Body: Buffer.from('R2 connection test'),
      ContentType: 'text/plain',
    }));
    // Hapus langsung
    await r2Client.send(new DeleteObjectCommand({
      Bucket: config.r2.bucketName,
      Key: testKey,
    }));
    return true;
  } catch (err) {
    throw new Error(`R2 connection failed: ${err.message}`);
  }
}

/**
 * Menghapus file dari R2 berdasarkan Key
 */
export async function deleteFile(key) {
  if (!key) return;
  
  try {
    const command = new DeleteObjectCommand({
      Bucket: config.r2.bucketName,
      Key: key,
    });
    
    await r2Client.send(command);
    console.log(`[R2] File deleted: ${key}`);
    return true;
  } catch (err) {
    console.error(`[R2] Error deleting file ${key}:`, err.message);
    throw err;
  }
}
