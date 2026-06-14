import { createUser, importUsersFromExcel, editUser } from '../../controllers/admin/adminUserController.js';
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

  fastify.post('/users/import', {
    ...auth,
    schema: {
      summary: 'Import User Massal via Excel',
      description: 'Upload file .xlsx dengan kolom: nim, nama, email, password, role, program_studi, status_mahasiswa',
      tags: ['Admin Management'],
      security: [{ bearerAuth: [] }],
      consumes: ['multipart/form-data']
    },
    handler: importUsersFromExcel
  });

  fastify.put('/users/:id', {
    ...auth,
    schema: {
      summary: 'Edit Data atau Status Akun User',
      description: 'Admin dapat mengubah data user: nama, email, program studi, status, role, atau password.',
      tags: ['Admin Management'],
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        properties: { id: { type: 'string', description: 'MongoDB _id User' } }
      },
      body: {
        type: 'object',
        properties: {
          nama: { type: 'string' },
          email: { type: 'string' },
          program_studi: { type: 'string' },
          status_mahasiswa: { type: 'string', enum: ['AKTIF', 'TIDAK_AKTIF', 'ALUMNI'] },
          role: { type: 'string', enum: ['mahasiswa', 'dosen', 'admin'] },
          password: { type: 'string', description: 'Isi hanya jika ingin mengganti password' }
        }
      }
    },
    handler: editUser
  });
}

export default adminUserRoutes;
