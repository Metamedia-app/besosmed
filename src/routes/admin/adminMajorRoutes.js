import { createMajor, getMajors } from '../../controllers/admin/adminMajorController.js';
import { isAdmin } from '../../middlewares/adminMiddleware.js';

async function adminMajorRoutes(fastify) {
  const auth = { 
    preHandler: [fastify.authenticate, isAdmin] 
  };

  // GET Majors (KUNCI: Hanya Admin sekarang)
  fastify.get('/majors', {
    ...auth,
    schema: {
      summary: 'Ambil Daftar Jurusan (Admin Only)',
      description: 'Mengambil semua daftar program studi. Hanya Admin yang bisa akses.',
      tags: ['Admin Management'],
      security: [{ bearerAuth: [] }],
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: { 
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  _id: { type: 'string' },
                  name: { type: 'string' },
                  faculty: { type: 'string' },
                  code_prodi: { type: 'string' },
                  singkatan: { type: 'string' }
                }
              }
            }
          }
        }
      }
    },
    handler: getMajors
  });

  // CREATE Major (Hanya Admin)
  fastify.post('/majors', {
    ...auth,
    schema: {
      summary: 'Tambah Jurusan Baru',
      description: 'Hanya Admin yang dapat menambahkan program studi baru.',
      tags: ['Admin Management'],
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string', description: 'Nama Program Studi' },
          faculty: { type: 'string', description: 'Fakultas (opsional)' },
          code_prodi: { type: 'string', description: 'Kode Prodi unik (opsional)' },
          singkatan: { type: 'string', description: 'Singkatan Prodi (opsional, misal: INFA)' }
        }
      },
      response: {
        201: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' },
            data: { type: 'object' }
          }
        }
      }
    },
    handler: createMajor
  });
}

export default adminMajorRoutes;
