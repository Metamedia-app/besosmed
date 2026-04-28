import mongoose from 'mongoose';

const subjectSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    academic_year: {
      type: String, // Contoh: "2023/2024 Ganjil"
      required: true,
      index: true,
    },
    lecturer_name: {
      type: String,
      trim: true,
    },
    // ID grup chat yang terhubung dengan MK ini
    conversation_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Conversation',
    },
  },
  {
    timestamps: true,
    collection: 'subjects',
  }
);

const Subject = mongoose.model('Subject', subjectSchema);
export default Subject;
