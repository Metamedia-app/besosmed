import Notification from '../models/Notification.js';

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
