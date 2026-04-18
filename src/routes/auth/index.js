import { login } from '../../controllers/auth/loginController.js';
import { loginWithGoogle } from '../../controllers/auth/googleAuthController.js';

// Schema validasi & dokumentasi Swagger
const loginSchema = {
  summary: 'Login Mahasiswa',
  description:
    'Autentikasi mahasiswa menggunakan NIM dan password. Mengembalikan JWT token yang berlaku selama 30 hari.',
  tags: ['Auth'],
  body: {
    type: 'object',
    required: ['nim', 'password'],
    properties: {
      nim: {
        type: 'string',
        description: 'Nomor Induk Mahasiswa',
      },
      password: {
        type: 'string',
        description: 'Password mahasiswa (default: ddmmyyyy)',
      },
    },
  },
  response: {
    200: {
      description: 'Login berhasil',
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        message: { type: 'string' },
        data: {
          type: 'object',
          properties: {
            token: {
              type: 'string',
              description: 'JWT Bearer token, gunakan di header: Authorization: Bearer <token>',
            },
            user: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                nim: { type: 'string' },
                nama: { type: 'string' },
                program_studi: { type: 'string' },
                jenis_kelamin: { type: 'string' },
                status_mahasiswa: { type: 'string' },
                avatar_url: { type: 'string' },
              },
            },
          },
        },
      },
    },
    401: {
      description: 'NIM atau password salah',
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        message: { type: 'string' },
      },
    },
    429: {
      description: 'Terlalu banyak percobaan login (maks 5x per 15 menit)',
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        message: { type: 'string' },
        retryAfter: { type: 'number', description: 'Detik sebelum bisa coba lagi' },
      },
    },
  },
};

async function authRoutes(fastify) {
  fastify.post('/auth/login', {
    config: {
      // Rate limiting khusus route login:
      // Maksimal 5 percobaan per 15 menit per IP
      rateLimit: {
        max: 5,
        timeWindow: '2 minutes',
      },
    },
    schema: loginSchema,
    handler: login,
  });

  // Login Google (Restricted)
  fastify.post('/auth/google', {
    schema: {
      tags: ['Auth'],
      summary: 'Login via Google (Restricted)',
      description: 'Login menggunakan idToken dari Firebase. Hanya berhasil jika email Google sudah tertaut dengan NIM.',
      body: {
        type: 'object',
        required: ['idToken'],
        properties: {
          idToken: { type: 'string', description: 'ID Token dari Firebase Client SDK' }
        }
      }
    },
    handler: loginWithGoogle
  });
}

export default authRoutes;
