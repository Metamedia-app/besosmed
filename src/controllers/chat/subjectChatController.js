import Subject from '../../models/Subject.js';
import Conversation from '../../models/Conversation.js';
import User from '../../models/User.js';
import Message from '../../models/Message.js';
import { encryptMessage, decryptMessage, encryptBuffer } from '../../services/encryptionService.js';
import { uploadFile, deleteFile } from '../../services/r2Service.js';
import { emitGroupMessage, emitGroupTypingStatus, emitUnreadUpdate } from '../../services/wsService.js';
import { createChatNotificationsBatch, markChatAsRead } from '../../services/notificationService.js';
import { getUnreadSummaryData } from './unreadController.js';

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

  const { 
    subject_name, 
    subject_code, 
    academic_year, 
    lecturer_nim,
    students, 
    duration_minutes,
    expires_at // Format baru: YYYY-MM-DD
  } = request.body; 

  if (!subject_code || !subject_name || !students || !Array.isArray(students)) {
    return reply.status(400).send({ success: false, message: 'Data mata kuliah atau daftar mahasiswa tidak lengkap.' });
  }

  // Hitung waktu kadaluarsa
  let expiresAt = null;
  
  if (expires_at) {
    // Jika admin input tanggal (misal: 2024-12-31)
    expiresAt = new Date(expires_at);
    // Set ke akhir hari (23:59:59) agar adil
    expiresAt.setHours(23, 59, 59, 999);
  } else if (duration_minutes) {
    // Fallback ke durasi menit (untuk testing)
    expiresAt = new Date(Date.now() + parseInt(duration_minutes) * 60000);
  }

  try {
    // 1. Cari atau Buat Mata Kuliah
    let subject = await Subject.findOne({ code: subject_code });
    
    // Cari ID Dosen jika ada lecturer_nim
    let lecturerId = null;
    if (lecturer_nim) {
      const lecturer = await User.findOne({ nim: lecturer_nim, role: 'dosen' });
      if (lecturer) lecturerId = lecturer._id;
    }

    if (!subject) {
      subject = await Subject.create({
        code: subject_code,
        name: subject_name,
        academic_year: academic_year || '2023/2024',
        lecturer_id: lecturerId
      });
    } else if (lecturerId) {
      // Update dosen jika ada perubahan
      subject.lecturer_id = lecturerId;
      await subject.save();
    }

    // 2. Cari atau Buat Percakapan (Group) untuk MK ini
    let conv = await Conversation.findOne({ subject_id: subject._id, type: 'group' });
    
    if (!conv) {
      conv = await Conversation.create({
        type: 'group',
        name: subject.name,
        subject_id: subject._id,
        participants: lecturerId ? [lecturerId] : [], // Masukkan dosen di awal jika ada
        expiresAt: expiresAt 
      });
      // Update referensi balik di Subject
      subject.conversation_id = conv._id;
      await subject.save();
    } else if (expiresAt) {
      // Jika sudah ada tapi admin mengirim durasi baru, update waktunya
      conv.expiresAt = expiresAt;
      await conv.save();
      
      // Update juga SEMUA pesan lama di grup ini agar ikut mati bareng
      await Message.updateMany(
        { conversation_id: conv._id },
        { $set: { expiresAt: expiresAt } }
      );
    }

    // 3. Cari Mahasiswa berdasarkan Daftar NIM (Batch)
    const foundStudents = await User.find({ nim: { $in: students } }).select('_id');
    const studentIds = foundStudents.map(s => s._id);

    if (studentIds.length > 0 || lecturerId) {
      const finalParticipants = lecturerId ? [...studentIds, lecturerId] : studentIds;
      // Tambahkan seluruh mahasiswa & dosen ke grup (hindari duplikat dengan $addToSet)
      await Conversation.findByIdAndUpdate(conv._id, {
        $addToSet: { participants: { $each: finalParticipants } }
      });
    }

    return reply.send({
      success: true,
      message: `Berhasil menambahkan ${studentIds.length} mahasiswa ke grup ${subject_name}.`,
      data: {
        subject_id: subject._id,
        enrolled_count: studentIds.length,
        skipped_count: students.length - studentIds.length
      }
    });

  } catch (err) {
    request.log.error(err);
    return reply.status(500).send({ success: false, message: `Gagal memproses sinkronisasi: ${err.message}` });
  }
}

