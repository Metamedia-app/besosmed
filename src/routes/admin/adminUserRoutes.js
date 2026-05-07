import { createUser } from '../../controllers/admin/adminUserController.js';
import { isAdmin } from '../../middlewares/adminMiddleware.js';

async function adminUserRoutes(fastify) {
  const auth = { 
    preHandler: [fastify.authenticate, isAdmin] 
  };

  fastify.post('/users', {
    ...auth,
    schema: {
      summary: 'Buat User atau Admin Baru',
      description: 'Admin dapat membuat akun mahasiswa (user) atau staf (admin) baru.',
      tags: ['Admin Management'],
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['nim', 'nama', 'password'],
        properties: {
          nim: { type: 'string', description: 'NIM atau NIK' },
          nama: { type: 'string', description: 'Nama lengkap' },
          email: { type: 'string', description: 'Email (opsional)' },
          password: { type: 'string', description: 'Password akun' },
          role: { type: 'string', enum: ['user', 'admin', 'dosen'], default: 'user', description: 'Role akun' },
          program_studi: { type: 'string', description: 'Program studi (untuk mahasiswa)' },
          status_mahasiswa: { type: 'string', enum: ['AKTIF', 'TIDAK AKTIF', 'ALUMNI'], default: 'AKTIF', description: 'Status mahasiswa' }
        }
      },
      response: {
        201: {
          description: 'Berhasil dibuat',
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' },
            data: { type: 'object' }
          }
        },
        400: {
          description: 'Input tidak valid atau NIM duplikat',
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' }
          }
        }
      }
    },
    handler: createUser
  });
}

export default adminUserRoutes;
