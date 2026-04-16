import Like from '../../models/Like.js';
import Post from '../../models/Post.js';
import Notification from '../../models/Notification.js';
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
    await Like.create({ user_id: userId, post_id: postId });
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
          $inc: { others_count: 1 }
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
        });
      } else {
        notif = existingNotif;
      }

      // Emit notification real-time via Socket.io
      const count = notif.others_count || 0;
      const message = count > 0 
        ? `${request.user.nama} dan ${count} lainnya menyukai postinganmu.`
        : `${request.user.nama} menyukai postinganmu.`;

      emitNotification(post.author_id, {
        id: notif._id,
        type: 'like',
        sender_id: userId,
        post_id: postId,
        message,
        created_at: notif.createdAt,
        updatedAt: notif.updatedAt,
      });
    }
  }

  await post.save();

  // Broadcast update like ke semua user
  emitLikeUpdate(postId, post.likes_count, { user_id: userId, nama: request.user.nama });

  return reply.send({
    success: true,
    message: liked ? 'Postingan disukai.' : 'Suka dibatalkan.',
    data: {
      liked,
      likes_count: post.likes_count,
    },
  });
}