/**
 * Mengambil daftar grup matkul yang diikuti user
 */
export async function getMySubjectGroups(request, reply) {
  const userId = request.user.id;

  try {
    const groups = await Conversation.find({
      participants: userId,
      type: 'group',
      $or: [
        { expiresAt: null },
        { expiresAt: { $exists: false } },
        { expiresAt: { $gt: new Date() } }
      ]
    })
    .populate('subject_id', 'code name academic_year')
    .populate({
      path: 'last_message',
      select: 'body sender_id createdAt is_deleted_for_everyone deleted_by',
    })
    .sort({ updatedAt: -1 })
    .lean();

    const formatted = await Promise.all(groups.map(async g => {
      const userClearedAt = g.cleared_at?.[userId] || new Date(0);
      
      let finalLastMessage = g.last_message;

      // CEK: Apakah pesan terakhir valid untuk user ini?
      const isInvalid = !finalLastMessage || 
                        (finalLastMessage.deleted_by && finalLastMessage.deleted_by.includes(userId)) || 
                        finalLastMessage.createdAt < userClearedAt;

      if (isInvalid) {
        // Cari pesan terakhir yang BENAR-BENAR valid untuk user ini di grup ini
        finalLastMessage = await Message.findOne({
          conversation_id: g._id,
          deleted_by: { $ne: userId },
          createdAt: { $gt: userClearedAt }
        }).sort({ createdAt: -1 });
      }

      // Dekripsi pesan terakhir untuk preview
      let lastMessagePreview = '';
      if (finalLastMessage) {
        lastMessagePreview = finalLastMessage.is_deleted_for_everyone 
          ? 'Pesan telah ditarik' 
          : decryptMessage(finalLastMessage.body);
      }

      return {
        _id: g._id,
        name: g.name,
        subject_info: g.subject_id,
        avatar_url: g.avatar_url,
        unread_count: g.unread_counts?.[userId] || 0,
        last_message: lastMessagePreview,
        last_message_at: finalLastMessage ? finalLastMessage.createdAt : g.updatedAt,
        expires_at: g.expiresAt,
        is_temporary: !!g.expiresAt
      };
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
        if (part.fieldname === 'body' || part.fieldname === 'content') body = part.value;
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

    // Ambil info grup untuk mendapatkan waktu kadaluarsa (jika ada)
    const conversationInfo = await Conversation.findById(conversationId).select('expiresAt is_muted');

    // --- PROTEKSI MUTE GRUP MATKUL ---
    if (conversationInfo && conversationInfo.is_muted) {
      const userRole = request.user.role;
      if (userRole !== 'admin' && userRole !== 'dosen') {
        return reply.status(403).send({
          success: false,
          message: 'Grup Mata Kuliah sedang di-mute oleh Dosen. Anda tidak dapat mengirim pesan saat ini.'
        });
      }
    }

    // Enkripsi pesan teks
    const encryptedBody = encryptMessage(body);

    const message = await Message.create({
      conversation_id: conversationId,
      sender_id: senderId,
      body: encryptedBody,
      attachments,
      expiresAt: conversationInfo?.expiresAt // Wariskan waktu mati dari grup
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

    // 6. Buat Notifikasi (Massal) untuk semua peserta kecuali pengirim
    const otherParticipants = conv.participants.filter(p => p.toString() !== senderId);
    await createChatNotificationsBatch(otherParticipants, senderId);

    // 7. Emit Real-time Unread Update ke SEMUA penerima
    otherParticipants.forEach(async (pId) => {
      const data = await getUnreadSummaryData(pId.toString());
      emitUnreadUpdate(pId.toString(), data);
    });

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

    // Tandai notifikasi chat sebagai terbaca
    await markChatAsRead(userId);

    // Emit Real-time Unread Update ke user yang membaca
    const unreadData = await getUnreadSummaryData(userId);
    emitUnreadUpdate(userId, unreadData);

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
