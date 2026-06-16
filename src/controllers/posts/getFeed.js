import Post from '../../models/Post.js';
import Like from '../../models/Like.js';
import Follow from '../../models/Follow.js';

/**
 * Get feed — Algoritma campuran (Following + Discovery)
 * Menampilkan postingan dari orang yang diikuti, diri sendiri, 
 * dan sesekali postingan populer dari orang asing agar Home tidak sepi.
 */
export async function getFeed(request, reply) {
  const userId = request.user.id;
  const limit = Math.min(parseInt(request.query.limit) || 10, 30);
  
  // Dukung parameter 'page' dari Frontend
  const page = parseInt(request.query.page) || 1;
  const before = request.query.before; // masih didukung jika fallback

  // --- REDIS CACHE UNTUK FULL RESPONSE (OPSIONAL) ---
  // Hanya bypass query jika caching halaman ini persis sama (untuk throttle)
  const cacheKey = `feed_html:${userId}:${limit}:${page}`;
  if (request.server.redis) {
    try {
      const cached = await request.server.redis.get(cacheKey);
      if (cached) {
        return reply.send(JSON.parse(cached));
      }
    } catch (err) {
      request.log.warn(`Redis GET Error: ${err.message}`);
    }
  }
  // -------------------------------------------------------------------

  // 1. Ambil daftar user yang diikuti (following)
  const follows = await Follow.find({ follower_id: userId }).select('following_id').lean();
  const followingIds = follows.map(f => f.following_id);

  // 2. Tentukan kriteria filter
  // - Postingan teman & diri sendiri
  // - Postingan global yang "populer" (Discovery) agar Home tidak kosong
  const filter = {
    is_deleted: false,
    $or: [
      { author_id: { $in: followingIds } }, // Teman
      { author_id: userId },                // Diri Sendiri
      { 
        visibility: 'public',               // FYP: Harus disetting publik oleh usernya
        likes_count: { $gte: 2 }            // Discovery: Postingan populer (min 2 likes)
      }
    ]
  };

  // Jika user belum follow siapa pun, porsi discovery otomatis lebih besar
  
  // Jika user pakai cursor lama 'before', kita bisa fallback
  if (before && !request.query.page) {
    filter.createdAt = { $lt: new Date(before) };
  }

  // Kunci session antrean feed di Redis
  const sessionKey = `feed_session:${userId}`;
  let posts = [];
  let totalSessionCount = 0;

  if (page > 1 && request.server.redis && !before) {
    // --- MODE ALUR PAGINASI (Halaman 2, 3, dst) ---
    try {
      const sessionData = await request.server.redis.get(sessionKey);
      if (sessionData) {
        const allIds = JSON.parse(sessionData);
        totalSessionCount = allIds.length;
        
        // Ambil potongan ID sesuai halaman
        const startIndex = (page - 1) * limit;
        const targetIds = allIds.slice(startIndex, startIndex + limit);
        
        if (targetIds.length > 0) {
          // Ambil dari DB berdasarkan ID
          posts = await Post.find({ _id: { $in: targetIds } })
            .populate('author_id', 'nim nama avatar_url program_studi')
            .populate({
              path: 'original_post_id',
              select: 'caption media author_id createdAt',
              populate: { path: 'author_id', select: 'nim nama avatar_url' },
            })
            .lean();
            
          // Karena query $in tidak menjamin urutan, kita urutkan ulang manual sesuai urutan dari array session Redis (hasil SAPWS)
          posts.sort((a, b) => targetIds.indexOf(a._id.toString()) - targetIds.indexOf(b._id.toString()));
        }
      }
    } catch (err) {
      request.log.warn(`Redis Session Error: ${err.message}`);
    }
  }

  // Jika posts kita masih kosong (entah ini page 1 ATAU redis session expired)
  if (posts.length === 0) {
    // --- MODE GENERATE BARU (Halaman 1) ---
    const poolLimit = before ? limit : 100;

    posts = await Post.find(filter)
      .sort({ createdAt: -1 })
      .limit(poolLimit)
      .populate('author_id', 'nim nama avatar_url program_studi')
      .populate({
        path: 'original_post_id',
        select: 'caption media author_id createdAt',
        populate: { path: 'author_id', select: 'nim nama avatar_url' },
      })
      .lean();

    // --- ALGORITMA SAPWS + Weighted Random Shuffle (Efraimidis-Spirakis) ---
    if ((page === 1 || !request.query.page) && !before && posts.length > 0) {
      posts.forEach((p) => {
        const ageInMinutes = (Date.now() - new Date(p.createdAt).getTime()) / (1000 * 60);
        const recencyScore = Math.max(0, 100 - (ageInMinutes / 30));
        const rawEngagement = ((p.likes_count || 0) * 10) + ((p.comments_count || 0) * 5) + ((p.reposts_count || 0) * 8);
        const engagementScore = Math.log1p(rawEngagement) * 20;
        const weight = Math.max(0.1, recencyScore + engagementScore);
        p.sapws_score = weight;
        p._sort_key = Math.random() ** (1 / weight);
      });

      posts.sort((a, b) => b._sort_key - a._sort_key);

      // Simpan urutan ID ke Redis Session selama 10 menit untuk infinite scroll
      const sessionIds = posts.map(p => p._id.toString());
      totalSessionCount = sessionIds.length;
      if (request.server.redis) {
        try {
          await request.server.redis.set(sessionKey, JSON.stringify(sessionIds), 'EX', 600);
        } catch(e) {}
      }
    }

    // Potong sesuai limit untuk response
    posts = posts.slice(0, limit);
  }
  // --------------------------------------------------------------------------

  // 4. Cek status like & repost untuk masing-masing post
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

  // 5. Format data untuk Frontend
  const formatted = posts.map((p) => ({
    ...p,
    author: p.author_id,
    author_id: undefined,
    is_liked: likedSet.has(p._id.toString()),
    is_reposted: repostedSet.has(p._id.toString()),
    // Tandai apakah ini postingan teman atau discovery (optional buat FE)
    is_discovery: !followingIds.includes(p.author?._id?.toString() || p.author_id?.toString()) && p.author_id?.toString() !== userId
  }));

  // Kompatibilitas mundur next_cursor
  const nextCursor = posts.length === limit ? posts[posts.length - 1].createdAt.toISOString() : null;
  
  // Pagination flag 
  // Jika page * limit < total yang ada di session, berarti masih ada more data
  const hasMore = page > 0 ? (page * limit < totalSessionCount) : !!nextCursor;

  const responseData = {
    success: true,
    data: {
      posts: formatted,
      next_cursor: nextCursor, // Tetap dibalikin untuk jaga-jaga
      current_page: page, // Beritahu front end
      has_more: hasMore,
      count: posts.length
    },
  };

  // --- REDIS CACHE: Simpan response HTML throttle ---
  if (request.server.redis) {
    try {
      // Sama seperti kesepakatan: Page 1 throttle 5 detik, sisanya 60 detik
      const cacheTTL = page === 1 ? 5 : 60;
      await request.server.redis.set(cacheKey, JSON.stringify(responseData), 'EX', cacheTTL);
    } catch (err) {
      request.log.warn(`Redis SET Error: ${err.message}`);
    }
  }
  // ----------------------------------------------------

  return reply.send(responseData);
}
