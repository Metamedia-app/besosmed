import Report from '../../models/Report.js';
import Post from '../../models/Post.js';
import User from '../../models/User.js';
import { sendToUser } from '../../services/wsService.js';

/**
 * Mendapatkan daftar alasan laporan (untuk menu di FE)
 */
export async function getReportReasons(request, reply) {
  const reasons = [
    'Pornografi & Konten Seksual',
    'Penipuan (Scam) atau Spam',
    'Ujaran Kebencian (Hate Speech)',
    'Perundungan (Bullying) atau Pelecehan',
    'Informasi Salah (Hoax)',
    'Kekerasan atau Konten Berbahaya',
    'Lainnya'
  ];

  return reply.send({
    success: true,
    data: { reasons }
  });
}

/**
 * Mengirim laporan terhadap suatu postingan
 */
export async function reportPost(request, reply) {
  const reporterId = request.user.id;
  const { id: postId } = request.params;
  const { reason_type, reason_text = '' } = request.body;

  try {
    // 1. Cek apakah postingan ada
    const post = await Post.findOne({ _id: postId, is_deleted: false });
    if (!post) {
      return reply.status(404).send({ success: false, message: 'Postingan tidak ditemukan.' });
    }

    // 2. Cegah lapor postingan sendiri
    if (post.author_id.toString() === reporterId) {
      return reply.status(400).send({ success: false, message: 'Anda tidak bisa melaporkan postingan sendiri.' });
    }

    // 3. Simpan laporan
    const report = await Report.create({
      reporter_id: reporterId,
      post_id: postId,
      reason_type,
      reason_text
    });

    // ── SOCKET.IO UNTUK REAL-TIME DASHBOARD (WEB ADMIN) ─────────────────
    (async () => {
      try {
        const unreadCount = await Report.countDocuments({ status: 'pending' });
        const admins = await User.find({ role: 'admin' }).select('_id');
        
        admins.forEach(admin => {
          sendToUser(admin._id, {
            type: 'admin_notification',
            data: {
              title: '🚨 Laporan Konten Baru!',
              message: `Postingan ${post.author_id?.nama || 'User'} dilaporkan oleh ${request.user.nama}.`,
              report: report,
              unread_count: unreadCount
            }
          });
        });
      } catch (err) {
        console.error('FAILED_TO_EMIT_ADMIN_NOTIF:', err);
      }
    })();
    // ───────────────────────────────────────────────────────────────────

    return reply.status(201).send({
      success: true,
      message: 'Terima kasih, laporan Anda telah kami terima dan akan segera ditinjau oleh tim moderasi.'
    });

  } catch (error) {
    if (error.code === 11000) {
      return reply.status(400).send({ success: false, message: 'Anda sudah melaporkan postingan ini sebelumnya.' });
    }
    if (error.name === 'ValidationError') {
      return reply.status(400).send({ success: false, message: 'Data laporan tidak lengkap atau jenis pelanggaran tidak valid.' });
    }
    request.log.error(error);
    return reply.status(500).send({ success: false, message: 'Gagal mengirim laporan. Terjadi kesalahan pada server.' });
  }
}
