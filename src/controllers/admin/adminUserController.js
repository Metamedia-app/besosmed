import bcrypt from 'bcrypt';
import User from '../../models/User.js';

/**
 * Membuat User atau Admin baru (Hanya Admin)
 */
export async function createUser(request, reply) {
  const { nim, nama, email, password, role, program_studi, status_mahasiswa } = request.body;

  try {
    // 1. Cek apakah NIM sudah terdaftar
    const existingUser = await User.findOne({ nim });
    if (existingUser) {
      return reply.status(400).send({
        success: false,
        message: `User dengan NIM ${nim} sudah terdaftar.`,
      });
    }

    // 2. Jika email diisi, cek duplikasi
    if (email) {
      const existingEmail = await User.findOne({ email });
      if (existingEmail) {
        return reply.status(400).send({
          success: false,
          message: `Email ${email} sudah digunakan.`,
        });
      }
    }

    // 3. Hash password
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // 4. Simpan user baru
    const newUser = await User.create({
      nim,
      nama,
      email: email || undefined,
      password: hashedPassword,
      role: role || 'user',
      program_studi: program_studi || '',
      status_mahasiswa: status_mahasiswa || 'AKTIF',
    });

    // Hilangkan password dari response
    const userResponse = newUser.toObject();
    delete userResponse.password;

    return reply.status(201).send({
      success: true,
      message: `${role === 'admin' ? 'Admin' : 'User'} berhasil dibuat.`,
      data: userResponse,
    });
  } catch (error) {
    request.log.error(error);
    return reply.status(500).send({
      success: false,
      message: 'Gagal membuat user baru.',
    });
  }
}
