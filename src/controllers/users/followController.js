import mongoose from 'mongoose';
import User from '../../models/User.js';
import Follow from '../../models/Follow.js';
import Notification from '../../models/Notification.js';
import { emitNotification } from '../../services/wsService.js';

/**
 * POST /users/:id/follow
 * Mengikuti user lain
 */
export async function followUser(request, reply) {
  const followerId = request.user.id;
  const { id: followingId } = request.params;

  // 1. Validasi: Tidak bisa follow diri sendiri
  if (followerId === followingId) {
    return reply.status(400).send({ success: false, message: 'Kamu tidak bisa mengikuti diri sendiri.' });
  }

  // 2. Validasi: Target user harus ada
  const targetUser = await User.findById(followingId);
  if (!targetUser) {
    return reply.status(404).send({ success: false, message: 'User yang ingin diikuti tidak ditemukan.' });
  }

  try {
    // 3. Simpan data follow
    await Follow.create({ follower_id: followerId, following_id: followingId });

    // 4. Update counts (denormalisasi)
    // Tambah following_count untuk si pengikut
    await User.findByIdAndUpdate(followerId, { $inc: { following_count: 1 } });
    // Tambah followers_count untuk si target
    await User.findByIdAndUpdate(followingId, { $inc: { followers_count: 1 } });

    // 5. NOTIFIKASI REAL-TIME
    const notif = await Notification.create({
      recipient_id: followingId,
      sender_id: followerId,
      type: 'follow',
    });

    emitNotification(followingId, {
      id: notif._id,
      type: 'follow',
      sender_id: followerId,
      message: `${request.user.nama} mulai mengikuti kamu.`,
      created_at: notif.createdAt,
    });

    return reply.status(200).send({
      success: true,
      message: `Berhasil mengikuti ${targetUser.nama}.`,
    });
    
  } catch (error) {
    // Jika error karena index unik (sudah follow)
    if (error.code === 11000) {
      return reply.status(400).send({ success: false, message: 'Kamu sudah mengikuti user ini.' });
    }
    throw error;
  }
}

/**
 * POST /users/:id/unfollow
 * Berhenti mengikuti user lain
 */
export async function unfollowUser(request, reply) {
  const followerId = request.user.id;
  const { id: followingId } = request.params;

  const result = await Follow.findOneAndDelete({ follower_id: followerId, following_id: followingId });

  if (!result) {
    return reply.status(400).send({ success: false, message: 'Kamu memang tidak mengikuti user ini.' });
  }

  // Update counts (denormalisasi)
  await User.findByIdAndUpdate(followerId, { $inc: { following_count: -1 } });
  await User.findByIdAndUpdate(followingId, { $inc: { followers_count: -1 } });

  return reply.status(200).send({
    success: true,
    message: 'Berhasil berhenti mengikuti.',
  });
}

/**
 * GET /users/:id/followers
 * Melihat daftar siapa saja yang mengikuti user ini
 */
export async function getFollowers(request, reply) {
  const { id: userId } = request.params;
  const { limit = 20, skip = 0 } = request.query;

  const followers = await Follow.find({ following_id: userId })
    .sort({ createdAt: -1 })
    .skip(parseInt(skip))
    .limit(parseInt(limit))
    .populate('follower_id', 'nim nama avatar_url program_studi')
    .lean();

  const formatted = followers.map(f => ({
    ...f.follower_id,
    follow_date: f.createdAt
  }));

  return reply.send({
    success: true,
    data: { followers: formatted }
  });
}

/**
 * GET /users/:id/following
 * Melihat daftar siapa saja yang diikuti oleh user ini
 */
export async function getFollowing(request, reply) {
  const { id: userId } = request.params;
  const { limit = 20, skip = 0 } = request.query;

  const following = await Follow.find({ follower_id: userId })
    .sort({ createdAt: -1 })
    .skip(parseInt(skip))
    .limit(parseInt(limit))
    .populate('following_id', 'nim nama avatar_url program_studi')
    .lean();

  const formatted = following.map(f => ({
    ...f.following_id,
    follow_date: f.createdAt
  }));

  return reply.send({
    success: true,
    data: { following: formatted }
  });
}
