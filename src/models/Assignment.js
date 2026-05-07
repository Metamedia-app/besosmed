import mongoose from 'mongoose';

const assignmentSchema = new mongoose.Schema(
  {
    conversation_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Conversation',
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    due_date: {
      type: Date,
      required: true,
    },
    attachments: [
      {
        url: { type: String },
        type: { type: String, enum: ['image', 'video', 'file'], default: 'file' },
        name: { type: String },
        size: { type: Number },
        key: { type: String },
        _id: false
      },
    ],
    created_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    is_active: {
      type: Boolean,
      default: true,
    },
    // Melacak pengingat yang sudah dikirim agar tidak double
    reminders_sent: {
      thirty_min: { type: Boolean, default: false },
      ten_min: { type: Boolean, default: false },
      five_min: { type: Boolean, default: false }
    }
  },
  {
    timestamps: true,
    collection: 'assignments',
  }
);

const Assignment = mongoose.model('Assignment', assignmentSchema);
export default Assignment;
