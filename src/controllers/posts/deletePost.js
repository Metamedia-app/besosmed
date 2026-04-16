import Post from '../../models/Post.js';
import Comment from '../../models/Comment.js';
import Like from '../../models/Like.js';
import Notification from '../../models/Notification.js';
import { deleteFile } from '../../services/r2Service.js';

export async function deletePost(request, reply) {
  const userId = request.user.id;
  const { id } = request.params;

  const post = await Post.findOne({ _id: id });

  if (!post) {
    return reply.status(404).send({ success: false, message: 'Postingan tidak ditemukan.' });
  }

  if (post.author_id.toString() !== userId) {
    return reply.status(403).send({ success: false, message: 'Kamu tidak punya akses untuk menghapus postingan ini.' });
  }

  // 1. Bersihkan Media dari R2 (non-blocking)
  if (post.media?.length > 0) {
    Promise.all(post.media.map((m) => deleteFile(m.key))).catch(() => {});
  }

  // 2. Cascade Delete (Pembersihan Total di Database)
  try {
    await Promise.all([
      Post.deleteOne({ _id: id }),           // Hapus Post
      Comment.deleteMany({ post_id: id }),   // Hapus seluruh komentar post ini
      Like.deleteMany({ post_id: id }),      // Hapus seluruh Like post ini
      Notification.deleteMany({ post_id: id }) // Hapus notifikasi terkait post ini
    ]);
  } catch (error) {
    request.log.error(error);
    // Kita tetap lanjut mengirim sukses karena post utama biasanya sudah terhapus
  }

  return reply.send({
    success: true,
    message: 'Postingan berhasil dihapus.',
  });
}
