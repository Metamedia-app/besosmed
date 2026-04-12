import bcrypt from 'bcrypt';
import User from '../../models/User.js';

/**
 * Login mahasiswa menggunakan NIM + password
 * Return JWT token jika berhasil
 */
export async function login(request, reply) {
  const { nim, password } = request.body;

  // 1. Cari user berdasarkan NIM, sertakan password (select: false di schema)
  const user = await User.findOne({ nim }).select('+password').lean();

  if (!user) {
    return reply.status(401).send({
      success: false,
      message: 'NIM atau password salah.',
    });
  }

  // 2. Verifikasi password
  const isValid = await bcrypt.compare(password, user.password);
  if (!isValid) {
    return reply.status(401).send({
      success: false,
      message: 'NIM atau password salah.',
    });
  }

  // 3. Buat JWT payload (tanpa password)
  const payload = {
    id: user._id.toString(),
    nim: user.nim,
    nama: user.nama,
    program_studi: user.program_studi,
    status_mahasiswa: user.status_mahasiswa,
  };

  const token = await reply.jwtSign(payload);

  return reply.status(200).send({
    success: true,
    message: 'Login berhasil.',
    data: {
      token,
      user: {
        id: user._id,
        nim: user.nim,
        nama: user.nama,
        program_studi: user.program_studi,
        jenis_kelamin: user.jenis_kelamin,
        status_mahasiswa: user.status_mahasiswa,
        avatar_url: user.avatar_url,
      },
    },
  });
}
