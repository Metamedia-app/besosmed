import User from '../../models/User.js';
import Follow from '../../models/Follow.js';
import bcrypt from 'bcrypt';
import { uploadFile, deleteFile } from '../../services/r2Service.js';
import mongoose from 'mongoose';

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
    data: { 
      user: {
        _id: user._id,
        nim: user.nim,
        nama: user.nama,
        email: user.email,
        program_studi: user.program_studi,
        jenis_kelamin: user.jenis_kelamin,
        status_mahasiswa: user.status_mahasiswa,
        role: user.role || 'user',
        bio: user.bio,
        avatar_url: user.avatar_url,
        tempat_lahir: user.tempat_lahir || '',
        tanggal_lahir: user.tanggal_lahir || '',
        agama: user.agama || '',
        is_online: user.is_online,
        createdAt: user.createdAt
      }
    },
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
        role: user.role,
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
/**
 * PATCH /me/password
 * Ganti password user dengan verifikasi password lama
 */
export async function changePassword(request, reply) {
  const userId = request.user.id;
  const { oldPassword, newPassword } = request.body;

  if (!oldPassword || !newPassword) {
    return reply.status(400).send({
      success: false,
      message: 'Password lama dan password baru wajib diisi.',
    });
  }

  // Cari user dan sertakan password
  const user = await User.findById(userId).select('+password');
  if (!user) {
    return reply.status(404).send({ success: false, message: 'User tidak ditemukan.' });
  }

  // 1. Verifikasi password lama
  const isMatch = await bcrypt.compare(oldPassword, user.password);
  if (!isMatch) {
    return reply.status(401).send({
      success: false,
      message: 'Password lama yang kamu masukkan salah.',
    });
  }

  // 2. Hash password baru
  const saltRounds = 10;
  user.password = await bcrypt.hash(newPassword, saltRounds);

  // 3. Simpan perubahan
  await user.save();

  return reply.send({
    success: true,
    message: 'Password berhasil diganti. Silakan gunakan password baru untuk login berikutnya.',
  });
}

/**
 * GET /users/:id
 * Mengambil profil publik user lain + Status hubungan (Follow/Following/Folback)
 */
export async function getUserProfile(request, reply) {
  const meId = request.user.id;
  const { id: targetId } = request.params;

  // 1. Ambil data user target (bisa via _id atau via NIM)
  const isObjectId = mongoose.isValidObjectId(targetId);
  const targetUser = await User.findOne(
    isObjectId ? { _id: targetId } : { nim: targetId }
  )
    .select('nim nama program_studi role status_mahasiswa jenis_kelamin bio avatar_url followers_count following_count tempat_lahir tanggal_lahir agama createdAt')
    .lean();

  if (!targetUser) {
    return reply.status(404).send({ success: false, message: 'User tidak ditemukan.' });
  }

  // Gunakan ID asli MongoDB dari targetUser untuk cek hubungan
  const targetObjectId = targetUser._id;

  // 2. Cek hubungan timbal balik
  const [following, follower] = await Promise.all([
    Follow.findOne({ follower_id: meId, following_id: targetObjectId }).lean(),
    Follow.findOne({ follower_id: targetObjectId, following_id: meId }).lean(),
  ]);

  return reply.send({
    success: true,
    data: {
      user: {
        ...targetUser,
        is_following: !!following,
        follows_me: !!follower, // Indikator Folback! 🤝
      },
    },
  });
}
