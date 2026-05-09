import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema(
  {
    recipient_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    sender_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    type: {
      type: String,
      enum: ['like', 'comment', 'repost', 'follow', 'takedown', 'chat', 'toxic'],
      required: true,
    },
    post_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Post',
      required: false, // Opsional karena tidak semua notif ada postingannya (misal: Follow)
    },
    reference_id: {
      type: mongoose.Schema.Types.ObjectId,
      required: false, // Digunakan untuk ConversationId pada chat
    },
    is_read: { type: Boolean, default: false },
    others_count: { type: Number, default: 0 },
    grouped_items: [
      {
        user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        nama: String,
        avatar_url: String,
        reference_id: mongoose.Schema.Types.ObjectId, // ID Komentar atau ID Like
        at: { type: Date, default: Date.now }
      }
    ],
  },
  {
    timestamps: true, // Mengaktifkan createdAt dan updatedAt
    collection: 'notifications',
  }
);

notificationSchema.index({ recipient_id: 1, is_read: 1, updatedAt: -1 });

const Notification = mongoose.model('Notification', notificationSchema);
export default Notification;
