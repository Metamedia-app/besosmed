import mongoose from 'mongoose';

const followSchema = new mongoose.Schema(
  {
    follower_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    following_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
  },
  {
    timestamps: true,
    collection: 'follows',
  }
);

// Mencegah user mem-follow orang yang sama berkali-kali di level database
followSchema.index({ follower_id: 1, following_id: 1 }, { unique: true });

const Follow = mongoose.model('Follow', followSchema);
export default Follow;
