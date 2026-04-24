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
  },
  {
    timestamps: true,
    collection: 'conversations',
  }
);

// Pastikan pencarian pasangan participants cepat
conversationSchema.index({ participants: 1 });

const Conversation = mongoose.model('Conversation', conversationSchema);
export default Conversation;
