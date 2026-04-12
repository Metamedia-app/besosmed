import Post from '../../models/Post.js';
import Like from '../../models/Like.js';

/**
 * Get feed — postingan terbaru dengan cursor-based pagination
 * Query params: ?limit=10&before=<post_id atau timestamp>
 */
export async function getFeed(request, reply) {
  const userId = request.user.id;
  const limit = Math.min(parseInt(request.query.limit) || 10, 30);
  const before = request.query.before; // ISO date atau ObjectId

  const filter = { is_deleted: false };
  if (before) {
    filter.createdAt = { $lt: new Date(before) };
  }

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

  // Cek apakah user sudah like masing-masing post
  const postIds = posts.map((p) => p._id);
  const userLikes = await Like.find({ user_id: userId, post_id: { $in: postIds } }).lean();
  const likedSet = new Set(userLikes.map((l) => l.post_id.toString()));

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
    },
  });
}
