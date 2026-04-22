import bcrypt from 'bcrypt';
import User from '../../models/User.js';

/**
 * Login khusus Admin untuk Dashboard Web
 * Menolak user yang tidak memiliki role 'admin'
 */
export async function adminLogin(request, reply) {
  const { nim, password } = request.body;

  try {
    // 1. Cari user berdasarkan NIM
    const user = await User.findOne({ nim }).select('+password').lean();

    if (!user) {
      return reply.status(401).send({
        success: false,
        message: 'NIM atau password salah.',
      });
    }

    // 2. Verifikasi Password
    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      return reply.status(401).send({
        success: false,
        message: 'NIM atau password salah.',
      });
    }

    // 3. Verifikasi Role (KHUSUS ADMIN)
    if (user.role !== 'admin') {
      return reply.status(403).send({
        success: false,
        message: 'Akses ditolak. Akun ini bukan akun Admin.',
      });
    }

    // 4. Cek apakah di-ban (Admin pun bisa kena ban jika melanggar kebijakan kampus)
    if (user.is_banned) {
      return reply.status(403).send({
        success: false,
        message: 'Akun admin ini sedang dinonaktifkan.',
      });
    }

    // 5. Buat JWT
    const payload = {
      id: user._id.toString(),
      nim: user.nim,
      nama: user.nama,
      role: user.role,
    };

    const token = await reply.jwtSign(payload);

    return reply.status(200).send({
      success: true,
      message: 'Login Admin berhasil.',
      data: {
        token,
        user: {
          id: user._id,
          nim: user.nim,
          nama: user.nama,
          role: user.role,
          avatar_url: user.avatar_url,
        },
      },
    });
  } catch (error) {
    request.log.error(error);
    return reply.status(500).send({
      success: false,
      message: 'Terjadi kesalahan saat login admin.',
    });
  }
}
