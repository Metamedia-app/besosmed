import Report from '../../models/Report.js';
import Post from '../../models/Post.js';

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
    await Report.create({
      reporter_id: reporterId,
      post_id: postId,
      reason_type,
      reason_text
    });

    return reply.status(201).send({
      success: true,
      message: 'Terima kasih, laporan Anda telah kami terima dan akan segera ditinjau oleh tim moderasi.'
    });

  } catch (error) {
    if (error.code === 11000) {
      return reply.status(400).send({ success: false, message: 'Anda sudah melaporkan postingan ini sebelumnya.' });
    }
    request.log.error(error);
    return reply.status(500).send({ success: false, message: 'Gagal mengirim laporan.' });
  }
}
