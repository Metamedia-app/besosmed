import 'dotenv/config';

const config = {
  // Server
  port: parseInt(process.env.PORT, 10) || 3000,
  host: process.env.HOST || '0.0.0.0',
  nodeEnv: process.env.NODE_ENV || 'development',

  // MongoDB
  mongoUri: process.env.MONGO_URI || '',

  // Redis
  redisUrl: process.env.REDIS_URL || '',


  // JWT
  jwtSecret: process.env.JWT_SECRET || 'changeme_super_secret_wajib_ganti',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '30d',

  // Cloudflare R2
  r2: {
    accountId: process.env.R2_ACCOUNT_ID || '',
    accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
    bucketName: process.env.R2_BUCKET_NAME || '',
    endpoint: process.env.R2_ENDPOINT || '',
    publicUrl: process.env.R2_PUBLIC_URL || '',
  },

  // Helpers
  get isDev() {
    return this.nodeEnv === 'development';
  },
  get isProd() {
    return this.nodeEnv === 'production';
  },
};

export default config;
