import Subject from '../../models/Subject.js';
import Conversation from '../../models/Conversation.js';
import User from '../../models/User.js';
import Message from '../../models/Message.js';
import { encryptMessage, decryptMessage, encryptBuffer } from '../../services/encryptionService.js';
import { uploadFile, deleteFile } from '../../services/r2Service.js';
import { emitGroupMessage, emitGroupTypingStatus } from '../../services/wsService.js';

/**
 * Sinkronisasi Data Mahasiswa & MK dari JSON
 * Ini adalah fungsi otomatis untuk memasukkan mahasiswa ke grup MK
 */
export async function syncSubjectChat(request, reply) {
  // --- PROTEKSI KHUSUS ADMIN ---
  if (request.user.role !== 'admin') {
    return reply.status(403).send({ 
      success: false, 
      message: 'Akses ditolak. Hanya Admin yang dapat melakukan sinkronisasi data.' 
    });
  }

  const { subjects_data } = request.body; // Array of { nim, name, subject_name, subject_code, academic_year }

  if (!subjects_data || !Array.isArray(subjects_data)) {
    return reply.status(400).send({ success: false, message: 'Format data JSON tidak valid.' });
  }

  const results = {
    created_subjects: 0,
    enrolled_students: 0,
    errors: []
  };

  for (const item of subjects_data) {
    try {
      // 1. Cari atau Buat Mata Kuliah
      let subject = await Subject.findOne({ code: item.subject_code });
      
      if (!subject) {
        subject = await Subject.create({
          code: item.subject_code,
          name: item.subject_name,
          academic_year: item.academic_year || '2023/2024'
        });
        results.created_subjects++;
      }

      // 2. Cari atau Buat Percakapan (Group) untuk MK ini
      let conv = await Conversation.findOne({ subject_id: subject._id, type: 'group' });
      
      if (!conv) {
        conv = await Conversation.create({
          type: 'group',
          name: subject.name,
          subject_id: subject._id,
          participants: []
        });
        // Update referensi balik di Subject
        subject.conversation_id = conv._id;
        await subject.save();
      }

      // 3. Cari Mahasiswa berdasarkan NIM
      const student = await User.findOne({ nim: item.nim });
      
      if (student) {
        // Tambahkan mahasiswa ke grup jika belum ada
        await Conversation.findByIdAndUpdate(conv._id, {
          $addToSet: { participants: student._id }
        });
        results.enrolled_students++;
      } else {
        results.errors.push(`NIM ${item.nim} (${item.name}) tidak ditemukan di database.`);
      }

    } catch (err) {
      results.errors.push(`Gagal memproses ${item.nim}: ${err.message}`);
    }
  }

  return reply.send({
    success: true,
    message: 'Sinkronisasi berhasil diselesaikan.',
    data: results
  });
}

/**
 * Mengambil daftar grup matkul yang diikuti user
 */
export async function getMySubjectGroups(request, reply) {
  const userId = request.user.id;

  try {
    const groups = await Conversation.find({
      participants: userId,
      type: 'group'
    })
    .populate('subject_id', 'code name academic_year')
    .sort({ updatedAt: -1 })
    .lean();

    const formatted = groups.map(g => ({
      _id: g._id,
      name: g.name,
      subject_info: g.subject_id,
      avatar_url: g.avatar_url,
      unread_count: g.unread_counts?.[userId] || 0,
      last_message_at: g.updatedAt
    }));

    return reply.send({ success: true, data: formatted });
  } catch (error) {
    return reply.status(500).send({ success: false, message: 'Gagal mengambil daftar grup matkul.' });
  }
}

/**
 * Mengirim Pesan ke Grup Matkul
 * Logic enkripsi dan media sama dengan Inbox
 */
