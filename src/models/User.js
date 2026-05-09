import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    nim: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    nik: {
      type: String,
      trim: true,
    },
    email: {
      type: String,
      unique: true,
      trim: true,
      sparse: true, // agar tidak bentrok dengan user lama yang belum isi email
      index: true,
    },
    nama: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    program_studi: {
      type: String,
      trim: true,
      index: true,
    },
    tanggal_masuk: {
      type: String,
    },
    status_mahasiswa: {
      type: String,
      default: 'AKTIF',
    },
    jenis_kelamin: {
      type: String,
      enum: ['Laki-Laki', 'Perempuan'],
    },
    tempat_lahir: {
      type: String,
    },
    tanggal_lahir: {
      type: String,
    },
    agama: {
      type: String,
    },
    alamat: {
      type: String,
    },
    password: {
      type: String,
      required: true,
      select: false, // tidak ikut di query biasa
    },
    // Profil sosmed (akan diisi nanti)
    bio: {
      type: String,
      default: '',
    },
    avatar_url: {
      type: String,
      default: '',
    },
    is_online: {
      type: Boolean,
      default: false,
    },
    last_seen: {
      type: Date,
      default: null,
    },
    // Denormalisasi untuk performa
    followers_count: {
      type: Number,
      default: 0,
    },
    following_count: {
      type: Number,
      default: 0,
    },
    role: {
      type: String,
      enum: ['user', 'admin', 'dosen'],
      default: 'user',
      index: true,
    },
    is_banned: {
      type: Boolean,
      default: false,
      index: true,
    },
    fcm_tokens: [
      {
        type: String,
        index: true,
      }
    ],
  },
  {
    timestamps: true,
    collection: 'users',
  }
);

const User = mongoose.model('User', userSchema);
export default User;
