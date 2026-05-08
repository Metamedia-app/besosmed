import { 
  getConversations, 
  getMessages, 
  sendMessage, 
  setTypingStatus, 
  deleteMessage, 
  clearConversation,
  getMedia
} from '../../controllers/chat/chatController.js';
import { getUnreadSummary } from '../../controllers/chat/unreadController.js';

export default async function chatRoutes(fastify) {
  // Semua rute chat memerlukan autentikasi
  fastify.register(async (protectedRoutes) => {
    protectedRoutes.addHook('preValidation', fastify.authenticate);

    // Summary Unread (Badge Utama)
    protectedRoutes.get('/unread-summary', {
      schema: {
        tags: ['Chat Inbox'],
        summary: 'Ringkasan hitungan pesan belum dibaca (Total & Per Kategori)',
        security: [{ bearerAuth: [] }]
      }
    }, getUnreadSummary);

    // List Inbox
    protectedRoutes.get('/conversations', {
      schema: {
        tags: ['Chat Inbox'],
        summary: 'Ambil daftar percakapan (Inbox)',
        security: [{ bearerAuth: [] }]
      }
    }, getConversations);

    // Ambil Riwayat Chat
    protectedRoutes.get('/conversations/:conversationId/messages', {
      schema: {
        tags: ['Chat Inbox'],
        summary: 'Ambil riwayat pesan dalam percakapan',
        params: { type: 'object', properties: { conversationId: { type: 'string' } } },
        security: [{ bearerAuth: [] }]
      }
    }, getMessages);

    // Kirim Pesan (Multipart for Media)
    protectedRoutes.post('/messages', {
      validatorCompiler: () => () => true, // multipart divalidasi di controller
      schema: {
        tags: ['Chat Inbox'],
        summary: 'Kirim pesan (Teks/Media)',
        description: 'Gunakan multipart/form-data. Pilih "Files" untuk kirim gambar/video.',
        consumes: ['multipart/form-data'],
        body: {
          type: 'object',
          properties: {
            recipientId: { type: 'string', description: 'ID User penerima (untuk chat baru)' },
            conversationId: { type: 'string', description: 'ID Percakapan (jika sudah ada room-nya)' },
            body: { type: 'string', description: 'Isi pesan teks' },
            files: { 
              type: 'array', 
              items: { type: 'string', format: 'binary' },
              description: 'Lampiran foto/video/file'
            },
          }
        },
        security: [{ bearerAuth: [] }]
      }
    }, sendMessage);

    // Set Status Mengetik
    protectedRoutes.post('/typing', {
      schema: {
        tags: ['Chat Inbox'],
        summary: 'Update status sedang mengetik',
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
    }, setTypingStatus);

    // Hapus Pesan
    protectedRoutes.delete('/messages/:messageId', {
      schema: {
        tags: ['Chat Inbox'],
        summary: 'Hapus pesan (Untuk saya / Semua orang)',
        params: { type: 'object', properties: { messageId: { type: 'string' } } },
        body: {
          type: 'object',
          properties: {
            type: { type: 'string', enum: ['me', 'everyone'], default: 'me' }
          }
        },
        security: [{ bearerAuth: [] }]
      }
    }, deleteMessage);

    // Bersihkan Obrolan
    protectedRoutes.delete('/conversations/:conversationId/clear', {
      schema: {
        tags: ['Chat Inbox'],
        summary: 'Membersihkan seluruh isi obrolan',
        params: { type: 'object', properties: { conversationId: { type: 'string' } } },
        security: [{ bearerAuth: [] }]
      }
    }, clearConversation);

    // Proxy Media (Dekripsi Gambar/Video)
    protectedRoutes.get('/media/:folder/:filename', {
      schema: {
        tags: ['Chat Inbox'],
        summary: 'Ambil dan dekripsi file media chat',
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
  });
}
