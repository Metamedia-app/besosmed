import mongoose from 'mongoose';

const likeSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    post_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Post',
      required: true,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    collection: 'likes',
  }
);

// Unique: 1 user hanya bisa like 1 post sekali
likeSchema.index({ user_id: 1, post_id: 1 }, { unique: true });
likeSchema.index({ post_id: 1 });

const Like = mongoose.model('Like', likeSchema);
export default Like;
