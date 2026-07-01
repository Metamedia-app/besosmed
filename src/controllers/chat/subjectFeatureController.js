import Syllabus from '../../models/Syllabus.js';
import Assignment from '../../models/Assignment.js';
import Conversation from '../../models/Conversation.js';
import { encryptBuffer } from '../../services/encryptionService.js';
import { uploadFile } from '../../services/r2Service.js';
import { emitAssignmentReminder, emitMuteStatus } from '../../services/wsService.js';
import { triggerPushNotificationBatch } from '../../services/notificationService.js';

/**
 * 1. Upload Materi Silabus (Dosen Only)
 */
export async function uploadSyllabus(request, reply) {
  const lecturerId = request.user.id;
  let conversationId = '';
  let meetingNumber = 0;
  let title = '';
  const attachments = [];

  try {
    const parts = request.parts();
    for await (const part of parts) {
      if (part.type === 'field') {
        if (part.fieldname === 'conversationId') conversationId = part.value;
        if (part.fieldname === 'meetingNumber') meetingNumber = parseInt(part.value);
        if (part.fieldname === 'title') title = part.value;
      } else if (part.type === 'file') {
        const chunks = [];
        for await (const chunk of part.file) chunks.push(chunk);
        const buffer = Buffer.concat(chunks);
        
        // --- WAJIB ENKRIPSI ---
        const encryptedBuffer = encryptBuffer(buffer);
        const upload = await uploadFile(encryptedBuffer, part.mimetype, 'syllabus');
        
        const baseUrl = process.env.APP_URL || `http://${request.hostname}`;
        const proxyUrl = `${baseUrl}/api/v1/chat/media/syllabus/${upload.key.split('/').pop()}`;

        attachments.push({
          url: proxyUrl,
          type: upload.type,
          name: part.filename,
          size: buffer.length,
          key: upload.key
        });
      }
    }

    // Validasi dasar
    if (!conversationId || isNaN(meetingNumber) || !title) {
      return reply.status(400).send({ success: false, message: 'Data tidak lengkap.' });
    }

    // Pastikan ID valid
    if (!/^[0-9a-fA-F]{24}$/.test(conversationId)) {
      return reply.status(400).send({ success: false, message: 'ID Grup tidak valid.' });
    }

    // --- KEAMANAN / IDOR: Pastikan Dosen/Admin adalah anggota/peserta grup matkul ini ---
    if (request.user.role !== 'admin') {
      const isMember = await Conversation.findOne({ _id: conversationId, participants: lecturerId, type: 'group' });
      if (!isMember) {
        return reply.status(403).send({ success: false, message: 'Akses ditolak. Anda bukan pengajar di grup matkul ini.' });
      }
    }

    // Simpan ke DB
    const syllabus = await Syllabus.findOneAndUpdate(
      { conversation_id: conversationId, meeting_number: meetingNumber },
      { title, attachments, uploaded_by: lecturerId },
      { upsert: true, new: true }
    );

    return reply.status(201).send({
      success: true,
      message: `Materi pertemuan ke-${meetingNumber} berhasil diunggah.`,
      data: syllabus
    });
  } catch (error) {
    console.error('[UPLOAD_SYLLABUS_ERROR]:', error);
    request.log.error(error);
    return reply.status(500).send({ success: false, message: 'Gagal mengunggah materi.' });
  }
}

/**
 * 2. Ambil Daftar Silabus (Mahasiswa & Dosen)
 */
export async function getSyllabus(request, reply) {
  const { conversationId } = request.params;

  try {
    const syllabusList = await Syllabus.find({ conversation_id: conversationId })
      .sort({ meeting_number: 1 })
      .lean();

    return reply.send({ success: true, data: syllabusList });
  } catch (error) {
    return reply.status(500).send({ success: false, message: 'Gagal mengambil materi.' });
  }
}

/**
 * 3. Buat Tugas Baru (Dosen Only)
 */
