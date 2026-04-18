import admin from '../../config/firebaseAdmin.js';
import User from '../../models/User.js';

/**
 * Kontroler untuk sinkronisasi Akun Google (Firebase Auth)
 * dengan akun database BeSosmed kita.
 */

/**
 * 1. Tautkan Akun Google (Wajib sudah login pake NIM)
 * POST /api/v1/users/me/link-google
 */
export async function linkGoogleAccount(request, reply) {
  const userId = request.user.id;
  const { idToken } = request.body;

  if (!idToken) {
    return reply.status(400).send({ success: false, message: 'idToken Google diperlukan.' });
  }

  try {
    // Verifikasi idToken ke Firebase
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    const email = decodedToken.email;

    if (!email) {
      return reply.status(400).send({ success: false, message: 'Token Google tidak memiliki email yang valid.' });
    }

    // Cek apakah email ini sudah dipakai user lain
    const existingEmail = await User.findOne({ email, _id: { $ne: userId } });
    if (existingEmail) {
      return reply.status(400).send({ success: false, message: 'Email Google ini sudah tertaut dengan NIM lain.' });
    }

    // Update user di MongoDB (Tautkan email)
    await User.findByIdAndUpdate(userId, { email });

    return reply.send({
      success: true,
      message: 'Akun Google berhasil tertaut dengan NIM Anda.',
      data: { email }
    });
  } catch (error) {
    request.log.error(error);
    return reply.status(401).send({ success: false, message: 'Link Google gagal: Token tidak valid.' });
  }
}

/**
 * 2. Login Menggunakan Google
 * POST /api/v1/auth/google
 */
export async function loginWithGoogle(request, reply) {
  const { idToken } = request.body;

  if (!idToken) {
    return reply.status(400).send({ success: false, message: 'idToken Google diperlukan.' });
  }

  try {
    // 1. Verifikasi ke Firebase
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    const email = decodedToken.email;

    if (!email) {
      return reply.status(400).send({ success: false, message: 'Email tidak ditemukan di akun Google Anda.' });
    }

    // 2. Cari di database kita (Restricted: hanya jika sudah tertaut)
    const user = await User.findOne({ email }).lean();

    if (!user) {
      // INI ADALAH RESTRIKSI: User ditolak jika belum tertaut
      return reply.status(403).send({
        success: false,
        message: 'Akun Google Anda belum tertaut dengan NIM mana pun. Silakan login menggunakan NIM & Password terlebih dahulu untuk menautkan akun.',
        errorCode: 'ACCOUNT_NOT_LINKED'
      });
    }

    // 3. Jika ketemu, buatkan JWT login BeSosmed
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
      message: 'Login Google berhasil.',
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
          email: user.email
        },
      },
    });
  } catch (error) {
    request.log.error(error);
    return reply.status(401).send({ success: false, message: 'Login Google gagal: Autentikasi token tidak valid.' });
  }
}
