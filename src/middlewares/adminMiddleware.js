/**
 * Admin Middleware
 * Memastikan user yang melakukan request memiliki role 'admin'
 */
export async function isAdmin(request, reply) {
  try {
    // request.user diisi oleh @fastify/jwt (biasanya lewat preValidation: [authenticate])
    if (!request.user || request.user.role !== 'admin') {
      return reply.status(403).send({
        success: false,
        message: 'Akses ditolak. Fitur ini hanya untuk Admin.',
      });
    }
  } catch (err) {
    return reply.status(403).send({
      success: false,
      message: 'Gagal memverifikasi hak akses admin.',
    });
  }
}
