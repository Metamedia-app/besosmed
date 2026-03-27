import fp from 'fastify-plugin';
import mongoose from 'mongoose';
import config from '../config/index.js';

async function mongoosePlugin(fastify) {
  if (!config.mongoUri) {
    fastify.log.warn('⚠️  MONGO_URI not set — skipping MongoDB connection');
    return;
  }

  try {
    await mongoose.connect(config.mongoUri);
    fastify.log.info('✅ MongoDB connected successfully');

    // Make mongoose accessible via fastify.mongoose
    fastify.decorate('mongoose', mongoose);

    // Graceful shutdown
    fastify.addHook('onClose', async () => {
      await mongoose.connection.close();
      fastify.log.info('MongoDB connection closed');
    });
  } catch (err) {
    fastify.log.error(`❌ MongoDB connection failed: ${err.message}`);
    throw err;
  }
}

export default fp(mongoosePlugin, {
  name: 'mongoose',
});
