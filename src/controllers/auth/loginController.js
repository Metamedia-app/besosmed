import bcrypt from 'bcrypt';
import User from '../../models/User.js';

/**
 * Login mahasiswa menggunakan NIM + password
 * Return JWT token jika berhasil
 */
export async function login(request, reply) {
  const { nim, email, password } = request.body;
  const loginIdentifier = (nim || email || '').trim();

  if (!loginIdentifier || !password) {
    return reply.status(400).send({
      success: false,
      message: 'NIM/Email dan password salah atau tidak diisi.',
    });
  }

  // 1. Cari user berdasarkan NIM atau Email, sertakan password (select: false di schema)
  const user = await User.findOne({
    $or: [
      { nim: loginIdentifier },
      { email: loginIdentifier }
    ]
  }).select('+password').lean();

  if (!user) {
    return reply.status(401).send({
      success: false,
      message: 'NIM/Email atau password salah.',
    });
  }

  // 2. Verifikasi password
  const isValid = await bcrypt.compare(password, user.password);
  if (!isValid) {
    return reply.status(401).send({
      success: false,
      message: 'NIM/Email atau password salah.',
    });
  }

  // 3. Cek apakah user sedang di-ban
  if (user.is_banned) {
    return reply.status(403).send({
      success: false,
      message: 'Mohon maaf, akun Anda telah di-ban. Silakan hubungi support untuk informasi lebih lanjut.',
    });
  }

  // 4. Buat JWT payload (tanpa password)
  const payload = {
    id: user._id.toString(),
    nim: user.nim,
    nama: user.nama,
    role: user.role, // Tambahkan role ke payload
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
        email: user.email,
        program_studi: user.program_studi,
        jenis_kelamin: user.jenis_kelamin,
        status_mahasiswa: user.status_mahasiswa,
        role: user.role || 'user',
        avatar_url: user.avatar_url,
      },
    },
  });
}
