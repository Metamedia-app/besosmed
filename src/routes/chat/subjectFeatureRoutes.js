import { 
  uploadSyllabus, 
  getSyllabus, 
  createAssignment, 
  getAssignments,
  toggleMuteGroup
} from '../../controllers/chat/subjectFeatureController.js';
import { isAdmin } from '../../middlewares/adminMiddleware.js';

// Middleware sederhana untuk cek Dosen atau Admin
const isLecturerOrAdmin = async (request, reply) => {
  const role = request.user.role;
  if (role !== 'dosen' && role !== 'admin') {
    return reply.status(403).send({
      success: false,
      message: 'Akses ditolak. Fitur ini hanya untuk Dosen atau Admin.'
    });
  }
};

async function subjectFeatureRoutes(fastify) {
  const auth = { preHandler: [fastify.authenticate] };
  const lecturerAuth = { preHandler: [fastify.authenticate, isLecturerOrAdmin] };

  // --- SYLLABUS / KRS ---
  fastify.post('/subject/syllabus', {
    ...lecturerAuth,
    schema: {
      tags: ['Grup Matkul Fitur'],
      summary: 'Upload Materi Perkuliahan (Pertemuan 1-14)',
      description: 'Hanya Dosen atau Admin yang dapat mengunggah materi.',
      security: [{ bearerAuth: [] }],
      consumes: ['multipart/form-data'],
      body: {
        type: 'object',
        properties: {
          conversationId: { type: 'string', description: 'ID Grup Matkul' },
          meetingNumber: { type: 'integer', minimum: 1, maximum: 14, description: 'Pertemuan ke (1-14)' },
          title: { type: 'string', description: 'Judul Materi' },
          file: { type: 'string', format: 'binary', description: 'File Materi (PDF/PPT)' }
        }
      }
    },
    validatorCompiler: () => () => true,
    handler: uploadSyllabus
  });

  fastify.get('/subject/:conversationId/syllabus', {
    ...auth,
    schema: {
      tags: ['Grup Matkul Fitur'],
      summary: 'Ambil Daftar Materi Silabus',
      security: [{ bearerAuth: [] }],
      params: { type: 'object', properties: { conversationId: { type: 'string' } } }
    },
    handler: getSyllabus
  });

  // --- ASSIGNMENTS ---
  fastify.post('/subject/assignments', {
    ...lecturerAuth,
    schema: {
      tags: ['Grup Matkul Fitur'],
      summary: 'Buat Tugas Baru',
      security: [{ bearerAuth: [] }],
      consumes: ['multipart/form-data'],
      body: {
        type: 'object',
        properties: {
          conversationId: { type: 'string', description: 'ID Grup Matkul' },
          title: { type: 'string', description: 'Judul Tugas' },
          description: { type: 'string', description: 'Deskripsi Tugas' },
          dueDate: { type: 'string', format: 'date-time', description: 'Tenggat Waktu (YYYY-MM-DD HH:mm)' },
          file: { type: 'string', format: 'binary', description: 'File Pendukung (Opsional)' }
        }
      }
    },
    validatorCompiler: () => () => true,
    handler: createAssignment
  });

  fastify.get('/subject/:conversationId/assignments', {
    ...auth,
    schema: {
      tags: ['Grup Matkul Fitur'],
      summary: 'Ambil Daftar Tugas Aktif',
      security: [{ bearerAuth: [] }],
      params: { type: 'object', properties: { conversationId: { type: 'string' } } }
    },
    handler: getAssignments
  });

  // --- MODERASI ---
  fastify.patch('/subject/:conversationId/mute', {
    ...lecturerAuth,
    schema: {
      tags: ['Grup Matkul Fitur'],
      summary: 'Mute/Unmute Grup Chat',
      security: [{ bearerAuth: [] }],
      params: { type: 'object', properties: { conversationId: { type: 'string' } } },
      body: {
        type: 'object',
        required: ['isMuted'],
        properties: { isMuted: { type: 'boolean' } }
      }
    },
    handler: toggleMuteGroup
  });
}

export default subjectFeatureRoutes;
