import User from '../../models/User.js';
import Post from '../../models/Post.js';
import Like from '../../models/Like.js';

/**
 * GET /api/v1/admin/dashboard
 * Hanya untuk Admin. Mengembalikan statistik ringkasan & data chart interaksi real-time.
 */
export const getDashboardStats = async (request, reply) => {
  try {
    const { range = '7' } = request.query;
    const days = range === '30' ? 30 : 7;

    // ─── 1. SUMMARY CARDS (paralel agar cepat) ───────────────────────────────
    const [totalUsers, totalPosts, totalLikes, totalReposts] = await Promise.all([
      User.countDocuments(),
      Post.countDocuments({ type: 'original' }),
      Like.countDocuments(),
      Post.countDocuments({ type: 'repost' }),
    ]);

    // ─── 2. CHART DATA (Interaksi per hari) ──────────────────────────────────
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - (days - 1));
    startDate.setHours(0, 0, 0, 0); // Mulai dari awal hari

    // Query aggregate: hitung jumlah post baru per hari dalam rentang waktu
    const rawChartData = await Post.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate },
        },
      },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m-%d', date: '$createdAt' },
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    // Bangun label & data array lengkap sesuai jumlah hari (isi 0 untuk hari yang kosong)
    const chartMap = {};
    rawChartData.forEach(item => {
      chartMap[item._id] = item.count;
    });

    const labels = [];
    const data = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().split('T')[0]; // format: 'YYYY-MM-DD'
      const label = d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }); // '23 Jun'
      labels.push(label);
      data.push(chartMap[key] || 0);
    }

    return reply.code(200).send({
      success: true,
      data: {
        summary: {
          total_users: totalUsers,
          total_posts: totalPosts,
          total_likes: totalLikes,
          total_reposts: totalReposts,
        },
        interaction_chart: {
          range_days: days,
          labels,
          data,
        },
      },
    });

  } catch (error) {
    request.log.error(error);
    return reply.code(500).send({ success: false, message: 'Terjadi kesalahan saat mengambil statistik dashboard' });
  }
};
