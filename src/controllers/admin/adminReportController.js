import Report from '../../models/Report.js';
import User from '../../models/User.js';
import Post from '../../models/Post.js';
import { sendPushNotification } from '../../services/notificationService.js';
import { sendToUser } from '../../services/wsService.js';

/**
 * User Melaporkan Postingan
 */
export async function reportPost(request, reply) {
  const reporterId = request.user.id;
  const { post_id, reason_type, reason_text } = request.body;

  try {
    const post = await Post.findById(post_id).populate('author_id', 'nama');
    if (!post) {
      return reply.status(404).send({ success: false, message: 'Postingan tidak ditemukan.' });
    }

    const report = await Report.create({
      reporter_id: reporterId,
      post_id,
      reason_type,
      reason_text
    });

    // --- SOCKET.IO UNTUK REAL-TIME DASHBOARD (WEB ADMIN) ---
    const admins = await User.find({ role: 'admin' }).select('_id');
    admins.forEach(admin => {
      sendToUser(admin._id, {
        type: 'admin_notification',
        data: {
          title: '🚨 Laporan Konten Baru!',
          message: `Postingan ${post.author_id?.nama || 'User'} dilaporkan.`,
          report: report
        }
      });
    });

    return reply.status(201).send({ 
      success: true, 
      message: 'Laporan Anda telah terkirim. Admin akan meninjau postingan ini.' 
    });
  } catch (error) {
    if (error.code === 11000) {
      return reply.status(400).send({ success: false, message: 'Anda sudah melaporkan postingan ini sebelumnya.' });
    }
    return reply.status(500).send({ success: false, message: 'Gagal mengirim laporan.' });
  }
}

/**
 * Admin: Mendapatkan daftar laporan (Fungsi yang diharapkan routes/admin/index.js)
 */
export async function getReportsAdmin(request, reply) {
  const { status = 'pending', limit = 20, skip = 0 } = request.query;

  try {
    const filter = status === 'all' ? {} : { status };
    
    const reports = await Report.find(filter)
      .populate('reporter_id', 'nama nim')
      .populate({
        path: 'post_id',
        populate: { path: 'author_id', select: 'nama' }
      })
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(skip));

    // Tambahkan hitungan laporan pending (unread)
    const unreadCount = await Report.countDocuments({ status: 'pending' });

    return reply.send({ 
      success: true, 
      data: reports,
      unread_count: unreadCount 
    });
  } catch (error) {
    console.error('GET_REPORTS_ERROR:', error);
    return reply.status(500).send({ success: false, message: 'Gagal mengambil daftar laporan.' });
  }
}

/**
 * Admin: Update Status Laporan (Fungsi yang diharapkan routes/admin/index.js)
 */
export async function updateReportStatus(request, reply) {
  const { id } = request.params;
  const { status } = request.body;
  const adminId = request.user.id;

  try {
    const report = await Report.findByIdAndUpdate(
      id,
      { 
        status, 
        reviewed_by: adminId,
        reviewed_at: new Date()
      },
      { new: true }
    );

    if (!report) {
      return reply.status(404).send({ success: false, message: 'Laporan tidak ditemukan.' });
    }

    // Ambil unread_count terbaru setelah status diupdate
    const unreadCount = await Report.countDocuments({ status: 'pending' });

    return reply.send({ 
      success: true, 
      message: 'Status laporan berhasil diperbarui.', 
      data: report,
      unread_count: unreadCount
    });
  } catch (error) {
    return reply.status(500).send({ success: false, message: 'Gagal memperbarui status laporan.' });
  }
}
