import { 
  getAllSubjects, 
  createSubject, 
  editSubject,
  deleteSubject,
  addMembersToGroup,
  getAllGroups,
  getGroupMembers,
  removeMemberFromGroup
} from '../../controllers/admin/adminSubjectController.js';

export default async function adminSubjectRoutes(fastify) {
  // Hanya Admin yang boleh lewat sini
  fastify.addHook('preValidation', async (request, reply) => {
    try {
      await fastify.authenticate(request, reply);
      if (request.user.role !== 'admin') {
        throw new Error('Akses ditolak. Anda bukan admin.');
      }
    } catch (err) {
      return reply.status(403).send({ success: false, message: err.message });
    }
  });

  // Manajemen Mata Kuliah
  fastify.get('/subjects', {
    schema: {
      tags: ['Admin Dashboard'],
      summary: 'Admin: Ambil semua daftar mata kuliah (Untuk Dropdown)',
      querystring: {
        type: 'object',
        properties: {
          code_prodi: { type: 'string', description: 'Filter berdasarkan Kode Prodi' }
        }
      },
      security: [{ bearerAuth: [] }]
    }
  }, getAllSubjects);

  fastify.post('/subjects', {
    schema: {
      tags: ['Admin Dashboard'],
      summary: 'Admin: Buat Mata Kuliah baru secara manual',
      body: {
        type: 'object',
        required: ['code', 'name'],
        properties: {
          code: { type: 'string' },
          name: { type: 'string' },
          lecturer_name: { type: 'string' },
          curriculum_year: { type: 'string' },
          sks: { type: 'number' },
          semester: { type: 'number' },
          code_prodi: { type: 'string' }
        }
      },
      security: [{ bearerAuth: [] }]
    }
  }, createSubject);

  fastify.put('/subjects/:id', {
    schema: {
      tags: ['Admin Dashboard'],
      summary: 'Admin: Edit Master Data Mata Kuliah',
      params: {
        type: 'object',
        properties: { id: { type: 'string' } }
      },
      body: {
        type: 'object',
        properties: {
          code: { type: 'string' },
          name: { type: 'string' },
          lecturer_name: { type: 'string' },
          curriculum_year: { type: 'string' },
          sks: { type: 'number' },
          semester: { type: 'number' },
          code_prodi: { type: 'string' }
        }
      },
      security: [{ bearerAuth: [] }]
    }
  }, editSubject);

  fastify.delete('/subjects/:id', {
    schema: {
      tags: ['Admin Dashboard'],
      summary: 'Admin: Hapus Master Data Mata Kuliah dari Dropdown',
      params: {
        type: 'object',
        properties: { id: { type: 'string' } }
      },
      security: [{ bearerAuth: [] }]
    }
  }, deleteSubject);

  // Monitoring Semua Grup Chat
  fastify.get('/groups', {
    schema: {
      tags: ['Admin Dashboard'],
      summary: 'Admin: Lihat daftar semua grup chat matkul yang aktif',
      security: [{ bearerAuth: [] }]
    }
  }, getAllGroups);

  // Detail & Hapus Member Grup
  fastify.get('/groups/:conversationId/members', {
    schema: {
      tags: ['Admin Dashboard'],
      summary: 'Admin: Lihat daftar detail mahasiswa dalam satu grup',
      params: {
        type: 'object',
        properties: { conversationId: { type: 'string' } }
      },
      security: [{ bearerAuth: [] }]
    }
  }, getGroupMembers);

  fastify.delete('/groups/:conversationId/members/:userId', {
    schema: {
      tags: ['Admin Dashboard'],
      summary: 'Admin: Keluarkan satu mahasiswa dari grup',
      params: {
        type: 'object',
        properties: { 
          conversationId: { type: 'string' },
          userId: { type: 'string' }
        }
      },
      security: [{ bearerAuth: [] }]
    }
  }, removeMemberFromGroup);

  // Manajemen Member Grup
  fastify.post('/groups/:conversationId/members', {
    schema: {
      tags: ['Admin Dashboard'],
      summary: 'Admin: Tambahkan mahasiswa baru ke grup chat yang sudah ada',
      params: {
        type: 'object',
        properties: {
          conversationId: { type: 'string' }
        }
      },
      body: {
        type: 'object',
        required: ['students'],
        properties: {
          students: { 
            type: 'array', 
            items: { type: 'string' },
            description: 'Daftar NIM mahasiswa'
          }
        }
      },
      security: [{ bearerAuth: [] }]
    }
  }, addMembersToGroup);
}
