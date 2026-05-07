import mongoose from 'mongoose';

const syllabusSchema = new mongoose.Schema(
  {
    conversation_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Conversation',
      required: true,
      index: true,
    },
    meeting_number: {
      type: Number,
      required: true, // 1 - 14
    },
    title: {
      type: String,
      required: true,
      trim: true,
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
    uploaded_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  {
    timestamps: true,
    collection: 'syllabus',
  }
);

// Satu pertemuan hanya boleh satu silabus per grup (opsional, bisa diubah)
syllabusSchema.index({ conversation_id: 1, meeting_number: 1 }, { unique: true });

const Syllabus = mongoose.model('Syllabus', syllabusSchema);
export default Syllabus;
