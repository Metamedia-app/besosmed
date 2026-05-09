import User from '../../models/User.js';

/**
 * Mendaftarkan atau Memperbarui FCM Token User
 * Endpoint: POST /api/v1/users/fcm-token
 */
export async function updateFcmToken(request, reply) {
  const userId = request.user.id;
  const { token } = request.body;

  if (!token) {
    return reply.status(400).send({ success: false, message: 'FCM Token diperlukan.' });
  }

  try {
    // Tambahkan token ke array fcm_tokens jika belum ada
    // Kita gunakan $addToSet agar tidak ada duplikasi token yang sama untuk satu user
    await User.findByIdAndUpdate(userId, {
      $addToSet: { fcm_tokens: token }
    });

    return reply.send({ 
      success: true, 
      message: 'FCM Token berhasil didaftarkan.' 
    });
  } catch (error) {
    request.log.error(error);
    return reply.status(500).send({ success: false, message: 'Gagal mendaftarkan FCM Token.' });
  }
}

/**
 * Menghapus FCM Token (saat Logout)
 * Endpoint: DELETE /api/v1/users/fcm-token
 */
export async function removeFcmToken(request, reply) {
  const userId = request.user.id;
  const { token } = request.body;

  if (!token) {
    return reply.status(400).send({ success: false, message: 'FCM Token diperlukan untuk dihapus.' });
  }

  try {
    await User.findByIdAndUpdate(userId, {
      $pull: { fcm_tokens: token }
    });

    return reply.send({ 
      success: true, 
      message: 'FCM Token berhasil dihapus.' 
    });
  } catch (error) {
    request.log.error(error);
    return reply.status(500).send({ success: false, message: 'Gagal menghapus FCM Token.' });
  }
}
