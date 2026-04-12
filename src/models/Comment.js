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

const Comment = mongoose.model('Comment', commentSchema);
export default Comment;
