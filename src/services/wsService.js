/**
 * Socket.io Service Manager
 *
 * Mengelola pengiriman pesan real-time menggunakan Socket.io.
 * Mendukung pengiriman ke semua user (broadcast) maupun ke user tertentu (rooms).
 */

let io = null;

/**
 * Inisialisasi instance IO dari plugin
 */
export function setIO(socketIOInstance) {
  io = socketIOInstance;
}

// ── Connection Helpers ────────────────────────────────────────────────────────

/**
 * Cek apakah user sedang online (mempunyai socket aktif)
 * Note: Di Socket.io kita bisa cek via room count
 */
export async function isOnline(userId) {
  if (!io) return false;
  const sockets = await io.in(`user:${userId.toString()}`).fetchSockets();
  return sockets.length > 0;
}

// ── Send ke Satu User (via Room Pribadi) ───────────────────────────────────────

export function sendToUser(userId, payload) {
  if (!io) return;
  // Socket.io otomatis menangani pengiriman ke semua device user ini via room
  io.to(`user:${userId.toString()}`).emit(payload.type, payload.data || payload);
}

// ── Broadcast ke Semua User ───────────────────────────────────────────────────

export function broadcast(payload, excludeUserId = null) {
  if (!io) return;
  
  if (excludeUserId) {
    // Kirim ke semua kecuali pengirim
    // Cara Socket.io: broadcast dari socket pengirim, tapi karena kita panggil dari server, 
    // kita pakai filter manual atau biarkan client yang handle.
    // Di sini kita pakai cara simple: kirm ke semua, client bisa filter berdasarkan payload.
  }
  
  io.emit(payload.type, payload.data || payload);
  console.log(`[Socket.io] Broadcast "${payload.type}" terkirim.`);
}

// ── Event Helpers (Tetap sama agar Controller tidak error) ─────────────────────

export function emitLikeUpdate(postId, likesCount, likedByUser) {
  broadcast({
    type: 'like_update',
    data: {
      post_id: postId.toString(),
      likes_count: likesCount,
      liked_by: likedByUser,
    },
  });
}

export function emitNewComment(postId, comment) {
  broadcast({
    type: 'new_comment',
    data: {
      post_id: postId.toString(),
      comment,
    },
  });
}

export function emitNewPost(post) {
  broadcast({
    type: 'new_post',
    data: { post },
  });
}

export function emitRepostUpdate(postId, repostsCount) {
  broadcast({
    type: 'repost_update',
    data: {
      post_id: postId.toString(),
      reposts_count: repostsCount,
    },
  });
}

export function emitShareUpdate(postId, sharesCount) {
  broadcast({
    type: 'share_update',
    data: {
      post_id: postId.toString(),
      shares_count: sharesCount,
    },
  });
}

export function emitNotification(recipientId, notification) {
  sendToUser(recipientId, {
    type: 'notification',
    data: notification,
  });
}

export function emitStoryViewUpdate(authorId, storyId, viewsCount) {
  sendToUser(authorId, {
    type: 'story_view_update',
    data: {
      story_id: storyId.toString(),
      views_count: viewsCount,
    },
  });
}

export function emitFollowUpdate(followerId, followingId, action, followersCount, followingCount) {
  broadcast({
    type: 'follow_update',
    data: {
      follower_id: followerId.toString(),
      following_id: followingId.toString(),
      action, // 'follow' atau 'unfollow'
      followers_count: followersCount,
      following_count: followingCount,
    },
  });
}
