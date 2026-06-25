import bcrypt from 'bcrypt';
import User from '../../models/User.js';
import Conversation from '../../models/Conversation.js';
import * as XLSX from 'xlsx';

/**
 * Membuat User atau Admin baru (Hanya Admin)
 * ... (skip to editUser)
 */

// NOTE: To do this correctly, we will just multi_replace_file_content or perform it cleanly.
// Let me use multi_replace instead to target both the top and the editUser method precisely.

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

    // ---- AUTO SYNC ALUMNI GROUP (Dosen & Alumni) ----
    const isAlumniOrDosen = (role === 'dosen') || ['ALUMNI', 'TIDAK_AKTIF', 'TIDAK AKTIF'].includes(status_mahasiswa?.toUpperCase() || '');
    
    if (isAlumniOrDosen) {
      let alumniGroup = await Conversation.findOne({ type: 'community', is_default_alumni: true });
      if (!alumniGroup) {
        alumniGroup = await Conversation.create({
          type: 'community',
          is_default_alumni: true,
          name: 'Ikatan Alumni',
          description: 'Grup komunitas resmi bagi para alumni, mahasiswa tidak aktif, dan dosen.',
          participants: [newUser._id]
        });
      } else {
        await Conversation.updateOne(
          { _id: alumniGroup._id },
          { $addToSet: { participants: newUser._id } }
        );
      }
    }

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

/**
 * Import User Massal dari Excel
 * POST /api/v1/admin/users/import
 */
export async function importUsersFromExcel(request, reply) {
  const parts = request.parts();
  let buffer = null;

  for await (const part of parts) {
    if (part.type === 'file') {
      const chunks = [];
      for await (const chunk of part.file) chunks.push(chunk);
      buffer = Buffer.concat(chunks);
      break;
    }
  }

  if (!buffer) {
    return reply.status(400).send({ success: false, message: 'File Excel tidak ditemukan.' });
  }

  try {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    
    // Konversi jadi array mentah untuk mencari lokasi header yang sebenarnya
    const rawRows = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false, defval: '' });
    
    // Cari baris yang minimal ada tulisan 'nim'
    const headerRowIndex = rawRows.findIndex(r =>
      r.some(cell => cell?.toString().trim().toLowerCase() === 'nim')
    );
    
    if (headerRowIndex === -1 || headerRowIndex >= rawRows.length - 1) {
      return reply.status(400).send({ 
        success: false, 
        message: 'Format Excel tidak valid. Pastikan ada baris header yang mengandung teks "nim" dan "nama".' 
      });
    }

    const headers = rawRows[headerRowIndex].map(h => h?.toString().trim().toLowerCase());
    const rows = rawRows.slice(headerRowIndex + 1).map(r => {
      const obj = {};
      headers.forEach((h, i) => { if (h) obj[h] = r[i]; });
      return obj;
    }).filter(r => r.nim); // Skip baris yang NIM-nya kosong

    let created = 0;
    let skipped = 0;
    const errors = [];

    for (const row of rows) {
      const { nim, nama, email, password, role, program_studi, status_mahasiswa } = row;

      if (!nim || !nama || !password) {
        errors.push(`Baris NIM ${nim || '?'} dilewati: kolom nim, nama, password wajib diisi.`);
        skipped++;
        continue;
      }

      // Skip jika NIM sudah ada
      const exists = await User.findOne({ nim: nim.toString() });
      if (exists) {
        skipped++;
        continue;
      }

      const hashedPassword = await bcrypt.hash(password.toString(), 10);
      
      // Mongoose schema role enum: ['user', 'admin', 'dosen']
      // Kalau di excel tulisnya "mahasiswa", kita konversi jadi "user"
      let userRole = role?.toString().toLowerCase() || 'user';
      if (userRole === 'mahasiswa') userRole = 'user';

      await User.create({
        nim: nim.toString(),
        nama,
        email: email?.toString() || undefined,
        password: hashedPassword,
        role: userRole,
        program_studi: program_studi?.toString() || '',
        status_mahasiswa: status_mahasiswa?.toString() || 'AKTIF',
      });

      // ---- AUTO SYNC ALUMNI GROUP (Dosen & Alumni) ----
      const finalStatus = status_mahasiswa?.toString() || 'AKTIF';
      const isAlumniOrDosen = (userRole === 'dosen') || ['ALUMNI', 'TIDAK_AKTIF', 'TIDAK AKTIF'].includes(finalStatus.toUpperCase());
      
      if (isAlumniOrDosen) {
        let alumniGroup = await Conversation.findOne({ type: 'community', is_default_alumni: true });
        if (!alumniGroup) {
          alumniGroup = await Conversation.create({
            type: 'community',
            is_default_alumni: true,
            name: 'Ikatan Alumni',
            description: 'Grup komunitas resmi bagi para alumni, mahasiswa tidak aktif, dan dosen.',
            participants: [newUser._id]
          });
        } else {
          await Conversation.updateOne(
            { _id: alumniGroup._id },
            { $addToSet: { participants: newUser._id } }
          );
        }
      }

      created++;
    }

    return reply.send({
      success: true,
      message: `Import selesai: ${created} akun dibuat, ${skipped} baris dilewati.`,
      data: { created, skipped, errors }
    });
  } catch (error) {
    request.log.error(error);
    return reply.status(500).send({ success: false, message: 'Gagal memproses file Excel.' });
  }
}

