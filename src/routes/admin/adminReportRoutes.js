import { reportPost, getAllReports } from '../../controllers/admin/adminReportController.js';

export default async function adminReportRoutes(fastify) {
  // 1. Rute User: Melaporkan Postingan (Butuh Login)
  fastify.post('/reports', {
    schema: {
      tags: ['Admin Dashboard'], // Saya masukkan ke sini agar admin bisa lihat fiturnya
      summary: 'User: Laporkan postingan bermasalah',
      body: {
        type: 'object',
        required: ['post_id', 'reason_type'],
        properties: {
          post_id: { type: 'string' },
          reason_type: { 
            type: 'string',
            enum: [
              'Pornografi & Konten Seksual',
              'Penipuan (Scam) atau Spam',
              'Ujaran Kebencian (Hate Speech)',
              'Perundungan (Bullying) atau Pelecehan',
              'Informasi Salah (Hoax)',
              'Kekerasan atau Konten Berbahaya',
              'Lainnya'
            ]
          },
          reason_text: { type: 'string' }
        }
      },
      security: [{ bearerAuth: [] }]
    },
    preValidation: [fastify.authenticate]
  }, reportPost);

  // 2. Rute Admin: Monitoring Laporan (Hanya Admin)
  fastify.get('/reports', {
    schema: {
      tags: ['Admin Dashboard'],
      summary: 'Admin: Lihat semua daftar laporan masuk',
      security: [{ bearerAuth: [] }]
    },
    preValidation: [async (request, reply) => {
      await fastify.authenticate(request, reply);
      if (request.user.role !== 'admin') {
        return reply.status(403).send({ success: false, message: 'Akses ditolak. Anda bukan admin.' });
      }
    }]
  }, getAllReports);
}
