import Post from '../../models/Post.js';
import Like from '../../models/Like.js';

/**
 * GET /api/v1/users/:id/posts
 * Mengambil semua postingan (Original + Repost) milik user tertentu
 */
export async function getUserPosts(request, reply) {
  const meId = request.user.id;
  const { id: targetId } = request.params;
  const limit = Math.min(parseInt(request.query.limit) || 10, 30);
  const before = request.query.before;

  try {
    const filter = {
      author_id: targetId,
      is_deleted: false
    };

    if (before) {
      filter.createdAt = { $lt: new Date(before) };
    }

    // Eksekusi kueri dengan Deep Populate untuk Repost
    const posts = await Post.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate('author_id', 'nim nama avatar_url program_studi')
      .populate({
        path: 'original_post_id',
        select: 'caption media author_id createdAt',
        populate: { path: 'author_id', select: 'nim nama avatar_url' },
      })
      .lean();

    // Cek status like
    const postIds = posts.map((p) => p._id);
    const userLikes = await Like.find({ user_id: meId, post_id: { $in: postIds } }).lean();
    const likedSet = new Set(userLikes.map((l) => l.post_id.toString()));

    // Format data untuk Frontend
    const formatted = posts.map((p) => ({
      ...p,
      author: p.author_id,
      author_id: undefined,
      is_liked: likedSet.has(p._id.toString()),
    }));

    const nextCursor = posts.length === limit ? posts[posts.length - 1].createdAt.toISOString() : null;

    return reply.send({
      success: true,
      data: {
        posts: formatted,
        next_cursor: nextCursor,
        has_more: !!nextCursor,
        count: posts.length
      },
    });
  } catch (error) {
    request.log.error(error);
    return reply.status(500).send({
      success: false,
      message: 'Terjadi kesalahan saat mengambil postingan user.'
    });
  }
}
