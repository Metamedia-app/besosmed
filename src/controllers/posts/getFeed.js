import Post from '../../models/Post.js';
import Like from '../../models/Like.js';
import Follow from '../../models/Follow.js';

/**
 * Get feed — Algoritma campuran (Following + Discovery)
 * Menampilkan postingan dari orang yang diikuti, diri sendiri,
 * dan sesekali postingan populer dari orang asing agar Home tidak sepi.
 *
 * FIX: Infinite scroll tanpa batas — tidak ada limit pool 100,
 *      has_more akurat, tidak ada duplikat.
 */
export async function getFeed(request, reply) {
  const userId = request.user.id;
  const limit = Math.min(parseInt(request.query.limit) || 10, 30);

  // Dukung parameter 'page' dari Frontend
  const page = parseInt(request.query.page) || 1;
  const before = request.query.before || ''; // fallback cursor lama

  // --- REDIS CACHE UNTUK FULL RESPONSE (OPSIONAL) ---
  // Pastikan parameter before ikut jadi key agar tidak tabrakan dengan cache page 1
  const cacheKey = `feed_html:${userId}:${limit}:${page}:${before}`;
  if (request.server.redis) {
    try {
      const cached = await request.server.redis.get(cacheKey);
      if (cached) {
        return reply.send(JSON.parse(cached));
      }
    } catch (err) {
      request.log.warn(`[Feed] Redis GET Error: ${err.message}`);
    }
  }
  // -------------------------------------------------------------------

  // Kunci session antrean feed di Redis (per-user, reset tiap page=1)
  const sessionKey = `feed_session:${userId}`;

  // 1. Ambil daftar user yang diikuti (following)
  const follows = await Follow.find({ follower_id: userId }).select('following_id').lean();
  const followingIds = follows.map(f => f.following_id);

  // 2. Filter criteria — Discovery TANPA syarat likes (sudah dihapus)
  const filter = {
    is_deleted: { $ne: true },  // Lebih aman dari "is_deleted: false" saat dikombinasikan $or
    $or: [
      { author_id: { $in: followingIds } }, // Teman
      { author_id: userId },                // Diri Sendiri
      { visibility: 'public' }              // Discovery: semua postingan publik
    ]
  };

  // Fallback cursor lama 'before' (kompatibilitas mundur)
  if (before && !request.query.page) {
    filter.createdAt = { $lt: new Date(before) };
  }

  let posts = [];
  let totalSessionCount = 0;

  // ── PAGINASI: Halaman 2, 3, dst ─────────────────────────────────────────
  if (page > 1 && request.server.redis && !before) {
    try {
      const sessionData = await request.server.redis.get(sessionKey);
      if (sessionData) {
        const allIds = JSON.parse(sessionData);
        totalSessionCount = allIds.length;

        const startIndex = (page - 1) * limit;
        const targetIds = allIds.slice(startIndex, startIndex + limit);

        if (targetIds.length > 0) {
          posts = await Post.find({ _id: { $in: targetIds } })
            .populate('author_id', 'nim nama avatar_url program_studi')
            .populate({
              path: 'original_post_id',
              select: 'caption media author_id createdAt',
              populate: { path: 'author_id', select: 'nim nama avatar_url' },
            })
            .lean();

          // Kembalikan urutan sesuai session Redis (karena $in tidak menjamin urutan)
          posts.sort((a, b) => targetIds.indexOf(a._id.toString()) - targetIds.indexOf(b._id.toString()));
        }
      }
    } catch (err) {
      request.log.warn(`[Feed] Redis Session Error: ${err.message}`);
    }
  }

  // ── HALAMAN 1: Generate Session Baru ────────────────────────────────────
  if (posts.length === 0 && (page === 1 || !request.query.page || before)) {
    // FIX: Hanya ambil field-field ringan (tidak ambil full data) untuk proses shuffle
    // Ini yang mencegah server jebol memori saat ada ribuan postingan
    const lightPosts = await Post.find(filter)
      .sort({ createdAt: -1 })
      .select('_id likes_count comments_count reposts_count createdAt')
      .lean();

    if (lightPosts.length > 0 && !before) {
      // ── ALGORITMA SAPWS + Weighted Random Shuffle (Efraimidis-Spirakis) ──
      lightPosts.forEach((p) => {
        const ageInMinutes = (Date.now() - new Date(p.createdAt).getTime()) / (1000 * 60);
        const recencyScore = Math.max(0, 100 - (ageInMinutes / 30));
        const rawEngagement = ((p.likes_count || 0) * 10) + ((p.comments_count || 0) * 5) + ((p.reposts_count || 0) * 8);
        const engagementScore = Math.log1p(rawEngagement) * 20;
        const weight = Math.max(0.1, recencyScore + engagementScore);
        p._sort_key = Math.random() ** (1 / weight);
      });

      lightPosts.sort((a, b) => b._sort_key - a._sort_key);

      // Simpan SELURUH array ID hasil kocokan ke Redis (ringan: cuma string ID)
      const sessionIds = lightPosts.map(p => p._id.toString());
      totalSessionCount = sessionIds.length;

      if (request.server.redis) {
        try {
          // Session berlaku 10 menit per login scroll
          await request.server.redis.set(sessionKey, JSON.stringify(sessionIds), 'EX', 600);
        } catch (e) {
          request.log.warn(`[Feed] Redis SET Session Error: ${e.message}`);
        }
      }

      // Ambil FULL data hanya untuk `limit` pertama dari hasil kocokan
      const firstPageIds = sessionIds.slice(0, limit);
      if (firstPageIds.length > 0) {
        posts = await Post.find({ _id: { $in: firstPageIds } })
          .populate('author_id', 'nim nama avatar_url program_studi')
          .populate({
            path: 'original_post_id',
            select: 'caption media author_id createdAt',
            populate: { path: 'author_id', select: 'nim nama avatar_url' },
          })
          .lean();

        // Paksa urutan sesuai sessionIds
        posts.sort((a, b) => firstPageIds.indexOf(a._id.toString()) - firstPageIds.indexOf(b._id.toString()));
      }
    } else if (before) {
      // Fallback cursor lama: ambil dengan limit biasa
      posts = await Post.find(filter)
        .sort({ createdAt: -1 })
        .limit(limit)
        .populate('author_id', 'nim nama avatar_url program_studi')
        .populate({
          path: 'original_post_id',
          select: 'caption media author_id createdAt',
          populate: { path: 'author_id', select: 'nim nama avatar_url' },
        })
        .lean();
      totalSessionCount = posts.length; // fallback tidak pakai session
    }
  }
  // ──────────────────────────────────────────────────────────────────────────

  // 3. Cek status like & repost untuk masing-masing post
  const postIds = posts.map((p) => p._id);
  const [userLikes, userReposts] = await Promise.all([
    Like.find({ user_id: userId, post_id: { $in: postIds } }).lean(),
    Post.find({
      author_id: userId,
      original_post_id: { $in: postIds },
      type: 'repost',
      is_deleted: false
    }).select('original_post_id').lean()
  ]);

  const likedSet = new Set(userLikes.map((l) => l.post_id.toString()));
  const repostedSet = new Set(userReposts.map((r) => r.original_post_id.toString()));

  // 4. Format data untuk Frontend
  const formatted = posts.map((p) => ({
    ...p,
    author: p.author_id,
    author_id: undefined,
    is_liked: likedSet.has(p._id.toString()),
    is_reposted: repostedSet.has(p._id.toString()),
    is_discovery: !followingIds.some(fid => fid.toString() === (p.author_id?._id?.toString() || p.author_id?.toString())) && (p.author_id?._id?.toString() || p.author_id?.toString()) !== userId
  }));

  // 5. Hitung has_more dan cursor (FIX: sekarang berbasis total session, bukan limit)
  const startIndexForPage = (page - 1) * limit;
  const hasMore = before
    ? posts.length === limit
    : (startIndexForPage + posts.length) < totalSessionCount;

  const nextCursor = posts.length > 0 ? posts[posts.length - 1].createdAt?.toISOString() : null;

  const responseData = {
    success: true,
    data: {
      posts: formatted,
      next_cursor: nextCursor,     // Tetap dikembalikan untuk kompatibilitas mundur
      current_page: page,
      has_more: hasMore,
      count: posts.length
    },
  };

  // --- REDIS CACHE: Simpan response HTML throttle ---
  if (request.server.redis) {
    try {
      // Page 1 throttle 5 detik biar fresh, sisanya 60 detik biar irit
      const cacheTTL = page === 1 ? 5 : 60;
      await request.server.redis.set(cacheKey, JSON.stringify(responseData), 'EX', cacheTTL);
    } catch (err) {
      request.log.warn(`[Feed] Redis SET Error: ${err.message}`);
    }
  }
  // ----------------------------------------------------

  return reply.send(responseData);
}
