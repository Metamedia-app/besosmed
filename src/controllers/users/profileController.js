import User from '../../models/User.js';
import { uploadFile, deleteFile } from '../../services/r2Service.js';

/**
 * GET /me
 * Mengambil data profil user yang sedang login
 */
export async function getMe(request, reply) {
  const userId = request.user.id;

  const user = await User.findById(userId).select('-password').lean();
  if (!user) {
    return reply.status(404).send({ success: false, message: 'User tidak ditemukan.' });
  }

  return reply.send({
    success: true,
    data: { user },
  });
}

/**
 * PATCH /me
 * Update profil user (bio, nama tampilan)
 */
export async function updateMe(request, reply) {
  const userId = request.user.id;
  const { bio, tempat_lahir, tanggal_lahir, agama } = request.body;

  const user = await User.findById(userId);
  if (!user) {
    return reply.status(404).send({ success: false, message: 'User tidak ditemukan.' });
  }

  if (bio !== undefined) user.bio = bio.trim();
  if (tempat_lahir !== undefined) user.tempat_lahir = tempat_lahir.trim();
  if (tanggal_lahir !== undefined) user.tanggal_lahir = tanggal_lahir.trim();
  if (agama !== undefined) user.agama = agama.trim();

  await user.save();

  return reply.send({
    success: true,
    message: 'Profil berhasil diperbarui.',
    data: {
      user: {
        _id: user._id,
        nim: user.nim,
        nama: user.nama,
        bio: user.bio,
        avatar_url: user.avatar_url,
        program_studi: user.program_studi,
        status_mahasiswa: user.status_mahasiswa,
        tempat_lahir: user.tempat_lahir,
        tanggal_lahir: user.tanggal_lahir,
        agama: user.agama,
      },
    },
  });
}

/**
 * POST /me/avatar
 * Upload foto profil ke Cloudflare R2 (folder: avatars/)
 */
export async function uploadAvatar(request, reply) {
  const userId = request.user.id;

  const user = await User.findById(userId);
  if (!user) {
    return reply.status(404).send({ success: false, message: 'User tidak ditemukan.' });
  }

  const parts = request.parts();
  let uploaded = null;

  for await (const part of parts) {
    if (part.type === 'file') {
      // Validasi tipe file: hanya boleh gambar
      const allowedMimes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
      if (!allowedMimes.includes(part.mimetype)) {
        part.file.resume();
        return reply.status(400).send({
          success: false,
          message: 'Format foto tidak didukung. Gunakan JPG, PNG, WEBP, atau GIF.',
        });
      }

      const chunks = [];
      for await (const chunk of part.file) {
        chunks.push(chunk);
      }
      const buffer = Buffer.concat(chunks);

      // Hapus avatar lama dari R2 jika ada
      if (user.avatar_url) {
        try {
          const oldKey = new URL(user.avatar_url).pathname.slice(1);
          await deleteFile(oldKey);
        } catch {
          // Abaikan jika gagal hapus avatar lama
        }
      }

      // Upload avatar baru ke folder avatars/
      uploaded = await uploadFile(buffer, part.mimetype, 'avatar');
      break;
    }
  }

  if (!uploaded) {
    return reply.status(400).send({ success: false, message: 'File avatar tidak ditemukan.' });
  }

  // Simpan URL avatar baru di database
  user.avatar_url = uploaded.url;
  await user.save();

  return reply.send({
    success: true,
    message: 'Foto profil berhasil diperbarui.',
    data: {
      avatar_url: uploaded.url,
    },
  });
}

/**
 * DELETE /me/avatar
 * Hapus foto profil dari R2 dan kosongkan avatar_url
 */
export async function deleteAvatar(request, reply) {
  const userId = request.user.id;

  const user = await User.findById(userId);
  if (!user) {
    return reply.status(404).send({ success: false, message: 'User tidak ditemukan.' });
  }

  if (!user.avatar_url) {
    return reply.status(400).send({ success: false, message: 'Kamu belum memiliki foto profil.' });
  }

  // Hapus file dari R2
  try {
    const oldKey = new URL(user.avatar_url).pathname.slice(1);
    await deleteFile(oldKey);
  } catch {
    // Lanjut meskipun gagal hapus di R2
  }

  // Kosongkan avatar_url di database
  user.avatar_url = '';
  await user.save();

  return reply.send({
    success: true,
    message: 'Foto profil berhasil dihapus.',
  });
}
