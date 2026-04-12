import Post from '../../models/Post.js';
import { deleteFile } from '../../services/r2Service.js';

export async function deletePost(request, reply) {
  const userId = request.user.id;
  const { id } = request.params;

  const post = await Post.findOne({ _id: id, is_deleted: false });

  if (!post) {
    return reply.status(404).send({ success: false, message: 'Postingan tidak ditemukan.' });
  }

  if (post.author_id.toString() !== userId) {
    return reply.status(403).send({ success: false, message: 'Kamu tidak punya akses untuk menghapus postingan ini.' });
  }

  // Soft delete dulu, hapus media dari R2 di background
  post.is_deleted = true;
  await post.save();

  // Hapus media dari R2 (non-blocking)
  if (post.media?.length > 0) {
    Promise.all(post.media.map((m) => deleteFile(m.key))).catch(() => {});
  }

  return reply.send({
    success: true,
    message: 'Postingan berhasil dihapus.',
  });
}
