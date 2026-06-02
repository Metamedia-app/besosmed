import User from '../../models/User.js';
import Post from '../../models/Post.js';
import Notification from '../../models/Notification.js';
import * as wsService from '../../services/wsService.js';

/**
 * Mendapatkan daftar semua postingan (untuk moderasi)
 */
export async function getAllPosts(request, reply) {
  const { limit = 20, skip = 0 } = request.query;

  try {
    // Admin boleh melihat semua (termasuk yang sudah di-takedown)
    const posts = await Post.find({})
      .sort({ createdAt: -1 })
      .skip(parseInt(skip))
      .limit(parseInt(limit))
      .populate('author_id', 'nim nama avatar_url program_studi')
      .lean();

    return reply.send({
      success: true,
      data: { posts },
    });
  } catch (error) {
    return reply.status(500).send({ success: false, message: 'Gagal mengambil postingan.' });
  }
}

/**
 * Takedown Postingan (Menghapus paksa oleh Admin)
 */
export async function takedownPost(request, reply) {
  const { id } = request.params;
  const adminId = request.user.id;

  try {
    const post = await Post.findOneAndUpdate(
      { _id: id, is_deleted: false },
      { 
        is_deleted: true,
        takedown_by: adminId, // Catat siapa yang takedown
        takedown_at: new Date()
      },
      { new: true }
    );

    if (!post) {
      return reply.status(404).send({ success: false, message: 'Postingan tidak ditemukan.' });
    }

    // --- NOTIFIKASI REAL-TIME ---
    // 1. Buat Notifikasi di DB
    const notif = await Notification.create({
      recipient_id: post.author_id,
      sender_id: adminId,
      type: 'takedown',
      post_id: post._id,
      grouped_items: [{
        user_id: adminId,
        nama: 'Admin Kampus', // Nama samaran untuk admin
        at: new Date()
      }]
    });

    // 2. Hitung Unread Count terbaru untuk penerima
    const unreadCount = await Notification.countDocuments({ 
      recipient_id: post.author_id, 
      is_read: false 
    });

    // 3. Emit via WebSocket
    wsService.emitNotification(post.author_id, {
      ...notif.toObject(),
      message: 'Postingan Anda di-takedown karena melanggar pedoman komunitas.',
      unread_count: unreadCount
    });

    return reply.send({
      success: true,
      message: 'Postingan berhasil di-takedown dan user telah dinotifikasi.',
    });
  } catch (error) {
    return reply.status(500).send({ success: false, message: 'Gagal takedown postingan.' });
  }
}

/**
 * Untakedown Postingan (Membatalkan hapus paksa oleh Admin)
 */
export async function untakedownPost(request, reply) {
  const { id } = request.params;

  try {
    const post = await Post.findByIdAndUpdate(
      id,
      { 
        is_deleted: false,
        $unset: { takedown_by: "", takedown_at: "" } // Hapus catatan takedown
      },
      { new: true }
    );

    if (!post) {
      return reply.status(404).send({ success: false, message: 'Postingan tidak ditemukan.' });
    }

    return reply.send({
      success: true,
      message: 'Postingan berhasil dipulihkan (untakedown).',
    });
  } catch (error) {
    return reply.status(500).send({ success: false, message: 'Gagal memulihkan postingan.' });
  }
}

/**
 * Ban User (Blokir Akun)
 */
export async function banUser(request, reply) {
  const { id } = request.params;

  try {
    const user = await User.findById(id);

    if (!user) {
      return reply.status(404).send({ success: false, message: 'User tidak ditemukan.' });
    }

    // --- PROTEKSI ADMIN ---
    if (user.role === 'admin') {
      return reply.status(403).send({ 
        success: false, 
        message: 'Tidak diperbolehkan memblokir sesama akun Admin.' 
      });
    }

    user.is_banned = true;
    await user.save();

    // FULL-DUPLEX FORCE DISCONNECT: Lakukan pemutusan paksa socket jika user sedang online
    await wsService.forceDisconnectUser(id);

    return reply.send({
      success: true,
      message: `Akun ${user.nama} berhasil di-ban. Koneksi real-time diputus secara instan.`,
    });
  } catch (error) {
    return reply.status(500).send({ success: false, message: 'Gagal ban user.' });
  }
}

/**
 * Unban User (Buka Blokir Akun)
 */
export async function unbanUser(request, reply) {
  const { id } = request.params;

  try {
    const user = await User.findByIdAndUpdate(id, { is_banned: false }, { new: true });

    if (!user) {
      return reply.status(404).send({ success: false, message: 'User tidak ditemukan.' });
    }

    return reply.send({
      success: true,
      message: `Blokir akun ${user.nama} telah dibuka.`,
    });
  } catch (error) {
    return reply.status(500).send({ success: false, message: 'Gagal unban user.' });
  }
}
