import mongoose from 'mongoose';
import User from '../../models/User.js';
import Follow from '../../models/Follow.js';
import Notification from '../../models/Notification.js';
import { countTotalUnreadItems, triggerPushNotification } from '../../services/notificationService.js';
import { emitNotification, emitFollowUpdate } from '../../services/wsService.js';

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

  // 2. Validasi: Target user harus adaa
  const targetUser = await User.findById(followingId);
  if (!targetUser) {
    return reply.status(404).send({ success: false, message: 'User yang ingin diikuti tidak ditemukan.' });
  }

  try {
    // 3. Simpan data follow
    await Follow.create({ follower_id: followerId, following_id: followingId });

    // 4. Update counts (denormalisasi) dan ambil data terbaru
    const followerStatus = await User.findByIdAndUpdate(followerId, { $inc: { following_count: 1 } }, { new: true });
    const targetStatus = await User.findByIdAndUpdate(followingId, { $inc: { followers_count: 1 } }, { new: true });

    // 5. BROADCAST DATA REAL-TIME (Untuk update angka di profil)
    emitFollowUpdate(followerId, followingId, 'follow', targetStatus.followers_count, followerStatus.following_count);

    // 6. NOTIFIKASI ATAU UPDATE NOTIFIKASI REAL-TIME
    const existingNotif = await Notification.findOneAndUpdate(
      {
        recipient_id: followingId,
        type: 'follow',
        is_read: false
      },
      {
        $set: { sender_id: followerId },
        $inc: { others_count: 1 },
        $push: { 
          grouped_items: {
            $each: [{
              user_id: followerId,
              nama: request.user.nama,
              avatar_url: request.user.avatar_url,
              at: new Date()
            }],
            $slice: -5
          }
        }
      },
      { new: true }
    );

    let notif;
    if (!existingNotif) {
      notif = await Notification.create({
        recipient_id: followingId,
        sender_id: followerId,
        type: 'follow',
        grouped_items: [{
          user_id: followerId,
          nama: request.user.nama,
          avatar_url: request.user.avatar_url,
          at: new Date()
        }]
      });
    } else {
      notif = existingNotif;
    }

    // Format pesan
    const count = notif.others_count || 0;
    const message = count > 0 
      ? `${request.user.nama} dan ${count} lainnya mulai mengikuti kamu.`
      : `${request.user.nama} mulai mengikuti kamu.`;

    // Hitung total unread untuk recipient (Realtime Badge)
    const unreadCount = await countTotalUnreadItems(followingId);

    emitNotification(followingId, {
      id: notif._id,
      type: 'follow',
      sender_id: followerId,
      message,
      unread_count: unreadCount, // Kirim angka badge terbaru
      created_at: notif.createdAt,
      updatedAt: notif.updatedAt,
    });

    // --- KIRIM PUSH NOTIFICATION (FCM) ---
    triggerPushNotification(followingId, {
      title: 'Notifikasi',
      body: message,
      data: {
        type: 'follow',
        sender_id: followerId.toString()
      }
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
  const follower = await User.findByIdAndUpdate(followerId, { $inc: { following_count: -1 } }, { new: true });
  const target = await User.findByIdAndUpdate(followingId, { $inc: { followers_count: -1 } }, { new: true });

  // BROADCAST DATA REAL-TIME
  emitFollowUpdate(followerId, followingId, 'unfollow', target.followers_count, follower.following_count);

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
