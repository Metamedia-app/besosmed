import User from '../../models/User.js';

/**
 * GET /api/v1/users/search
 * Mencari user berdasarkan Nama, NIM, atau Program Studi
 */
export async function searchUsers(request, reply) {
  const { q, limit = 20, skip = 0 } = request.query;

  if (!q || q.trim().length === 0) {
    return reply.send({
      success: true,
      data: { users: [], total: 0 }
    });
  }

  const query = q.trim();
  const searchRegex = new RegExp(query, 'i'); // 'i' for case-insensitive

  const filter = {
    $or: [
      { nama: { $regex: searchRegex } },
      { nim: { $regex: searchRegex } },
      { program_studi: { $regex: searchRegex } }
    ]
  };

  try {
    const [users, total] = await Promise.all([
      User.find(filter)
        .select('nama nim avatar_url program_studi bio followers_count')
        .sort({ nama: 1 })
        .skip(parseInt(skip))
        .limit(parseInt(limit))
        .lean(),
      User.countDocuments(filter)
    ]);

    return reply.send({
      success: true,
      data: {
        users,
        total,
        has_more: parseInt(skip) + users.length < total
      }
    });
  } catch (error) {
    request.log.error(error);
    return reply.status(500).send({
      success: false,
      message: 'Terjadi kesalahan saat mencari user.'
    });
  }
}