export async function createAssignment(request, reply) {
  const lecturerId = request.user.id;
  let conversationId = '';
  let title = '';
  let description = '';
  let dueDate = '';
  const attachments = [];

  try {
    const parts = request.parts();
    for await (const part of parts) {
      if (part.type === 'field') {
        if (part.fieldname === 'conversationId') conversationId = part.value;
        if (part.fieldname === 'title') title = part.value;
        if (part.fieldname === 'description') description = part.value;
        if (part.fieldname === 'dueDate') dueDate = part.value;
      } else if (part.type === 'file') {
        const chunks = [];
        for await (const chunk of part.file) chunks.push(chunk);
        const buffer = Buffer.concat(chunks);
        
        const encryptedBuffer = encryptBuffer(buffer);
        const upload = await uploadFile(encryptedBuffer, part.mimetype, 'assignment');
        
        const baseUrl = process.env.APP_URL || `http://${request.hostname}`;
        const proxyUrl = `${baseUrl}/api/v1/chat/media/assignment/${upload.key.split('/').pop()}`;

        attachments.push({
          url: proxyUrl,
          type: upload.type,
          name: part.filename,
          size: buffer.length,
          key: upload.key
        });
      }
    }

    // Validasi dasar
    if (!conversationId || !title) {
      return reply.status(400).send({ success: false, message: 'Data tidak lengkap.' });
    }

    // Pastikan ID valid
    if (!/^[0-9a-fA-F]{24}$/.test(conversationId)) {
      return reply.status(400).send({ success: false, message: 'ID Grup tidak valid.' });
    }

    // --- KEAMANAN / IDOR: Pastikan Dosen/Admin adalah anggota/peserta grup matkul ini ---
    if (request.user.role !== 'admin') {
      const isMember = await Conversation.findOne({ _id: conversationId, participants: lecturerId, type: 'group' });
      if (!isMember) {
        return reply.status(403).send({ success: false, message: 'Akses ditolak. Anda bukan pengajar di grup matkul ini.' });
      }
    }

    const assignment = await Assignment.create({
      conversation_id: conversationId,
      title,
      description,
      due_date: new Date(dueDate),
      attachments,
      created_by: lecturerId
    });

    // ── NOTIFIKASI TUGAS BARU (FCM BROADCAST) ───────────────────────────
    // Dilakukan secara background agar tidak menghambat response
    (async () => {
      try {
        console.log(`\n[NEW_ASSIGNMENT] 📝 Memproses Notifikasi untuk Tugas: "${title}"`);
        
        // 1. Ambil data grup matkul & pesertanya
        const conv = await Conversation.findById(conversationId).select('participants name').lean();
        
        if (conv && conv.participants.length > 0) {
          // 2. Saring: hanya kirim ke Mahasiswa (bukan dosen pengirim)
          const studentIds = conv.participants.filter(p => p.toString() !== lecturerId);
          
          if (studentIds.length > 0) {
            console.log(`[NEW_ASSIGNMENT] 🚀 Mengirim FCM ke ${studentIds.length} mahasiswa di grup "${conv.name || 'Matkul'}"...`);
            
            await triggerPushNotificationBatch(studentIds, {
              title: `Tugas Baru: ${title}`,
              body: `Dosen telah memposting tugas baru di grup ${conv.name || 'Matkul'}. Silakan cek detailnya!`,
              data: {
                type: 'NEW_ASSIGNMENT',
                conversation_id: conversationId,
                assignment_id: assignment._id.toString()
              }
            });
            
            console.log(`[NEW_ASSIGNMENT] ✅ Notifikasi berhasil dikirim ke antrian FCM.\n`);
          } else {
            console.log(`[NEW_ASSIGNMENT] ℹ️ Skip: Tidak ada mahasiswa lain di grup ini.\n`);
          }
        }
      } catch (err) {
        console.error(`[NEW_ASSIGNMENT] ❌ Gagal mengirim notifikasi:`, err.message);
      }
    })();
    // ───────────────────────────────────────────────────────────────────

    return reply.status(201).send({
      success: true,
      message: 'Tugas berhasil dibuat.',
      data: assignment
    });
  } catch (error) {
    request.log.error(error);
    return reply.status(500).send({ success: false, message: 'Gagal membuat tugas.' });
  }
}

/**
 * 4. Ambil Daftar Tugas
 */
export async function getAssignments(request, reply) {
  const { conversationId } = request.params;

  try {
    const assignments = await Assignment.find({ conversation_id: conversationId, is_active: true })
      .sort({ due_date: 1 })
      .lean();

    const now = new Date();
    const formatted = assignments.map(a => ({
      ...a,
      status: a.due_date > now ? 'ACTIVE' : 'EXPIRED'
    }));

    return reply.send({ success: true, data: formatted });
  } catch (error) {
    return reply.status(500).send({ success: false, message: 'Gagal mengambil daftar tugas.' });
  }
}

/**
 * 5. Mute/Unmute Grup (Dosen/Admin Only)
 */
export async function toggleMuteGroup(request, reply) {
  const lecturerId = request.user.id;
  const { conversationId } = request.params;
  const { isMuted } = request.body;

  try {
    // --- KEAMANAN / IDOR: Pastikan Dosen/Admin adalah anggota/peserta grup matkul ini ---
    if (request.user.role !== 'admin') {
      const isMember = await Conversation.findOne({ _id: conversationId, participants: lecturerId, type: 'group' });
      if (!isMember) {
        return reply.status(403).send({ success: false, message: 'Akses ditolak. Anda bukan pengajar di grup matkul ini.' });
      }
    }

    await Conversation.findByIdAndUpdate(conversationId, { is_muted: isMuted });

    // KIRIM REAL-TIME KE SEMUA PESERTA
    emitMuteStatus(conversationId, isMuted);

    return reply.send({ 
      success: true, 
      message: `Grup berhasil di-${isMuted ? 'mute' : 'unmute'}.` 
    });
  } catch (error) {
    return reply.status(500).send({ success: false, message: 'Gagal mengubah status mute.' });
  }
}
