import Notification from '../models/Notification.js';
import admin from '../config/firebaseAdmin.js';

/**
 * Menghitung total seluruh aksi (item) dari semua notifikasi yang belum dibaca.
 * @param {string} userId 
 * @returns {Promise<number>}
 */
export async function countTotalUnreadItems(userId) {
  try {
    const result = await Notification.aggregate([
      { 
        $match: { 
          recipient_id: new (await import('mongoose')).default.Types.ObjectId(userId), 
          is_read: false,
          type: { $ne: 'chat' } // Jangan hitung chat dalam badge notifikasi utama
        } 
      },
      { 
        $project: { 
          itemCount: { $size: { $ifNull: ["$grouped_items", []] } } 
        } 
      },
      { 
        $group: { 
          _id: null, 
          total: { $sum: "$itemCount" } 
        } 
      }
    ]);

    return result.length > 0 ? result[0].total : 0;
  } catch (error) {
    console.error('Error counting unread items:', error);
    return 0;
  }
}

/**
 * Mengirim Push Notification via Firebase Cloud Messaging (FCM)
 * @param {string[]} tokens - Array token FCM tujuan
 * @param {object} payload - { title, body, data }
 */
export async function sendPushNotification(tokens, payload) {
  if (!tokens || tokens.length === 0) return;

  const message = {
    notification: {
      title: payload.title,
      body: payload.body,
    },
    data: payload.data || {},
    tokens: tokens,
  };

  try {
    const response = await admin.messaging().sendEachForMulticast(message);
    console.log(`[FCM] 📤 Mengirim notifikasi: "${payload.title}"`);
    console.log(`[FCM] ✅ Berhasil: ${response.successCount} | ❌ Gagal: ${response.failureCount}`);
    
    // Opsional: Bersihkan token yang sudah tidak valid (expired) atau log detail error
    if (response.failureCount > 0) {
      console.warn('[FCM] Terdapat pengiriman yang gagal. Detail error:');
      response.responses.forEach((resp, idx) => {
        if (!resp.success) {
          console.error(`      -> Token [${idx}]: ${resp.error.code} - ${resp.error.message}`);
        }
      });
    }
    
    return response;
  } catch (error) {
    console.error('[FCM] ❌ FATAL ERROR saat kirim push:', error.message);
  }
}

/**
 * Helper: Mengambil token user dan mengirim push notification
 * @param {string} userId 
 * @param {object} payload - { title, body, data }
 */
export async function triggerPushNotification(userId, payload) {
  try {
    const { default: User } = await import('../models/User.js');
    const user = await User.findById(userId).select('fcm_tokens');
    
    if (!user || !user.fcm_tokens || user.fcm_tokens.length === 0) {
      // console.log(`[FCM] Skip: User ${userId} tidak punya token terdaftar.`);
      return;
    }

    console.log(`[FCM] 🚀 FCM READY: Menyiapkan pengiriman ke User ${userId}...`);
    return await sendPushNotification(user.fcm_tokens, payload);
  } catch (error) {
    console.error('[FCM] Error in triggerPushNotification:', error);
  }
}

/**
 * Helper: Mengambil token banyak user dan mengirim push notification secara massal
 * @param {string[]} userIds 
 * @param {object} payload - { title, body, data }
 */
export async function triggerPushNotificationBatch(userIds, payload) {
  if (!userIds || userIds.length === 0) return;

  try {
    const { default: User } = await import('../models/User.js');
    const users = await User.find({ _id: { $in: userIds } }).select('fcm_tokens');
    
    // Gabungkan semua token dari semua user menjadi satu array flat
    const allTokens = users.reduce((acc, user) => {
      if (user.fcm_tokens && user.fcm_tokens.length > 0) {
        return acc.concat(user.fcm_tokens);
      }
      return acc;
    }, []);

    if (allTokens.length === 0) return;

    console.log(`[FCM] 🚀 FCM READY (Batch): Menyiapkan pengiriman ke ${userIds.length} user (${allTokens.length} perangkat)...`);
    return await sendPushNotification(allTokens, payload);
  } catch (error) {
    console.error('[FCM] Error in triggerPushNotificationBatch:', error);
  }
}

/**
 * Membuat notifikasi entri untuk pesan chat baru (Opsi B: Gabungan Satu Notif)
 * @param {string} recipientId 
 * @param {string} senderId 
 */
export async function createChatNotification(recipientId, senderId) {
  try {
    // Cari apakah sudah ada notifikasi chat yang belum dibaca (TIPE CHAT APAPUN)
    let notification = await Notification.findOne({
      recipient_id: recipientId,
      type: 'chat',
      is_read: false
    });

    if (notification) {
      // Jika sudah ada, cukup update waktunya agar naik ke atas
      notification.sender_id = senderId;
      notification.updatedAt = new Date();
      await notification.save();
    } else {
      // Jika belum ada, buat baru satu baris saja
      await Notification.create({
        recipient_id: recipientId,
        sender_id: senderId,
        type: 'chat',
        is_read: false
      });
    }
  } catch (error) {
    console.error('Error creating chat notification:', error);
  }
}

/**
 * Membuat notifikasi chat secara massal (Opsi B: Gabungan Satu Notif)
 * @param {string[]} recipientIds 
 * @param {string} senderId 
 */
export async function createChatNotificationsBatch(recipientIds, senderId) {
  if (!recipientIds || recipientIds.length === 0) return;

  try {
    // 1. Cari recipient yang SUDAH punya notifikasi chat belum dibaca
    const existingNotifications = await Notification.find({
      recipient_id: { $in: recipientIds },
      type: 'chat',
      is_read: false
    });

    const existingRecipientIds = existingNotifications.map(n => n.recipient_id.toString());
    const newRecipientIds = recipientIds.filter(id => !existingRecipientIds.includes(id.toString()));

    // 2. Update yang sudah ada agar naik ke atas list
    if (existingNotifications.length > 0) {
      await Notification.updateMany(
        { _id: { $in: existingNotifications.map(n => n._id) } },
        { sender_id: senderId, updatedAt: new Date() }
      );
    }

    // 3. Buat baru untuk yang benar-benar belum punya notif chat unread
    if (newRecipientIds.length > 0) {
      const newDocs = newRecipientIds.map(id => ({
        recipient_id: id,
        sender_id: senderId,
        type: 'chat',
        is_read: false
      }));
      await Notification.insertMany(newDocs);
    }
  } catch (error) {
    console.error('Error creating chat notifications batch:', error);
  }
}

/**
 * Menandai notifikasi chat sebagai terbaca 
 * (Hanya jika TOTAL pesan unread di seluruh kategori sudah 0)
 */
export async function markChatAsRead(userId) {
  try {
    // Kita cek dulu, apakah masih ada chat yang belum dibaca di tabel Conversations?
    const { default: Conversation } = await import('../models/Conversation.js');
    const hasUnread = await Conversation.findOne({
      participants: userId,
      [`unread_counts.${userId}`]: { $gt: 0 }
    });

    // Jika sudah TIDAK ADA lagi chat unread di kategori manapun, baru kita matikan notif-nya
    if (!hasUnread) {
      await Notification.updateMany(
        { recipient_id: userId, type: 'chat', is_read: false },
        { is_read: true }
      );
    }
  } catch (error) {
    console.error('Error marking chat as read:', error);
  }
}
