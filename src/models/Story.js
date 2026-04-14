import mongoose from 'mongoose';

const storySchema = new mongoose.Schema(
  {
    author_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    content: {
      type: String,
      default: '',
      maxlength: 500,
    },
    media: {
      url: { type: String },
      key: { type: String },
      type: { type: String, enum: ['image', 'video'] },
    },
    // Meta data tambahan
    views: [
      {
        user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        viewed_at: { type: Date, default: Date.now },
      },
    ],
    views_count: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
    collection: 'stories',
  }
);

/**
 * ── AUTO-DELETE (TTL INDEX) ───────────────────────────────────────────────────
 * Durasi aktif Story: 86400 detik (24 jam).
 */
storySchema.index({ createdAt: 1 }, { expireAfterSeconds: 86400 });

const Story = mongoose.model('Story', storySchema);
export default Story;
