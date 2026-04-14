import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Comment from '../src/models/Comment.js';

dotenv.config();

async function migrate() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("Connected to MongoDB for migration...");

    const allComments = await Comment.find({ is_deleted: false }).lean();
    console.log(`Found ${allComments.length} comments to process.`);

    const commentMap = new Map(allComments.map(c => [c._id.toString(), c]));

    for (const comment of allComments) {
      let topLevelId = null;
      let parentIds = [];
      let current = comment;

      // Terus naik ke atas sampai ketemu Root
      while (current.parent_id) {
        const parent = commentMap.get(current.parent_id.toString());
        if (!parent) break;
        
        parentIds.unshift(parent._id);
        current = parent;
        topLevelId = current._id;
      }

      // Hitung ulang total balasan (seluruh keturunan)
      const descendants = allComments.filter(c => 
        c.parent_ids && c.parent_ids.some(pid => pid.toString() === comment._id.toString())
      ).length; // Ini tidak akan akurat jika kita belum update parent_ids-nya.

      // Sebaiknya update parent_ids & top_level_id dulu, baru hitung replies_count.
      await Comment.updateOne(
        { _id: comment._id },
        { 
          $set: { 
            top_level_id: topLevelId, 
            parent_ids: parentIds 
          } 
        }
      );
    }
    console.log("Updated top_level_id and parent_ids for all comments.");

    // Bagian 2: Hitung ulang replies_count secara akurat
    console.log("Recalculating replies_count...");
    const updatedComments = await Comment.find({ is_deleted: false }).lean();
    for (const comment of updatedComments) {
      const totalDescendants = updatedComments.filter(c => 
        c.parent_ids && c.parent_ids.some(pid => pid.toString() === comment._id.toString())
      ).length;

      await Comment.updateOne(
        { _id: comment._id },
        { $set: { replies_count: totalDescendants } }
      );
    }

    console.log("Migration finished successfully!");
    process.exit(0);
  } catch (err) {
    console.error("Migration failed:", err);
    process.exit(1);
  }
}

migrate();
