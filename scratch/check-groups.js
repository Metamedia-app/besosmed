import mongoose from 'mongoose';
import 'dotenv/config';
import Conversation from '../src/models/Conversation.js';
import Subject from '../src/models/Subject.js';

async function check() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected to DB');

  const userId = '69fcab787e56238185183157'; // Testdosen ID
  const groups = await Conversation.find({
    participants: userId,
    type: 'group'
  }).populate('subject_id');

  console.log('Total groups found for user:', groups.length);
  groups.forEach(g => {
    console.log(`- Name: ${g.name}`);
    console.log(`  ExpiresAt: ${g.expiresAt}`);
    console.log(`  Current Time: ${new Date()}`);
    console.log(`  Is Expired? ${g.expiresAt && g.expiresAt < new Date()}`);
  });

  await mongoose.disconnect();
}

check();
