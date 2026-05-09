import { 
  syncSubjectChat, 
  getMySubjectGroups, 
  sendGroupMessage,
  getGroupMessages,
  deleteGroupMessage,
  setGroupTypingStatus,
  getGroupDetail,
  markGroupAsRead
} from '../../controllers/chat/subjectChatController.js';
import { getMedia } from '../../controllers/chat/chatController.js';

export default async function subjectChatRoutes(fastify) {
  // Semua rute di sini butuh login
  fastify.addHook('preValidation', fastify.authenticate);

  // --- ADMIN ONLY ---
  fastify.post('/sync', {
    schema: {
      tags: ['Admin Dashboard'],
      summary: 'Admin: Sinkronisasi daftar mahasiswa ke grup matkul (Batch)',
      body: {
        type: 'object',
        required: ['subject_name', 'subject_code', 'students'],
        properties: {
          subject_name: { type: 'string' },
          subject_code: { type: 'string' },
          academic_year: { type: 'string' },
          lecturer_nim: { type: 'string', description: 'NIM Dosen pengampu' },
          expires_at: { type: 'string', description: 'Tanggal kadaluarsa grup (Format: YYYY-MM-DD)' },
          students: { 
            type: 'array', 
            items: { type: 'string' }
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

  fastify.get('/groups/:conversationId', {
    schema: {
      tags: ['Chat Matkul'],
      summary: 'Mengambil detail informasi grup mata kuliah (Anggota, Dosen, Deskripsi)',
      params: { type: 'object', properties: { conversationId: { type: 'string' } } },
      security: [{ bearerAuth: [] }]
    }
  }, getGroupDetail);

  fastify.post('/messages', {
    schema: {
      tags: ['Chat Matkul'],
      summary: 'Mengirim pesan ke grup matkul (Teks & Media)',
      description: 'Gunakan form-data untuk mengirim file dan teks sekaligus.',
      body: {
        type: 'object',
        properties: {
          conversationId: { type: 'string', description: 'ID Grup Chat' },
          content: { type: 'string', description: 'Pesan teks (opsional jika ada file)' },
          file: { type: 'string', format: 'binary', description: 'Lampiran foto/video/file' }
        }
      },
      consumes: ['multipart/form-data'],
      security: [{ bearerAuth: [] }]
    },
    // Bypass validasi body agar tidak bentrok dengan multipart parsing di controller
    validatorCompiler: () => () => true
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

  // Tandai Dibaca (Ceklis Biru - Read by Everyone)
  fastify.patch('/groups/:conversationId/read', {
    schema: {
      tags: ['Chat Matkul'],
      summary: 'Tandai semua pesan grup matkul sebagai dibaca (Ceklis Biru)',
      params: { type: 'object', properties: { conversationId: { type: 'string' } } },
      security: [{ bearerAuth: [] }]
    }
  }, markGroupAsRead);

  fastify.get('/media/:folder/:filename', {
    schema: {
      tags: ['Chat Matkul'],
      summary: 'Proxy Dekripsi Media (Foto/Video) - Chat Matkul',
      description: 'Mengambil media terenkripsi dari R2, mendekripsinya, dan menyajikannya sebagai file asli.',
      params: {
        type: 'object',
        properties: {
          folder: { type: 'string' },
          filename: { type: 'string' }
        }
      },
      security: [{ bearerAuth: [] }]
    }
  }, getMedia);
}
