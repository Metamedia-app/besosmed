/**
 * WebSocket Connection Manager
 *
 * Menyimpan semua koneksi aktif dalam Map:
 *   connections: Map<userId (string) → WebSocket>
 *
 * Upgrade ke Redis Pub/Sub nanti kalau scale multi-server.
 */

const connections = new Map(); // userId -> ws

// ── Connection Management ─────────────────────────────────────────────────────

export function addConnection(userId, ws) {
  connections.set(userId.toString(), ws);
}

export function removeConnection(userId) {
  connections.delete(userId.toString());
}

export function getConnection(userId) {
  return connections.get(userId.toString());
}

export function isOnline(userId) {
  return connections.has(userId.toString());
}

// ── Send ke Satu User ─────────────────────────────────────────────────────────

export function sendToUser(userId, payload) {
  const ws = connections.get(userId.toString());
  if (ws && ws.readyState === 1) { // 1 = OPEN
    try {
      ws.send(JSON.stringify(payload));
    } catch (err) {
      console.error(`[WS] Gagal kirim ke user ${userId}:`, err.message);
      removeConnection(userId); // Hapus koneksi yang bermasalah
    }
  }
}

// ── Broadcast ke Semua User (kecuali excludeUserId) ──────────────────────────

export function broadcast(payload, excludeUserId = null) {
  const data = JSON.stringify(payload);
  connections.forEach((ws, userId) => {
    if (excludeUserId && userId === excludeUserId.toString()) return;
    if (ws.readyState === 1) {
      try {
        ws.send(data);
      } catch (err) {
        console.error(`[WS] Gagal broadcast ke user ${userId}:`, err.message);
        removeConnection(userId);
      }
    }
  });
}

// ── Event Helpers (format pesan yang konsisten) ───────────────────────────────

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

export function emitNotification(recipientId, notification) {
  sendToUser(recipientId, {
    type: 'notification',
    data: notification,
  });
}

export function getOnlineCount() {
  return connections.size;
}
