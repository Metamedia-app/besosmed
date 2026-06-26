import mongoose from 'mongoose';

const conversationSchema = new mongoose.Schema(
  {
    participants: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    last_message: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Message',
    },
    // Menyimpan jumlah pesan belum dibaca per user
    // Contoh: { "userIdA": 5, "userIdB": 0 }
    unread_counts: {
      type: Map,
      of: Number,
      default: {},
    },
    // Catatan kapan terakhir kali chat dihapus (Clear Chat) per user
    cleared_at: {
      type: Map,
      of: Date,
      default: {},
    },
    // Flag untuk membedakan Inbox, Group, atau Community di masa depan
    type: {
      type: String,
      enum: ['inbox', 'group', 'community'],
      default: 'inbox',
    },
    // Khusus untuk Group / Community
    name: {
      type: String,
      trim: true,
    },
    avatar_url: {
      type: String,
      default: '',
    },
    class_name: {
      type: String, // Contoh: "INFA 1", "Bisdig 2"
      trim: true,
    },
    subject_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Subject',
    },
    // Khusus Community (Admin Management)
    creator_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    admins: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    description: {
      type: String,
      default: '',
    },
    // Flag penanda apakah ini adalah Grup Komunitas Pusat Bawaan (Alumni)
    is_default_alumni: {
      type: Boolean,
      default: false,
    },
    // Fitur: Auto-delete (TTL)
    expiresAt: {
      type: Date
    },
    // Fitur Moderasi Kelas
    is_muted: {
      type: Boolean,
      default: false,
    },
    academic_year: {
      type: String, // Contoh: "2023/2024"
      trim: true,
      index: true,
    }
  },
  {
    timestamps: true,
    collection: 'conversations',
  }
);

// Pastikan pencarian pasangan participants cepat
conversationSchema.index({ participants: 1 });

// Unik per Matkul + Kelas + Tahun Ajaran (Diferensiasi Angkatan)
// Hanya berlaku untuk type: group
conversationSchema.index(
  { subject_id: 1, class_name: 1, academic_year: 1 }, 
  { unique: true, partialFilterExpression: { type: 'group' } }
);

const Conversation = mongoose.model('Conversation', conversationSchema);
export default Conversation;
