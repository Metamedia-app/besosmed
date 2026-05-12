import Like from '../../models/Like.js';
import Post from '../../models/Post.js';
import Notification from '../../models/Notification.js';
import { countTotalUnreadItems, triggerPushNotification } from '../../services/notificationService.js';
import { emitLikeUpdate, emitNotification } from '../../services/wsService.js';

export async function likePost(request, reply) {
  const userId = request.user.id;
  const { id: postId } = request.params;

  const post = await Post.findOne({ _id: postId, is_deleted: false });
  if (!post) {
    return reply.status(404).send({ success: false, message: 'Postingan tidak ditemukan.' });
  }

  // Cek apakah sudah like
  const existing = await Like.findOne({ user_id: userId, post_id: postId });

  let liked;
  if (existing) {
    // Unlike
    await Like.deleteOne({ _id: existing._id });
    post.likes_count = Math.max(0, post.likes_count - 1);
    liked = false;
  } else {
    // Like
    const newLike = await Like.create({ user_id: userId, post_id: postId });
    post.likes_count += 1;
    liked = true;

    // Kirim atau Update notifikasi ke pemilik post (kalau bukan diri sendiri)
    if (post.author_id.toString() !== userId) {
      const existingNotif = await Notification.findOneAndUpdate(
        {
          recipient_id: post.author_id,
          post_id: postId,
          type: 'like',
          is_read: false
        },
        {
          $set: { sender_id: userId },
          $inc: { others_count: 1 },
          $push: { 
            grouped_items: {
              $each: [{
                user_id: userId,
                nama: request.user.nama,
                avatar_url: request.user.avatar_url,
                reference_id: newLike._id,
                at: new Date()
              }],
              $slice: -5 // Simpan 5 interaksi terbaru agar payload tetap ringan
            }
          }
        },
        { new: true }
      );

      let notif;
      if (!existingNotif) {
        // Jika tidak ada notif unread, buat baru
        notif = await Notification.create({
          recipient_id: post.author_id,
          sender_id: userId,
          type: 'like',
          post_id: postId,
          grouped_items: [{
            user_id: userId,
            nama: request.user.nama,
            avatar_url: request.user.avatar_url,
            reference_id: newLike._id,
            at: new Date()
          }]
        });
      } else {
        notif = existingNotif;
      }

      // Emit notification real-time via Socket.io
      const count = notif.others_count || 0;
      const message = count > 0 
        ? `${request.user.nama} dan ${count} lainnya menyukai postinganmu.`
        : `${request.user.nama} menyukai postinganmu.`;

      // Hitung total unread untuk recipient (Realtime Badge)
      const unreadCount = await countTotalUnreadItems(post.author_id);

      emitNotification(post.author_id, {
        id: notif._id,
        type: 'like',
        sender_id: userId,
        post_id: postId,
        message,
        grouped_items: notif.grouped_items,
        unread_count: unreadCount, // Kirim angka badge terbaru
        created_at: notif.createdAt,
        updatedAt: notif.updatedAt,
      });

      // --- KIRIM PUSH NOTIFICATION (FCM) ---
      triggerPushNotification(post.author_id, {
        title: 'Notifikasi',
        body: message,
        data: {
          type: 'like',
          post_id: postId.toString()
        }
      });
    }
  }

  await post.save();

  // Broadcast update like ke semua user (dengan profil lengkap jika LIKE)
  const likerData = liked ? {
    _id: request.user.id,
    nim: request.user.nim,
    nama: request.user.nama,
    avatar_url: request.user.avatar_url,
    program_studi: request.user.program_studi
  } : null;

  emitLikeUpdate(postId, post.likes_count, likerData);

  return reply.send({
    success: true,
    message: liked ? 'Postingan disukai.' : 'Suka dibatalkan.',
    data: {
      liked,
      likes_count: post.likes_count,
    },
  });
}

/**
 * GET /api/v1/posts/:id/likers
 * Mengambil daftar user yang menyukai sebuah postingan (Paginated)
 */
export async function getLikers(request, reply) {
  const { id: postId } = request.params;
  const { limit = 20, skip = 0 } = request.query;

  try {
    const post = await Post.findOne({ _id: postId, is_deleted: false });
    if (!post) {
      return reply.status(404).send({ success: false, message: 'Postingan tidak ditemukan.' });
    }

    const [likers, total] = await Promise.all([
      Like.find({ post_id: postId })
        .sort({ createdAt: -1 })
        .skip(parseInt(skip))
        .limit(parseInt(limit))
        .populate('user_id', 'nim nama avatar_url program_studi')
        .lean(),
      Like.countDocuments({ post_id: postId }),
    ]);

    const formattedLikers = likers.map((l) => ({
      ...l.user_id,
      liked_at: l.createdAt,
    }));

    return reply.send({
      success: true,
      data: {
        total_likes: total,
        likers: formattedLikers,
      },
    });
  } catch (error) {
    request.log.error(error);
    return reply.status(500).send({ success: false, message: 'Gagal mengambil daftar penyuka.' });
  }
}
