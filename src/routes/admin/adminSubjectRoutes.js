import { 
  getAllSubjects, 
  createSubject, 
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
      security: [{ bearerAuth: [] }]
    }
  }, getAllSubjects);

  fastify.post('/subjects', {
    schema: {
      tags: ['Admin Dashboard'],
      summary: 'Admin: Buat Mata Kuliah baru secara manual',
      body: {
        type: 'object',
        required: ['code', 'name', 'academic_year'],
        properties: {
          code: { type: 'string' },
          name: { type: 'string' },
          academic_year: { type: 'string' },
          lecturer_name: { type: 'string' }
        }
      },
      security: [{ bearerAuth: [] }]
    }
  }, createSubject);

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
