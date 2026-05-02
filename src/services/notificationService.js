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
          is_read: false 
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
    console.log(`[FCM] Berhasil mengirim ke ${response.successCount} perangkat. Gagal: ${response.failureCount}`);
    return response;
  } catch (error) {
    console.error('[FCM] Error mengirim push notification:', error);
  }
}
