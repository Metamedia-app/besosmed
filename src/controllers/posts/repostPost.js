import Post from '../../models/Post.js';
import Notification from '../../models/Notification.js';
import { emitRepostUpdate, emitNotification, emitNewPost } from '../../services/wsService.js';

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

  // Notifikasi ke pemilik post asli
  const notif = await Notification.create({
    recipient_id: originalPost.author_id,
    sender_id: userId,
    type: 'repost',
    post_id: originalPostId,
  });
  emitNotification(originalPost.author_id, {
    id: notif._id,
    type: 'repost',
    sender_id: userId,
    post_id: originalPostId,
    message: `${request.user.nama} memposting ulang postinganmu.`,
    created_at: notif.createdAt,
  });

  // Broadcast repost update & post baru
  emitRepostUpdate(originalPostId, originalPost.reposts_count);
  emitNewPost(formatted);

  return reply.status(201).send({
    success: true,
    message: 'Postingan berhasil diposting ulang.',
    data: { post: formatted, original_reposts_count: originalPost.reposts_count },
  });
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

  // Link deep link ke postingan (format bisa disesuaikan dengan flutter app)
  const shareUrl = `metamedia://posts/${postId}`;

  return reply.send({
    success: true,
    message: 'Link postingan siap dibagikan.',
    data: { share_url: shareUrl, shares_count: post.shares_count },
  });
}
