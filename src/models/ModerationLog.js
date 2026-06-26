import mongoose from 'mongoose';

const moderationLogSchema = new mongoose.Schema(
  {
    conversation_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Conversation',
      required: true,
      index: true,
    },
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: ['bad_word'],
      default: 'bad_word',
    },
    content: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: true,
    collection: 'moderation_logs',
  }
);

const ModerationLog = mongoose.model('ModerationLog', moderationLogSchema);
export default ModerationLog;
