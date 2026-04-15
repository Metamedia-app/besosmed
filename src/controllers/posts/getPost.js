import Post from '../../models/Post.js';
import Like from '../../models/Like.js';

export async function getPost(request, reply) {
  const userId = request.user.id;
  const { id } = request.params;

  const post = await Post.findOne({ _id: id, is_deleted: false })
    .populate('author_id', 'nim nama avatar_url program_studi')
    .populate({
      path: 'original_post_id',
      select: 'caption media author_id createdAt',
      populate: { path: 'author_id', select: 'nim nama avatar_url' },
    })
    .lean();

  if (!post) {
    return reply.status(404).send({ success: false, message: 'Postingan tidak ditemukan.' });
  }

  const [liked, reposted] = await Promise.all([
    Like.exists({ user_id: userId, post_id: id }),
    Post.exists({ author_id: userId, original_post_id: id, type: 'repost', is_deleted: false })
  ]);

  return reply.send({
    success: true,
    data: {
      post: {
        ...post,
        author: post.author_id,
        author_id: undefined,
        is_liked: !!liked,
        is_reposted: !!reposted,
      },
    },
  });
}
