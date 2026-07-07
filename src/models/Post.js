import mongoose from 'mongoose';

const mediaSchema = new mongoose.Schema(
  {
    url: { type: String, required: true },       // URL publik R2
    key: { type: String, required: true },       // R2 object key (untuk delete)
    type: { type: String, enum: ['image', 'video'], required: true },
    thumbnail_url: { type: String, default: '' }, // untuk video preview
  },
  { _id: false }
);

const postSchema = new mongoose.Schema(
  {
    author_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    caption: {
      type: String,
      default: '',
      maxlength: 2000,
      trim: true,
    },
    media: {
      type: [mediaSchema],
      default: [],
    },
    visibility: {
      type: String,
      enum: ['public', 'followers'],
      default: 'public',
    },
    // Repost
    type: {
      type: String,
      enum: ['original', 'repost'],
      default: 'original',
    },
    original_post_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Post',
      default: null,
    },
    // Counters (denormalized untuk performa — tidak perlu COUNT query setiap saat)
    likes_count: { type: Number, default: 0 },
    comments_count: { type: Number, default: 0 },
    reposts_count: { type: Number, default: 0 },
    shares_count: { type: Number, default: 0 },

    // Tags (Mention) — daftar user yang di-tag di caption
    tags_id: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: undefined,
    }],

    is_deleted: { type: Boolean, default: false, index: true },
    is_edited: { type: Boolean, default: false },
  },
  {
    timestamps: true,
    collection: 'posts',
  }
);

// Index untuk feed (sort by createdAt desc)
postSchema.index({ createdAt: -1 });
postSchema.index({ author_id: 1, createdAt: -1 });
postSchema.index({ original_post_id: 1, author_id: 1, type: 1 });

const Post = mongoose.model('Post', postSchema);
export default Post;