/**
 * Edit Data atau Status Akun User
 * PUT /api/v1/admin/users/:id
 */
export async function editUser(request, reply) {
  const { id } = request.params;
  const { nama, email, program_studi, status_mahasiswa, password, role } = request.body;

  try {
    const user = await User.findById(id);
    if (!user) {
      return reply.status(404).send({ success: false, message: 'User tidak ditemukan.' });
    }

    const oldStatus = user.status_mahasiswa;

    // Update hanya field yang dikirim
    if (nama !== undefined) user.nama = nama;
    if (email !== undefined) user.email = email;
    if (program_studi !== undefined) user.program_studi = program_studi;
    if (status_mahasiswa !== undefined) user.status_mahasiswa = status_mahasiswa;
    if (role !== undefined) {
      user.role = role.toLowerCase() === 'mahasiswa' ? 'user' : role;
    }

    // Jika password diisi, hash ulang
    if (password) {
      user.password = await bcrypt.hash(password, 10);
    }

    await user.save();

    // ---- AUTO SYNC ALUMNI GROUP (Dosen & Alumni) ----
    const isNowAlumniOrDosen = (user.role === 'dosen') || ['ALUMNI', 'TIDAK_AKTIF', 'TIDAK AKTIF'].includes(user.status_mahasiswa?.toUpperCase() || '');

    if (isNowAlumniOrDosen) {
      // Find or create default alumni group
      let alumniGroup = await Conversation.findOne({ type: 'community', is_default_alumni: true });
      if (!alumniGroup) {
        alumniGroup = await Conversation.create({
          type: 'community',
          is_default_alumni: true,
          name: 'Ikatan Alumni',
          description: 'Grup komunitas resmi bagi para alumni, mahasiswa tidak aktif, dan dosen.',
          participants: [user._id]
        });
      } else {
        await Conversation.updateOne({ _id: alumniGroup._id }, { $addToSet: { participants: user._id } });
      }
    } else {
      // Kick from alumni group
      await Conversation.updateOne(
        { type: 'community', is_default_alumni: true }, 
        { $pull: { participants: user._id } }
      );
    }

    const userResponse = user.toObject();
    delete userResponse.password;

    return reply.send({
      success: true,
      message: 'Data user berhasil diperbarui.',
      data: userResponse
    });
  } catch (error) {
    request.log.error(error);
    return reply.status(500).send({ success: false, message: 'Gagal memperbarui data user.' });
  }
}
