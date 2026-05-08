import fp from 'fastify-plugin';
import mongoose from 'mongoose';
import config from '../config/index.js';

async function mongoosePlugin(fastify) {
  if (!config.mongoUri) {
    fastify.log.warn('⚠️  MONGO_URI not set — skipping MongoDB connection');
    return;
  }

  try {
    mongoose.set('strictQuery', false);
    fastify.log.info('🔌 Connecting to MongoDB...');
    
    // Set timeout koneksi manual agar tidak gantung selamanya
    await mongoose.connect(config.mongoUri, {
      serverSelectionTimeoutMS: 5000, // Tunggu 5 detik saja, kalau gagal langsung error
    });
    
    fastify.log.info('✅ MongoDB connected successfully');

    fastify.decorate('mongoose', mongoose);

    fastify.addHook('onClose', async () => {
      await mongoose.connection.close();
      fastify.log.info('MongoDB connection closed');
    });
  } catch (err) {
    fastify.log.error(`❌ MongoDB connection failed: ${err.message}`);
    process.exit(1); // Exit if DB connection fails
  }
}

export default fp(mongoosePlugin, {
  name: 'mongoose',
  timeout: 30000, // Naikkan ke 30 detik agar lebih aman
});
