import User from '../../models/User.js';
import Post from '../../models/Post.js';

/**
 * Mencari User (Semua status: aktif/banned)
 */
export async function searchUsersAdmin(request, reply) {
  const { q, limit = 20, skip = 0 } = request.query;

  if (!q) {
    return reply.send({ success: true, data: { users: [], total: 0 } });
  }

  const searchRegex = new RegExp(q, 'i');
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
        .sort({ createdAt: -1 })
        .skip(parseInt(skip))
        .limit(parseInt(limit))
        .lean(),
      User.countDocuments(filter)
    ]);

    return reply.send({
      success: true,
      data: { users, total },
    });
  } catch (error) {
    return reply.status(500).send({ success: false, message: 'Gagal mencari user.' });
  }
}

/**
 * Mencari Postingan (Semua status: aktif/takedown)
 */
export async function searchPostsAdmin(request, reply) {
  const { q, limit = 20, skip = 0 } = request.query;

  if (!q) {
    return reply.send({ success: true, data: { posts: [], total: 0 } });
  }

  const searchRegex = new RegExp(q, 'i');
  const filter = { caption: { $regex: searchRegex } };

  try {
    const [posts, total] = await Promise.all([
      Post.find(filter)
        .sort({ createdAt: -1 })
        .skip(parseInt(skip))
        .limit(parseInt(limit))
        .populate('author_id', 'nim nama avatar_url program_studi')
        .lean(),
      Post.countDocuments(filter)
    ]);

    return reply.send({
      success: true,
      data: { posts, total },
    });
  } catch (error) {
    return reply.status(500).send({ success: false, message: 'Gagal mencari postingan.' });
  }
}
