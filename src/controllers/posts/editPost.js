import Post from '../../models/Post.js';

export async function editPost(request, reply) {
  const userId = request.user.id;
  const { id } = request.params;
  const { caption } = request.body;

  if (!caption || !caption.trim()) {
    return reply.status(400).send({ success: false, message: 'Caption tidak boleh kosong.' });
  }

  const post = await Post.findOne({ _id: id, is_deleted: false });

  if (!post) {
    return reply.status(404).send({ success: false, message: 'Postingan tidak ditemukan.' });
  }

  // Hanya pemilik yang boleh edit
  if (post.author_id.toString() !== userId) {
    return reply.status(403).send({ success: false, message: 'Kamu tidak punya akses untuk mengedit postingan ini.' });
  }

  post.caption = caption.trim();
  post.is_edited = true;
  await post.save();

  return reply.send({
    success: true,
    message: 'Postingan berhasil diperbarui.',
    data: { post },
  });
}
