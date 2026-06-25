import mongoose from 'mongoose';

const majorSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    faculty: {
      type: String,
      trim: true,
    },
    code_prodi: {
      type: String,
      unique: true,
      trim: true,
      index: true,
    },
    singkatan: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
    collection: 'majors',
  }
);

const Major = mongoose.model('Major', majorSchema);
export default Major;
