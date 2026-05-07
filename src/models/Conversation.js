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
    // Fitur: Auto-delete (TTL)
    expiresAt: {
      type: Date
    },
    // Fitur Moderasi Kelas
    is_muted: {
      type: Boolean,
      default: false,
    }
  },
  {
    timestamps: true,
    collection: 'conversations',
  }
);

// Pastikan pencarian pasangan participants cepat
conversationSchema.index({ participants: 1 });

// Index TTL: MongoDB akan otomatis menghapus dokumen saat mencapai waktu expiresAt
conversationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const Conversation = mongoose.model('Conversation', conversationSchema);
export default Conversation;
