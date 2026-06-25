import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema(
  {
    conversation_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Conversation',
      required: true,
      index: true,
    },
    sender_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    // Pesan teks (Sudah terenkripsi di database)
    body: {
      type: String,
      default: '',
    },
    // Media attachments (foto, video, pdf, dll)
    attachments: [
      {
        url: String,
        type: { type: String, enum: ['image', 'video', 'file'] },
        name: String,
        size: Number,
        key: String,
      },
    ],
    // Fitur: Hapus buat saya (Delete for Me)
    deleted_by: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    // Fitur: Tarik pesan (Delete for Everyone)
    is_deleted_for_everyone: {
      type: Boolean,
      default: false,
    },
    // Status pesan ala WhatsApp (sent = ceklis 1, delivered = ceklis 2 abu, read = ceklis 2 biru)
    status: {
      type: String,
      enum: ['sent', 'delivered', 'read'],
      default: 'sent'
    },
    // Daftar user yang sudah membaca pesan ini (khusus Grup/Komunitas)
    read_by: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      }
    ],
    // Fitur: Auto-delete (TTL) — Mewarisi waktu dari Conversation
    expiresAt: {
      type: Date
    }
  },
  {
    timestamps: true,
    collection: 'messages',
  }
);

// Index untuk performa penarikan chat sejarah
messageSchema.index({ conversation_id: 1, createdAt: -1 });

const Message = mongoose.model('Message', messageSchema);
export default Message;
