import User from '../../models/User.js';
import Post from '../../models/Post.js';
import mongoose from 'mongoose';

/**
 * Mencari User (Semua status: aktif/banned)
 */
export async function searchUsersAdmin(request, reply) {
  const { q, limit = 20, skip = 0 } = request.query;

  const filter = {};
  if (q && q.trim().length > 0) {
    const searchRegex = new RegExp(q.trim(), 'i');
    filter.$or = [
      { nama: { $regex: searchRegex } },
      { nim: { $regex: searchRegex } },
      { program_studi: { $regex: searchRegex } }
    ];
  }

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
    return reply.status(500).send({ success: false, message: 'Gagal mengambil data user.' });
  }
}

/**
 * Mencari Postingan (Pencarian Multi-Kriteria: ID, Caption, Nama Author)
 */
export async function searchPostsAdmin(request, reply) {
  const { q, limit = 20, skip = 0 } = request.query;

  let filter = {};

  if (q && q.trim().length > 0) {
    const queryStr = q.trim();
    const searchRegex = new RegExp(queryStr, 'i');

    // 1. Cek apakah Query adalah ID MongoDB yang valid
    const isObjectId = mongoose.Types.ObjectId.isValid(queryStr);

    // 2. Cari User ID berdasarkan Nama (untuk pencarian by author name)
    const matchingUsers = await User.find({ nama: { $regex: searchRegex } }).select('_id').lean();
    const userIds = matchingUsers.map(u => u._id);

    filter = {
      $or: [
        { caption: { $regex: searchRegex } },
        { author_id: { $in: userIds } }
      ]
    };

    // Jika query adalah ID, tambahkan ke filter $or
    if (isObjectId) {
      filter.$or.push({ _id: queryStr });
    }
  }

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
    request.log.error(error);
    return reply.status(500).send({ success: false, message: 'Gagal mengambil data postingan.' });
  }
}
