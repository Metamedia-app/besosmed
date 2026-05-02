import {
  createCommunity,
  getMyCommunities,
  getCommunityDetail,
  getCommunityMessages,
  sendCommunityMessage,
  deleteCommunityMessage,
  inviteToCommunity,
  kickFromCommunity,
  deleteCommunity,
  setCommunityTypingStatus
} from '../../controllers/chat/communityChatController.js';

async function communityChatRoutes(fastify) {
  const auth = { onRequest: [fastify.authenticate] };

  // 1. Create Community
  fastify.post('/communities', {
    ...auth,
    validatorCompiler: () => () => true, // multipart handling
    schema: {
      tags: ['Chat Community'],
      summary: 'Create New Community',
      description: 'Membuat grup komunitas baru dengan nama, deskripsi, dan foto profil (avatar).',
      consumes: ['multipart/form-data'],
      body: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Nama komunitas' },
          description: { type: 'string', description: 'Deskripsi komunitas' },
          members: { type: 'string', description: 'JSON array NIM mahasiswa yang ingin dimasukkan, contoh: ["225520211003", "225520211002"]' },
          avatar: { type: 'string', format: 'binary', description: 'Foto profil grup' }
        }
      },
      security: [{ bearerAuth: [] }]
    },
    handler: createCommunity
  });

  // 2. Get My Communities
  fastify.get('/communities', {
    ...auth,
    schema: {
      tags: ['Chat Community'],
      summary: 'Get My Communities',
      description: 'Mengambil daftar komunitas yang diikuti oleh user.',
      security: [{ bearerAuth: [] }]
    },
    handler: getMyCommunities
  });

  // 2b. Get Community Detail
  fastify.get('/communities/:communityId', {
    ...auth,
    schema: {
      tags: ['Chat Community'],
      summary: 'Get Community Detail',
      description: 'Mengambil detail komunitas: info grup, daftar member, jumlah anggota, dan info admin.',
      params: {
        type: 'object',
        properties: {
          communityId: { type: 'string', description: 'ID Komunitas' }
        }
      },
      security: [{ bearerAuth: [] }]
    },
    handler: getCommunityDetail
  });

  // 2c. Get Community Messages (Riwayat Percakapan)
  fastify.get('/communities/:communityId/messages', {
    ...auth,
    schema: {
      tags: ['Chat Community'],
      summary: 'Get Community Messages',
      description: 'Mengambil riwayat percakapan komunitas. Pesan otomatis didekripsi. Mendukung pagination.',
      params: {
        type: 'object',
        properties: {
          communityId: { type: 'string', description: 'ID Komunitas' }
        }
      },
      querystring: {
        type: 'object',
        properties: {
          limit: { type: 'integer', default: 30, description: 'Jumlah pesan per halaman' },
          skip: { type: 'integer', default: 0, description: 'Offset untuk pagination' }
        }
      },
      security: [{ bearerAuth: [] }]
    },
    handler: getCommunityMessages
  });

  // 8. Typing Indicator (Real-time)
  fastify.post('/communities/typing', {
    ...auth,
    schema: {
      tags: ['Chat Community'],
      summary: 'Set Typing Status (Real-time)',
      description: 'Kirim status sedang mengetik ke semua member komunitas via Socket.io.',
      body: {
        type: 'object',
        required: ['conversationId', 'isTyping'],
        properties: {
          conversationId: { type: 'string', description: 'ID Komunitas' },
          isTyping: { type: 'boolean', description: 'true = sedang mengetik, false = berhenti' }
        }
      },
      security: [{ bearerAuth: [] }]
    },
    handler: setCommunityTypingStatus
  });

  fastify.post('/communities/messages', {
    ...auth,
    validatorCompiler: () => () => true, // multipart
    schema: {
      tags: ['Chat Community'],
      summary: 'Send Community Message',
      description: 'Mengirim pesan teks atau media ke grup komunitas. Semua terenkripsi AES-256.',
      consumes: ['multipart/form-data'],
      body: {
        type: 'object',
        properties: {
          conversationId: { type: 'string', description: 'ID Komunitas' },
          body: { type: 'string', description: 'Isi pesan teks' },
          files: { 
            type: 'array', 
            items: { type: 'string', format: 'binary' },
            description: 'Lampiran foto/video/file'
          },
        }
      },
      security: [{ bearerAuth: [] }]
    },
    handler: sendCommunityMessage
  });

  // 4. Delete Message
  fastify.delete('/communities/messages/:messageId', {
    ...auth,
    schema: {
      tags: ['Chat Community'],
      summary: 'Delete Community Message',
      description: 'Menghapus pesan untuk diri sendiri atau semua orang (Hard Delete & R2 Cleanup).',
      params: { type: 'object', properties: { messageId: { type: 'string' } } },
      body: {
        type: 'object',
        required: ['type'],
        properties: {
          type: { type: 'string', enum: ['me', 'everyone'], description: 'Jenis penghapusan' }
        }
      },
      security: [{ bearerAuth: [] }]
    },
    handler: deleteCommunityMessage
  });

  // 5. Invite Member
  fastify.post('/communities/invite', {
    ...auth,
    schema: {
      tags: ['Chat Community'],
      summary: 'Invite Member (Admin Only)',
      description: 'Mengundang user lain masuk ke komunitas.',
      body: {
        type: 'object',
        required: ['communityId', 'nim'],
        properties: {
          communityId: { type: 'string', description: 'ID Komunitas' },
          nim: { type: 'string', description: 'NIM mahasiswa yang ingin diundang, contoh: 225520211003' }
        }
      },
      security: [{ bearerAuth: [] }]
    },
    handler: inviteToCommunity
  });

  // 6. Kick Member
  fastify.delete('/communities/:communityId/members/:userId', {
    ...auth,
    schema: {
      tags: ['Chat Community'],
      summary: 'Kick Member (Admin Only)',
      description: 'Mengeluarkan anggota dari komunitas.',
      params: {
        type: 'object',
        properties: {
          communityId: { type: 'string' },
          userId: { type: 'string' }
        }
      },
      security: [{ bearerAuth: [] }]
    },
    handler: kickFromCommunity
  });

  // 7. Delete Community (Creator Only)
  fastify.delete('/communities/:communityId', {
    ...auth,
    schema: {
      tags: ['Chat Community'],
      summary: 'Delete Community (Creator Only)',
      description: 'Menghapus komunitas beserta seluruh pesan dan file di R2. Hanya bisa dilakukan oleh pencipta komunitas.',
      params: {
        type: 'object',
        properties: {
          communityId: { type: 'string', description: 'ID Komunitas yang akan dihapus' }
        }
      },
      security: [{ bearerAuth: [] }]
    },
    handler: deleteCommunity
  });
}

export default communityChatRoutes;
