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

  // --- REDIS CACHE: Cek laci penyimpanan (Cache Hit) ---
  const cacheKey = `feed:${userId}:${limit}:${before || 'latest'}`;
  if (request.server.redis) {
    try {
      const cached = await request.server.redis.get(cacheKey);
      if (cached) {
        return reply.send(JSON.parse(cached));
      }
    } catch (err) {
      request.log.warn(`Redis GET Error: ${err.message}`);
      // Lanjut ke MongoDB jika Redis gagal (Fail-safe)
    }
  }
  // ----------------------------------------------------


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

  // --- ALGORITMA SAPWS (Social Affinity & Popularity Weighted Shuffling) ---
  // Terapkan rekomendasi acak berbobot hanya saat reload/halaman pertama
  if (!before && posts.length > 0) {
    posts.forEach((p) => {
      const ageInMinutes = (Date.now() - new Date(p.createdAt).getTime()) / (1000 * 60);
      
      // A. Recency Score: Post baru dapat poin tinggi (menyusut 1 poin tiap 30 menit)
      const recencyScore = Math.max(0, 100 - (ageInMinutes / 30));
      
      // B. Engagement Score: Konten populer didongkrak (Like x10, Komen x5, Repost x8)
      const engagementScore = ((p.likes_count || 0) * 10) + ((p.comments_count || 0) * 5) + ((p.reposts_count || 0) * 8);
      
      // C. Random Noise: Nilai acak dinamis agar setiap reload terasa fresh (0 - 40 poin)
      const randomNoise = Math.random() * 40;
      
      p.sapws_score = recencyScore + engagementScore + randomNoise;
    });

    // Urutkan berdasarkan total skor SAPWS tertinggi
    posts.sort((a, b) => b.sapws_score - a.sapws_score);
    // Potong sesuai limit yang diminta
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

  // --- REDIS CACHE: Simpan ke laci (Cache Miss -> Set) ---
  if (request.server.redis) {
    try {
      // Simpan dengan Time-To-Live (TTL) 60 detik
      await request.server.redis.set(cacheKey, JSON.stringify(responseData), 'EX', 60);
    } catch (err) {
      request.log.warn(`Redis SET Error: ${err.message}`);
    }
  }
  // ----------------------------------------------------

  return reply.send(responseData);
}