export async function sendGroupMessage(request, reply) {
  const senderId = request.user.id;
  
  let conversationId = '';
  let body = '';
  const attachments = [];

  try {
    const parts = request.parts();
    for await (const part of parts) {
      if (part.type === 'field') {
        if (part.fieldname === 'conversationId') conversationId = part.value;
        if (part.fieldname === 'body') body = part.value;
      } else if (part.type === 'file') {
        const chunks = [];
        for await (const chunk of part.file) {
          chunks.push(chunk);
        }
        const buffer = Buffer.concat(chunks);
        const encryptedBuffer = encryptBuffer(buffer);
        const upload = await uploadFile(encryptedBuffer, part.mimetype, 'group');
        
        const baseUrl = process.env.APP_URL || `http://${request.hostname}`;
        const proxyUrl = `${baseUrl}/api/v1/chat/media/grub/${upload.key.split('/').pop()}`;

        attachments.push({
          url: proxyUrl,
          type: upload.type,
          name: part.filename,
          size: buffer.length,
          key: upload.key
        });
      }
    }

    if (!conversationId) {
      return reply.status(400).send({ success: false, message: 'ConversationId grup diperlukan.' });
    }

    // Enkripsi pesan teks
    const encryptedBody = encryptMessage(body);

    const message = await Message.create({
      conversation_id: conversationId,
      sender_id: senderId,
      body: encryptedBody,
      attachments
    });

    // Update percakapan: last_message & unread counts untuk SEMUA peserta kecuali pengirim
    const conv = await Conversation.findById(conversationId);
    if (!conv) return reply.status(404).send({ success: false, message: 'Grup tidak ditemukan.' });

    conv.last_message = message._id;
    conv.participants.forEach(pId => {
      const pIdStr = pId.toString();
      if (pIdStr !== senderId) {
        const currentCount = conv.unread_counts.get(pIdStr) || 0;
        conv.unread_counts.set(pIdStr, currentCount + 1);
      }
    });
    await conv.save();

    await message.populate('sender_id', 'nama nim avatar_url');
    
    const formattedMessage = {
      ...message.toObject(),
      body: body // Kirim teks asli ke pengirim
    };

    // Broadcast ke SEMUA peserta grup di Chat Room via Socket.io
    emitGroupMessage(conversationId, formattedMessage);

    return reply.status(201).send({ success: true, data: formattedMessage });

  } catch (error) {
    request.log.error(error);
    return reply.status(500).send({ success: false, message: 'Gagal mengirim pesan grup.' });
  }
}

/**
 * Mengambil riwayat pesan grup matkul
 */
export async function getGroupMessages(request, reply) {
  const userId = request.user.id;
  const { conversationId } = request.params;
  const { limit = 30, skip = 0 } = request.query;

  try {
    const conv = await Conversation.findOne({ _id: conversationId, participants: userId });
    if (!conv) return reply.status(403).send({ success: false, message: 'Akses ditolak.' });

    const messages = await Message.find({
      conversation_id: conversationId,
      deleted_by: { $ne: userId }
    })
    .sort({ createdAt: -1 })
    .skip(parseInt(skip))
    .limit(parseInt(limit))
    .populate('sender_id', 'nama nim avatar_url')
    .lean();

    const formatted = messages.map(m => ({
      ...m,
      body: m.is_deleted_for_everyone ? 'Pesan ini telah ditarik' : decryptMessage(m.body),
    })).reverse();

    // Reset unread count
    await Conversation.findByIdAndUpdate(conversationId, {
      [`unread_counts.${userId}`]: 0
    });

    return reply.send({ success: true, data: formatted });
  } catch (error) {
    return reply.status(500).send({ success: false, message: 'Gagal memuat pesan grup.' });
  }
}

/**
 * Menarik/Menghapus pesan di grup
 */
export async function deleteGroupMessage(request, reply) {
  const userId = request.user.id;
  const { messageId } = request.params;
  const { type } = request.body; // 'me' atau 'everyone'

  try {
    const message = await Message.findById(messageId);
    if (!message) return reply.status(404).send({ success: false, message: 'Pesan tidak ditemukan.' });

    if (type === 'everyone') {
      if (message.sender_id.toString() !== userId) {
        return reply.status(403).send({ success: false, message: 'Hanya pengirim yang bisa menarik pesan untuk semua orang.' });
      }

      // --- HAPUS FILE DARI R2 ---
      if (message.attachments && message.attachments.length > 0) {
        for (const attachment of message.attachments) {
          if (attachment.key) {
            try {
              await deleteFile(attachment.key);
            } catch (err) {
              request.log.error(`Gagal hapus file R2: ${attachment.key}`);
            }
          }
        }
      }

      // --- HARD DELETE dari MongoDB ---
      await Message.deleteOne({ _id: messageId });

      // Update last message di Conversation jika pesan yang dihapus adalah yang terakhir
      const conv = await Conversation.findById(message.conversation_id);
      if (conv && conv.last_message && conv.last_message.toString() === messageId) {
        const prevMessage = await Message.findOne({ conversation_id: message.conversation_id }).sort({ createdAt: -1 });
        conv.last_message = prevMessage ? prevMessage._id : null;
        await conv.save();
      }
    } else {
      await Message.findByIdAndUpdate(messageId, {
        $addToSet: { deleted_by: userId }
      });
    }

    return reply.send({ success: true, message: 'Pesan berhasil dihapus.' });
  } catch (error) {
    return reply.status(500).send({ success: false, message: 'Gagal menghapus pesan.' });
  }
}

/**
 * Mengatur status ngetik di grup
 */
export async function setGroupTypingStatus(request, reply) {
  const userId = request.user.id;
  const { conversationId, isTyping } = request.body;

  try {
    const conv = await Conversation.findOne({ _id: conversationId, participants: userId });
    if (!conv) return reply.status(403).send({ success: false, message: 'Akses ditolak.' });

    // Broadcast status ngetik ke semua orang di grup
    emitGroupTypingStatus(conversationId, userId, isTyping);

    return reply.send({ success: true });
  } catch (error) {
    return reply.status(500).send({ success: false });
  }
}
