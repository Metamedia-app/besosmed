import Post from '../../models/Post.js';
import Like from '../../models/Like.js';

/**
 * GET /api/v1/users/:id/reposts
 * Mengambil SECARA EKSKLUSIF daftar repost milik user tertentu.
 * Digunakan untuk ditampilkan di Tab "Reposts" (Profile).
 */
export async function getUserReposts(request, reply) {
  const meId = request.user.id;
  const { id: targetId } = request.params;
  const limit = Math.min(parseInt(request.query.limit) || 10, 30);
  const before = request.query.before;

  try {
    const filter = {
      author_id: targetId,
      type: 'repost', // HANYA REPOST
      is_deleted: false
    };

    if (before) {
      filter.createdAt = { $lt: new Date(before) };
    }

    // 1. Eksekusi kueri
    const posts = await Post.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate('author_id', 'nim nama avatar_url program_studi')
      .populate({
        path: 'original_post_id',
        select: 'caption media author_id createdAt likes_count comments_count reposts_count shares_count type is_deleted',
        populate: { path: 'author_id', select: 'nim nama avatar_url program_studi' },
      })
      .lean();

    // 2. Filter data: Jangan tampilkan repost jika postingan aslinya sudah ditarik/dihapus
    const validPosts = posts.filter(p => p.original_post_id != null && p.original_post_id.is_deleted === false);

    // 3. Cek status is_liked & is_reposted oleh user yang sedang melihat profil ini
    // Kita cek interaksi berdasarkan ID postingan aslinya (karena interaksi itu nyambungnya ke post asli)
    const originalPostIds = validPosts.map((p) => p.original_post_id._id);

    const [userLikes, userReposts] = await Promise.all([
      Like.find({ user_id: meId, post_id: { $in: originalPostIds } }).lean(),
      Post.find({ 
        author_id: meId, 
        original_post_id: { $in: originalPostIds },
        type: 'repost',
        is_deleted: false
      }).select('original_post_id').lean()
    ]);

    const likedSet = new Set(userLikes.map((l) => l.post_id.toString()));
    const repostedSet = new Set(userReposts.map((r) => r.original_post_id.toString()));

    // 4. Format data untuk Frontend
    const formatted = validPosts.map((p) => ({
      ...p,
      author: p.author_id,
      author_id: undefined,
      is_liked: likedSet.has(p.original_post_id._id.toString()),
      is_reposted: repostedSet.has(p.original_post_id._id.toString()),
    }));

    // Tetap menggunakan cursor dari posts mentah agar pagination tidak patah
    const nextCursor = posts.length === limit ? posts[posts.length - 1].createdAt.toISOString() : null;

    return reply.send({
      success: true,
      data: {
        posts: formatted,
        next_cursor: nextCursor,
        has_more: !!nextCursor,
        count: formatted.length
      },
    });
  } catch (error) {
    request.log.error(error);
    return reply.status(500).send({
      success: false,
      message: 'Terjadi kesalahan saat mengambil daftar repost user.'
    });
  }
}
