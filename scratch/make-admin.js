import mongoose from 'mongoose';
import dotenv from 'dotenv';
import bcrypt from 'bcrypt';
import User from '../src/models/User.js';

dotenv.config();

async function makeAdmin() {
  try {
    console.log('--- Memulai Setup Akun Admin ---');
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Terkoneksi ke Database.');

    const adminData = {
      nim: '22042026', // NIM Request Mas Edy
      nama: 'Universitas Metamedia',
      password: 'admin123',
      role: 'admin',
      program_studi: 'ADMINISTRATOR'
    };

    // 1. Cari dulu apakah user sudah ada berdasarkan NIM
    let user = await User.findOne({ nim: adminData.nim });

    if (user) {
      // Jika sudah ada, tinggal ubah rolenya jadi admin
      user.role = 'admin';
      await user.save();
      console.log(`✅ Akun "${user.nama}" (NIM: ${user.nim}) sudah ada, perannya telah diupdate menjadi ADMIN.`);
    } else {
      // Jika belum ada, buat baru
      const hashedPassword = await bcrypt.hash(adminData.password, 10);
      user = await User.create({
        ...adminData,
        password: hashedPassword
      });
      console.log('✅ BERHASIL MEMBUAT AKUN ADMIN BARU!');
      console.log(`   NIM: ${adminData.nim}`);
      console.log(`   Password: ${adminData.password}`);
      console.log('   (Simpan data ini baik-baik Mas Edy)');
    }

    await mongoose.disconnect();
    console.log('--- Selesai ---');
    process.exit(0);
  } catch (error) {
    console.error('❌ Terjadi kesalahan:', error);
    process.exit(1);
  }
}

makeAdmin();
