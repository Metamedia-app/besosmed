import mongoose from 'mongoose';

const reportSchema = new mongoose.Schema(
  {
    reporter_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    post_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Post',
      required: true,
      index: true,
    },
    reason_type: {
      type: String,
      required: true,
      enum: [
        'Pornografi & Konten Seksual',
        'Penipuan (Scam) atau Spam',
        'Ujaran Kebencian (Hate Speech)',
        'Perundungan (Bullying) atau Pelecehan',
        'Informasi Salah (Hoax)',
        'Kekerasan atau Konten Berbahaya',
        'Lainnya'
      ],
    },
    reason_text: {
      type: String,
      default: '',
    },
    status: {
      type: String,
      enum: ['pending', 'ignored', 'resolved'],
      default: 'pending',
      index: true,
    },
    reviewed_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    reviewed_at: {
      type: Date,
    }
  },
  {
    timestamps: true,
    collection: 'reports',
  }
);

// Satu user hanya bisa lapor satu postingan satu kali (mencegah spam laporan dari orang yang sama)
reportSchema.index({ reporter_id: 1, post_id: 1 }, { unique: true });

const Report = mongoose.model('Report', reportSchema);
export default Report;
