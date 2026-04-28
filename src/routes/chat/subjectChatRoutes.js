import { 
  syncSubjectChat, 
  getMySubjectGroups, 
  sendGroupMessage,
  getGroupMessages,
  deleteGroupMessage,
  setGroupTypingStatus
} from '../../controllers/chat/subjectChatController.js';

export default async function subjectChatRoutes(fastify) {
  // Semua rute di sini butuh login
  fastify.addHook('preValidation', fastify.authenticate);

  // --- ADMIN ONLY ---
  fastify.post('/sync', {
    schema: {
      tags: ['Chat Matkul'],
      summary: 'Admin: Sinkronisasi data mahasiswa & grup matkul via JSON',
      body: {
        type: 'object',
        required: ['subjects_data'],
        properties: {
          subjects_data: {
            type: 'array',
            items: {
              type: 'object',
              required: ['nim', 'name', 'subject_name', 'subject_code'],
              properties: {
                nim: { type: 'string' },
                name: { type: 'string' },
                subject_name: { type: 'string' },
                subject_code: { type: 'string' },
                academic_year: { type: 'string' }
              }
            }
          }
        }
      },
      security: [{ bearerAuth: [] }]
    }
  }, syncSubjectChat);

  // --- USER ROUTES ---
  fastify.get('/my-groups', {
    schema: {
      tags: ['Chat Matkul'],
      summary: 'Mengambil daftar grup matkul yang saya ikuti',
      security: [{ bearerAuth: [] }]
    }
  }, getMySubjectGroups);

  fastify.post('/messages', {
    schema: {
      tags: ['Chat Matkul'],
      summary: 'Mengirim pesan ke grup matkul (Teks & Media)',
      description: 'Gunakan multipart/form-data untuk mengirim file. Jika hanya teks, cukup isi field body.',
      // Hapus body validation agar tidak bentrok dengan manual parsing di controller
      security: [{ bearerAuth: [] }]
    }
  }, sendGroupMessage);

  fastify.get('/messages/:conversationId', {
    schema: {
      tags: ['Chat Matkul'],
      summary: 'Mengambil riwayat pesan grup matkul',
      params: { type: 'object', properties: { conversationId: { type: 'string' } } },
      security: [{ bearerAuth: [] }]
    }
  }, getGroupMessages);

  fastify.delete('/messages/:messageId', {
    schema: {
      tags: ['Chat Matkul'],
      summary: 'Menghapus/Menarik pesan di grup',
      params: { type: 'object', properties: { messageId: { type: 'string' } } },
      body: { 
        type: 'object', 
        required: ['type'], 
        properties: { type: { type: 'string', enum: ['me', 'everyone'] } } 
      },
      security: [{ bearerAuth: [] }]
    }
  }, deleteGroupMessage);

  fastify.post('/typing', {
    schema: {
      tags: ['Chat Matkul'],
      summary: 'Set status ngetik di grup matkul',
      body: {
        type: 'object',
        required: ['conversationId', 'isTyping'],
        properties: {
          conversationId: { type: 'string' },
          isTyping: { type: 'boolean' }
        }
      },
      security: [{ bearerAuth: [] }]
    }
  }, setGroupTypingStatus);
}
