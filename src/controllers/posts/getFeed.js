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
  const before = request.query.before;

  // --- REDIS CACHE ---
  // Halaman pertama: cache 5 detik (cukup fresh untuk randomisasi, ringan ke MongoDB)
  // Halaman lanjutan (cursor): cache 60 detik (hemat resource infinite scroll)
  const cacheKey = `feed:${userId}:${limit}:${before || 'first'}`;
  const cacheTTL = before ? 60 : 5;
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
  
  if (before) {
    filter.createdAt = { $lt: new Date(before) };
  }

  // 3. Eksekusi kueri
  const poolLimit = before ? limit : limit * 3; // Pool kandidat lebih besar saat reload/first-page
  
  let posts = await Post.find(filter)
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
  // Setiap postingan punya PELUANG NYATA muncul di posisi manapun,
  // namun postingan dengan skor tinggi tetap punya probabilitas lebih besar.
  // Rumus: sort_key = random ^ (1 / weight) — semakin besar weight, nilai sort_key
  // cenderung mendekati 1, sehingga postingan berbobot tinggi lebih sering "menang",
  // tapi tidak SELALU menang. Ini yang membuat feed terasa hidup setiap reload.
  if (!before && posts.length > 0) {
    posts.forEach((p) => {
      const ageInMinutes = (Date.now() - new Date(p.createdAt).getTime()) / (1000 * 60);
      
      // A. Recency Score
      const recencyScore = Math.max(0, 100 - (ageInMinutes / 30));
      
      // B. Engagement Score dengan Redaman Logaritmik
      const rawEngagement = ((p.likes_count || 0) * 10) + ((p.comments_count || 0) * 5) + ((p.reposts_count || 0) * 8);
      const engagementScore = Math.log1p(rawEngagement) * 20;
      
      // C. Weighted Random Shuffle Key (Efraimidis-Spirakis)
      // weight minimal 0.1 agar tidak ada pembagian dengan 0
      const weight = Math.max(0.1, recencyScore + engagementScore);
      p.sapws_score = weight; // Simpan skor asli untuk referensi
      p._sort_key = Math.random() ** (1 / weight); // Kunci shuffle acak berbobot
    });

    // Urutkan berdasarkan sort_key tertinggi (acak berbobot)
    posts.sort((a, b) => b._sort_key - a._sort_key);
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

  const nextCursor = posts.length === limit ? posts[posts.length - 1].createdAt.toISOString() : null;

  const responseData = {
    success: true,
    data: {
      posts: formatted,
      next_cursor: nextCursor,
      has_more: !!nextCursor,
      count: posts.length
    },
  };

  // --- REDIS CACHE: Simpan hasil dengan TTL sesuai jenis halaman ---
  if (request.server.redis) {
    try {
      await request.server.redis.set(cacheKey, JSON.stringify(responseData), 'EX', cacheTTL);
    } catch (err) {
      request.log.warn(`Redis SET Error: ${err.message}`);
    }
  }
  // ----------------------------------------------------

  return reply.send(responseData);
}
