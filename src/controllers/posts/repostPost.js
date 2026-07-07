import Notification from '../../models/Notification.js';
import Post from '../../models/Post.js';
import { countTotalUnreadItems, triggerPushNotification } from '../../services/notificationService.js';
import { emitRepostUpdate, emitNotification, emitNewPost, emitShareUpdate } from '../../services/wsService.js';

export async function repostPost(request, reply) {
  const userId = request.user.id;
  const { id: originalPostId } = request.params;
  const caption = request.body?.caption?.trim() || '';

  const originalPost = await Post.findOne({ _id: originalPostId, is_deleted: false });
  if (!originalPost) {
    return reply.status(404).send({ success: false, message: 'Postingan tidak ditemukan.' });
  }

  // Cegah repost postingan sendiri
  if (originalPost.author_id.toString() === userId) {
    return reply.status(400).send({ success: false, message: 'Kamu tidak bisa memposting ulang postinganmu sendiri.' });
  }

  // Idempotensi: Cek apakah user sudah pernah me-repost
  const existingRepost = await Post.findOne({
    author_id: userId,
    original_post_id: originalPostId,
    type: 'repost',
    is_deleted: false,
  });

  if (existingRepost) {
    // Jika sudah ada, kembalikan data yang sudah ada (200 OK)
    await existingRepost.populate('author_id', 'nim nama avatar_url program_studi');
    await existingRepost.populate({
      path: 'original_post_id',
      select: 'caption media author_id createdAt',
      populate: { path: 'author_id', select: 'nim nama avatar_url' },
    });
    
    const repostObj = existingRepost.toObject();
    const formatted = { ...repostObj, author: repostObj.author_id, author_id: undefined };
    
    return reply.send({
      success: true,
      message: 'Kamu sudah memposting ulang postingan ini.',
      data: { post: formatted, original_reposts_count: originalPost.reposts_count },
    });
  }

  // Buat postingan baru bertipe repost
  const repost = await Post.create({
    author_id: userId,
    caption,
    type: 'repost',
    original_post_id: originalPostId,
  });

  // Increment counter di post asli
  originalPost.reposts_count += 1;
  await originalPost.save();

  // Populate untuk response & broadcast
  await repost.populate('author_id', 'nim nama avatar_url program_studi');
  await repost.populate({
    path: 'original_post_id',
    select: 'caption media author_id createdAt',
    populate: { path: 'author_id', select: 'nim nama avatar_url' },
  });

  const repostObj = repost.toObject();
  const formatted = { ...repostObj, author: repostObj.author_id, author_id: undefined };

  // Notifikasi atau Update Notifikasi ke pemilik post asli
  if (originalPost.author_id.toString() !== userId) {
    const existingNotif = await Notification.findOneAndUpdate(
      {
        recipient_id: originalPost.author_id,
        post_id: originalPostId,
        type: 'repost',
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
              at: new Date()
            }],
            $slice: -5
          }
        }
      },
      { new: true }
    );

    let notif;
    if (!existingNotif) {
      notif = await Notification.create({
        recipient_id: originalPost.author_id,
        sender_id: userId,
        type: 'repost',
        post_id: originalPostId,
        grouped_items: [{
          user_id: userId,
          nama: request.user.nama,
          avatar_url: request.user.avatar_url,
          at: new Date()
        }]
      });
    } else {
      notif = existingNotif;
    }

    // Format pesan real-time
    const count = notif.others_count || 0;
    const message = count > 0 
      ? `${request.user.nama} dan ${count} lainnya memposting ulang postinganmu.`
      : `${request.user.nama} memposting ulang postinganmu.`;

    // Hitung total unread untuk recipient (Realtime Badge)
    const unreadCount = await countTotalUnreadItems(originalPost.author_id);

    emitNotification(originalPost.author_id, {
      id: notif._id,
      type: 'repost',
      sender_id: userId,
      post_id: originalPostId,
      message,
      unread_count: unreadCount, // Kirim angka badge terbaru
      created_at: notif.createdAt,
      updatedAt: notif.updatedAt,
    });

    // --- KIRIM PUSH NOTIFICATION (FCM) ---
    triggerPushNotification(originalPost.author_id, {
      title: 'Notifikasi',
      body: message,
      data: {
        type: 'repost',
        post_id: originalPostId.toString()
      }
    });
  }

  // Broadcast repost update & post baru
  emitRepostUpdate(originalPostId, originalPost.reposts_count);
  emitNewPost(formatted);

  // --- CACHE BUSTING: Hancurkan cache feed agar fresh data langsung muncul ---
  if (request.server.redis) {
    try {
      const keys = await request.server.redis.keys('feed_html:*');
      if (keys.length > 0) await request.server.redis.del(...keys);
    } catch (err) {
      request.log.error(err);
    }
  }

  return reply.status(201).send({
    success: true,
    message: 'Postingan berhasil diposting ulang.',
    data: { post: formatted, original_reposts_count: originalPost.reposts_count },
  });
}

/**
 * DELETE /api/v1/posts/:id/repost
 * Membatalkan repost
 */
export async function unrepostPost(request, reply) {
  const userId = request.user.id;
  const { id: originalPostId } = request.params;

  try {
    // 1. Cari dokumen repost milik user ini untuk post ini
    const repost = await Post.findOne({
      author_id: userId,
      original_post_id: originalPostId,
      type: 'repost'
    });

    if (!repost) {
      return reply.status(404).send({
        success: false,
        message: 'Repost tidak ditemukan.'
      });
    }

    // 2. Hapus dokumen repost tersebut (hard delete untuk repost records agar hemat storage)
    await Post.deleteOne({ _id: repost._id });

    // 3. Kurangi counter di post asli
    const originalPost = await Post.findById(originalPostId);
    if (originalPost && originalPost.reposts_count > 0) {
      originalPost.reposts_count -= 1;
      await originalPost.save();

      // Broadcast update
      emitRepostUpdate(originalPostId, originalPost.reposts_count);
    }

    // --- CACHE BUSTING: Hancurkan cache feed agar fresh data langsung muncul ---
    if (request.server.redis) {
      try {
        const keys = await request.server.redis.keys('feed:*');
        if (keys.length > 0) await request.server.redis.del(...keys);
      } catch (err) {}
    }

    return reply.send({
      success: true,
      message: 'Repost dihapus.',
      data: {
        original_reposts_count: originalPost ? originalPost.reposts_count : 0
      }
    });

  } catch (error) {
    request.log.error(error);
    return reply.status(500).send({
      success: false,
      message: 'Terjadi kesalahan saat membatalkan repost.'
    });
  }
}

/**
 * Share — increment shares_count dan return link yang bisa dibagikan
 */
export async function sharePost(request, reply) {
  const { id: postId } = request.params;

  const post = await Post.findOne({ _id: postId, is_deleted: false });
  if (!post) {
    return reply.status(404).send({ success: false, message: 'Postingan tidak ditemukan.' });
  }

  post.shares_count += 1;
  await post.save();

  // Broadcast update share
  emitShareUpdate(postId, post.shares_count);

  // Link deep link ke postingan (format bisa disesuaikan dengan flutter app)
  const shareUrl = `metamedia://posts/${postId}`;

  return reply.send({
    success: true,
    message: 'Link postingan siap dibagikan.',
    data: { share_url: shareUrl, shares_count: post.shares_count },
  });
}
