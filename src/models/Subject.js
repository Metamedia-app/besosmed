import mongoose from 'mongoose';

const subjectSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    curriculum_year: {
      type: String, // Contoh: "Kurikulum 2020"
      trim: true,
    },
    academic_year: {
      type: String, // Contoh: "2023/2024 Ganjil"
      required: true,
      index: true,
    },
    sks: {
      type: Number,
      default: 0,
    },
    semester: {
      type: Number,
      index: true,
    },
    code_prodi: {
      type: String,
      trim: true,
      index: true,
    },
    lecturer_name: {
      type: String,
      trim: true,
    },
    lecturer_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      index: true,
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

// Unik per kombinasi Kode MK + Kode Prodi + Tahun Ajaran
subjectSchema.index({ code: 1, code_prodi: 1, academic_year: 1 }, { unique: true });

const Subject = mongoose.model('Subject', subjectSchema);
export default Subject;
