import Notification from '../../models/Notification.js';
import { countTotalUnreadItems } from '../../services/notificationService.js';

/**
 * GET /notifications
 * Mengambil daftar notifikasi milik user yang sedang login
 */
export async function getNotifications(request, reply) {
  const userId = request.user.id;
  const { limit = 20, skip = 0 } = request.query;

  try {
    const notifications = await Notification.find({ recipient_id: userId })
      .sort({ updatedAt: -1 }) // Urutkan berdasarkan interaksi terbaru
      .skip(parseInt(skip))
      .limit(parseInt(limit))
      .populate('sender_id', 'nama avatar_url')
      .populate({
        path: 'post_id',
        select: 'caption media',
      })
      .lean();

    // Mapping pesan notifikasi agar rapi (Grouping Logic)
    const formattedNotifications = notifications.map((n) => {
      let message = '';
      const senderNama = n.sender_id?.nama || 'Seseorang';
      const count = n.others_count || 0;

      switch (n.type) {
        case 'like':
          message = count > 0 
            ? `${senderNama} dan ${count} lainnya menyukai postingan Anda.`
            : `${senderNama} menyukai postingan Anda.`;
          break;
        case 'comment':
          message = count > 0 
            ? `${senderNama} dan ${count} lainnya mengomentari postingan Anda.`
            : `${senderNama} mengomentari postingan Anda.`;
          break;
        case 'repost':
          message = count > 0 
            ? `${senderNama} dan ${count} lainnya membagikan ulang postingan Anda.`
            : `${senderNama} membagikan ulang postingan Anda.`;
          break;
        case 'follow':
          message = count > 0 
            ? `${senderNama} dan ${count} lainnya mulai mengikuti Anda.`
            : `${senderNama} mulai mengikuti Anda.`;
          break;
        case 'takedown':
          message = 'Postingan Anda di-takedown karena melanggar pedoman komunitas.';
          break;
        case 'chat':
          message = 'Ada pesan baru untukmu.';
          break;
        case 'toxic':
          message = 'Komentar Anda melanggar pedoman komunitas.';
          break;
        default:
          message = 'Ada interaksi baru di akun Anda.';
      }

      return {
        _id: n._id,
        type: n.type,
        sender: n.sender_id,
        post: n.post_id,
        reference_id: n.reference_id, // Tambahan untuk ID Chat/Room
        message,
        is_read: n.is_read,
        others_count: count,
        grouped_items: n.grouped_items || [], // Detail interaksi per user (untuk Deep Linking)
        createdAt: n.createdAt,
        updatedAt: n.updatedAt,
      };
    });

    // Hitung total notifikasi yang belum dibaca (Total Seluruh Aksi)
    const unreadCount = await countTotalUnreadItems(userId);

    return reply.send({
      success: true,
      data: {
        notifications: formattedNotifications,
        unread_count: unreadCount
      },
    });
  } catch (error) {
    request.log.error(error);
    return reply.status(500).send({ success: false, message: 'Gagal mengambil notifikasi.' });
  }
}

/**
 * PATCH /notifications/:id/read
 * Menandai satu notifikasi sebagai sudah dibaca
 */
export async function markAsRead(request, reply) {
  const userId = request.user.id;
  const { id } = request.params;

  try {
    const result = await Notification.findOneAndUpdate(
      { _id: id, recipient_id: userId },
      { is_read: true },
      { new: true }
    );

    if (!result) {
      return reply.status(404).send({ success: false, message: 'Notifikasi tidak ditemukan.' });
    }

    // Hitung sisa notifikasi unread agar FE sinkron
    const unreadCount = await countTotalUnreadItems(userId);

    return reply.send({ 
      success: true, 
      message: 'Notifikasi ditandai sebagai dibaca.',
      data: { unread_count: unreadCount }
    });
  } catch (error) {
    return reply.status(500).send({ success: false, message: 'Gagal mengupdate notifikasi.' });
  }
}

/**
 * PATCH /notifications/read-all
 * Menandai semua notifikasi user sebagai sudah dibaca
 */
export async function markAllAsRead(request, reply) {
  const userId = request.user.id;

  try {
    await Notification.updateMany(
      { recipient_id: userId, is_read: false },
      { is_read: true }
    );

    return reply.send({ 
      success: true, 
      message: 'Semua notifikasi ditandai sebagai dibaca.',
      data: { unread_count: 0 }
    });
  } catch (error) {
    return reply.status(500).send({ success: false, message: 'Gagal mengupdate notifikasi.' });
  }
}
