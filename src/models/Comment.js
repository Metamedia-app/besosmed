import mongoose from 'mongoose';

const commentSchema = new mongoose.Schema(
  {
    post_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Post',
      required: true,
      index: true,
    },
    author_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    body: {
      type: String,
      required: true,
      maxlength: 1000,
      trim: true,
    },
    parent_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Comment',
      default: null,
      index: true,
    },
    // ID Komentar paling atas (Root) untuk query Tree yang cepat
    top_level_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Comment',
      default: null,
      index: true,
    },
    // Array ID semua leluhur untuk update jumlah balasan secara rekursif
    parent_ids: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Comment',
      },
    ],
    replies_count: {
      type: Number,
      default: 0,
    },
    is_deleted: { type: Boolean, default: false },
  },
  {
    timestamps: true,
    collection: 'comments',
  }
);

commentSchema.index({ post_id: 1, createdAt: 1 });
commentSchema.index({ top_level_id: 1, createdAt: 1 }); // Index untuk fetching Tree
commentSchema.index({ parent_ids: 1 }); // Index untuk Bulk Update

const Comment = mongoose.model('Comment', commentSchema);
export default Comment;
