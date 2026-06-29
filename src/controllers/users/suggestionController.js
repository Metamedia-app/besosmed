import User from '../../models/User.js';
import Follow from '../../models/Follow.js';
import mongoose from 'mongoose';

/**
 * Controller API untuk mendapatkan saran pertemanan
 * Method: GET
 * Route : /api/v1/users/suggestions
 */
export const getSuggestions = async (request, reply) => {
  try {
    const currentUserId = request.user.id || request.user._id;
    const limit = parseInt(request.query.limit, 10) || 10;

    // 1. Ambil data user login (terutama program_studi)
    const currentUser = await User.findById(currentUserId).select('program_studi');
    if (!currentUser) {
      return reply.code(404).send({ success: false, message: 'User tidak ditemukan' });
    }

    const { program_studi } = currentUser;

    // 2. Ambil daftar user_id yang SUDAH di-follow
    const followingRecords = await Follow.find({ follower_id: currentUserId }).select('following_id');
    const followedUserIds = followingRecords.map(f => f.following_id);

    // List pengecualian (diri sendiri + yang sudah di follow)
    const excludeIds = [
      new mongoose.Types.ObjectId(currentUserId),
      ...followedUserIds.map(id => new mongoose.Types.ObjectId(id))
    ];

    const projectFields = {
      _id: 1,
      nama: 1,
      nim: 1,
      avatar_url: 1,
      program_studi: 1,
      role: 1
    };

    let suggestions = [];

    // 3. PRIORITAS 1: Satu Program Studi (Limit bisa sampai full limit)
    if (program_studi) {
      const matchSameMajor = {
        _id: { $nin: excludeIds },
        program_studi: program_studi,
        is_banned: { $ne: true }
      };

      suggestions = await User.aggregate([
        { $match: matchSameMajor },
        { $sample: { size: limit } }, // Ambil random sesuai limit
        { $project: projectFields }
      ]);
    }

    // 4. PRIORITAS 2: Tambahan Random (Prodi Bebas) jika limit belum terpenuhi
    const remainingLimit = limit - suggestions.length;
    if (remainingLimit > 0) {
      // Kecualikan juga yang sudah tersaring di prioritas 1 agar tidak duplikat
      const excludeIdsWithPriority1 = [
        ...excludeIds,
        ...suggestions.map(s => new mongoose.Types.ObjectId(s._id))
      ];

      const matchOther = {
        _id: { $nin: excludeIdsWithPriority1 },
        is_banned: { $ne: true }
      };

      if (program_studi) {
        matchOther.program_studi = { $ne: program_studi };
      }

      const otherSuggestions = await User.aggregate([
        { $match: matchOther },
        { $sample: { size: remainingLimit } }, // Ambil sisa limitnya secara acak
        { $project: projectFields }
      ]);

      suggestions = [...suggestions, ...otherSuggestions];
    }

    return reply.code(200).send({
      success: true,
      data: suggestions
    });

  } catch (error) {
    request.log.error(error);
    return reply.code(500).send({ success: false, message: 'Terjadi kesalahan saat mengambil saran pertemanan' });
  }
};
