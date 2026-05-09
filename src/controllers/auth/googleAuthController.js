import { OAuth2Client } from 'google-auth-library';
import admin from '../../config/firebaseAdmin.js';
import User from '../../models/User.js';

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

/**
 * Helper untuk verifikasi token Google.
 * Mencoba verifikasi menggunakan google-auth-library (Web Client ID) terlebih dahulu,
 * jika gagal baru fallback ke Firebase Admin SDK.
 */
async function verifyGoogleToken(token) {
  try {
    // 1. Coba verifikasi sebagai Google ID Token mentah (direkomendasikan FE)
    const ticket = await client.verifyIdToken({
      idToken: token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    return {
      email: payload.email,
      name: payload.name,
      picture: payload.picture,
      method: 'google-auth-library'
    };
  } catch (err) {
    // 2. Jika gagal, coba verifikasi sebagai Firebase ID Token
    try {
      const decodedToken = await admin.auth().verifyIdToken(token);
      return {
        email: decodedToken.email,
        name: decodedToken.name,
        picture: decodedToken.picture || decodedToken.avatar_url,
        method: 'firebase-admin'
      };
    } catch (fbError) {
      throw new Error('Token tidak valid di Google maupun Firebase.');
    }
  }
}

/**
 * 1. Tautkan Akun Google (Wajib sudah login pake NIM)
 * POST /api/v1/users/me/link-google
 */
export async function linkGoogleAccount(request, reply) {
  const userId = request.user.id;
  // Support baik idToken maupun token (sesuai saran FE)
  const token = request.body.idToken || request.body.token;

  if (!token) {
    return reply.status(400).send({ success: false, message: 'Token Google diperlukan (idToken atau token).' });
  }

  try {
    const googleData = await verifyGoogleToken(token);
    const email = googleData.email;

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
      message: `Akun Google berhasil tertaut (Verified via ${googleData.method}).`,
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
  const token = request.body.idToken || request.body.token;

  if (!token) {
    return reply.status(400).send({ success: false, message: 'Token Google diperlukan (idToken atau token).' });
  }

  try {
    // 1. Verifikasi (Dual Mode)
    const googleData = await verifyGoogleToken(token);
    const email = googleData.email;

    if (!email) {
      return reply.status(400).send({ success: false, message: 'Email tidak ditemukan di akun Google Anda.' });
    }

    // 2. Cari di database kita (Restricted: hanya jika sudah tertaut)
    const user = await User.findOne({ email }).lean();

    if (!user) {
      return reply.status(403).send({
        success: false,
        message: 'Akun Google Anda belum tertaut dengan NIM mana pun. Silakan login menggunakan NIM & Password terlebih dahulu untuk menautkan akun.',
        errorCode: 'ACCOUNT_NOT_LINKED'
      });
    }

    // 3. Cek apakah user sedang di-ban
    if (user.is_banned) {
      return reply.status(403).send({
        success: false,
        message: 'Mohon maaf, akun Anda telah di-ban. Silakan hubungi support untuk informasi lebih lanjut.',
      });
    }

    // 4. Jika ketemu & tidak di-ban, buatkan JWT login BeSosmed
    const payload = {
      id: user._id.toString(),
      nim: user.nim,
      nama: user.nama,
      role: user.role, // Tambahkan role ke payload
      program_studi: user.program_studi,
      status_mahasiswa: user.status_mahasiswa,
    };

    const jwtToken = await reply.jwtSign(payload);

    return reply.status(200).send({
      success: true,
      message: `Login Google berhasil (Verified via ${googleData.method}).`,
      data: {
        token: jwtToken,
        user: {
          id: user._id,
          nim: user.nim,
          nama: user.nama,
          program_studi: user.program_studi,
          jenis_kelamin: user.jenis_kelamin,
          status_mahasiswa: user.status_mahasiswa,
          role: user.role,
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
