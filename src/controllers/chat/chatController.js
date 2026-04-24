import Conversation from '../../models/Conversation.js';
import Message from '../../models/Message.js';
import User from '../../models/User.js';
import { encryptMessage, decryptMessage } from '../../services/encryptionService.js';
import { uploadFile } from '../../services/r2Service.js';
import { emitNewMessage, emitTypingStatus } from '../../services/wsService.js';

/**
 * Mengambil daftar percakapan (List Inbox)
 */
export async function getConversations(request, reply) {
  const userId = request.user.id;

  try {
    const conversations = await Conversation.find({
      participants: userId,
    })
      .sort({ updatedAt: -1 })
      .populate('participants', 'nama nim avatar_url')
      .populate({
        path: 'last_message',
        select: 'body sender_id createdAt is_deleted_for_everyone',
      })
      .lean();

    const formatted = conversations.map(c => {
      // Hilangkan diri sendiri dari daftar partisipan untuk tampilan FE
      const otherUser = c.participants.find(p => p._id.toString() !== userId);
      
      // Dekripsi pesan terakhir untuk preview
      let lastMessagePreview = '';
      if (c.last_message) {
        lastMessagePreview = c.last_message.is_deleted_for_everyone 
          ? 'Pesan telah ditarik' 
          : decryptMessage(c.last_message.body);
      }

      return {
        _id: c._id,
        user: otherUser,
        last_message: lastMessagePreview,
        last_message_at: c.updatedAt,
        unread_count: c.unread_counts?.[userId] || 0,
      };
    });

    return reply.send({ success: true, data: formatted });
  } catch (error) {
    request.log.error(error);
    return reply.status(500).send({ success: false, message: 'Gagal mengambil daftar pesan.' });
  }
}

/**
 * Mengambil riwayat pesan dalam satu percakapan
 */
export async function getMessages(request, reply) {
  const userId = request.user.id;
  const { conversationId } = request.params;
  const { limit = 30, skip = 0 } = request.query;

  try {
    // 1. Pastikan user adalah peserta percakapan ini
    const conv = await Conversation.findOne({ _id: conversationId, participants: userId });
    if (!conv) {
      return reply.status(403).send({ success: false, message: 'Akses ditolak.' });
    }

    // 2. Ambil pesan & Dekripsi
    const messages = await Message.find({
      conversation_id: conversationId,
      deleted_by: { $ne: userId }, // Jangan ambil pesan yang sudah dihapus "for me"
    })
      .sort({ createdAt: -1 })
      .skip(parseInt(skip))
      .limit(parseInt(limit))
      .lean();

    const formatted = messages.map(m => ({
      ...m,
      body: m.is_deleted_for_everyone ? 'Pesan ini telah ditarik' : decryptMessage(m.body),
    })).reverse();

    // 3. Reset unread count untuk user ini
    await Conversation.findByIdAndUpdate(conversationId, {
      [`unread_counts.${userId}`]: 0
    });

    return reply.send({ success: true, data: formatted });
  } catch (error) {
    return reply.status(500).send({ success: false, message: 'Gagal mengambil riwayat pesan.' });
  }
}

/**
 * Mengirim Pesan (Teks & Media)
 */
export async function sendMessage(request, reply) {
  const senderId = request.user.id;
  
  // Karena attachFieldsToBody: true, data ada di .value
  // Tambahkan optional chaining (?.) agar tidak crash jika body kosong
  const recipientId = request.body?.recipientId?.value;
  const conversationId = request.body?.conversationId?.value;
  const body = request.body?.body?.value || '';
  
  // Ambil files dengan lebih aman
  let rawFiles = request.body?.files;
  if (rawFiles && !Array.isArray(rawFiles)) {
    rawFiles = [rawFiles];
  }
  const files = (rawFiles || []).filter(f => f && f.type === 'file');

  try {
    let convId = conversationId;

    if (!recipientId && !convId) {
      return reply.status(400).send({ success: false, message: 'RecipientId atau ConversationId diperlukan.' });
    }

    // 1. Cari atau Buat Percakapan baru jika belum ada
    if (!convId && recipientId) {
      let conv = await Conversation.findOne({
        type: 'inbox',
        participants: { $all: [senderId, recipientId] }
      });

      if (!conv) {
        conv = await Conversation.create({
          participants: [senderId, recipientId],
          type: 'inbox'
        });
      }
      convId = conv._id;
    }

    // 2. Upload lampiran jika ada
    const attachments = [];
    for (const file of files) {
      const fileBuffer = await file.toBuffer(); // Ambil buffer dari multipart
      const upload = await uploadFile(fileBuffer, file.mimetype, 'inbox');
      attachments.push({
        url: upload.url,
        type: upload.type,
        name: file.filename,
        size: fileBuffer.length
      });
    }

    // 3. Enkripsi pesan teks
    const encryptedBody = encryptMessage(body);

    // 4. Simpan Pesan
    const newMessage = await Message.create({
      conversation_id: convId,
      sender_id: senderId,
      body: encryptedBody,
      attachments
    });

    // 5. Update Conversation (Last Message & Unread Count untuk penerima)
    const conv = await Conversation.findById(convId);
    if (conv) {
      const recipient = conv.participants.find(p => p.toString() !== senderId);
      if (recipient) {
        await Conversation.findByIdAndUpdate(convId, {
          last_message: newMessage._id,
          $inc: { [`unread_counts.${recipient}`]: 1 }
        });

        // 6. Emit via Socket.io
        emitNewMessage(recipient, {
          ...newMessage.toObject(),
          body: decryptMessage(newMessage.body) 
        });
      }
    }

    return reply.status(201).send({
      success: true,
      data: { 
        ...newMessage.toObject(), 
        body: decryptMessage(newMessage.body) 
      }
    });

  } catch (error) {
    console.error('CHAT_ERROR_DETAIL:', error);
    request.log.error(error);
    return reply.status(500).send({ success: false, message: 'Gagal mengirim pesan.', error: error.message });
  }
}

/**
 * Update Status Mengetik
 */
export async function setTypingStatus(request, reply) {
  const { conversationId, isTyping } = request.body;
  const userId = request.user.id;

  try {
    const conv = await Conversation.findById(conversationId).lean();
    const recipient = conv.participants.find(p => p.toString() !== userId);
    
    if (recipient) {
      emitTypingStatus(recipient, conversationId, isTyping);
    }
    
    return reply.send({ success: true });
  } catch (error) {
    return reply.status(500).send({ success: false });
  }
}

/**
 * Menghapus pesan (Per Pesan)
 * type: 'me' | 'everyone'
 */
export async function deleteMessage(request, reply) {
  const userId = request.user.id;
  const { messageId } = request.params;
  const { type = 'me' } = request.body;

  try {
    const message = await Message.findById(messageId);
    if (!message) return reply.status(404).send({ success: false, message: 'Pesan tidak ditemukan.' });

    if (type === 'everyone') {
      // 1. Validasi: Hanya pengirim yang bisa tarik pesan
      if (message.sender_id.toString() !== userId) {
        return reply.status(403).send({ success: false, message: 'Hanya pengirim yang bisa menarik pesan.' });
      }
      
      // HARD DELETE dari MongoDB
      await Message.deleteOne({ _id: messageId });

      // Update last message di Conversation jika pesan yang dihapus adalah yang terakhir
      const conv = await Conversation.findById(message.conversation_id);
      if (conv.last_message && conv.last_message.toString() === messageId) {
        const prevMessage = await Message.findOne({ conversation_id: message.conversation_id }).sort({ createdAt: -1 });
        await Conversation.findByIdAndUpdate(message.conversation_id, {
          last_message: prevMessage ? prevMessage._id : null
        });
      }
    } else {
      // 2. Hapus untuk saya saja (Sembunyikan dari list)
      if (!message.deleted_by.includes(userId)) {
        message.deleted_by.push(userId);
        await message.save();
      }
    }

    return reply.send({ success: true, message: `Pesan berhasil dihapus (${type}).` });
  } catch (error) {
    return reply.status(500).send({ success: false, message: 'Gagal menghapus pesan.' });
  }
}

/**
 * Membersihkan seluruh obrolan (Hanya di sisi user tersebut)
 */
export async function clearConversation(request, reply) {
  const userId = request.user.id;
  const { conversationId } = request.params;

  try {
    // 1. Tandai waktu penghapusan dan update cleared_at
    const conv = await Conversation.findByIdAndUpdate(
      conversationId, 
      { [`cleared_at.${userId}`]: new Date() },
      { new: true }
    );

    // 2. Tambahkan userId ke semua pesan di percakapan ini ke dalam 'deleted_by'
    await Message.updateMany(
      { conversation_id: conversationId, deleted_by: { $ne: userId } },
      { $push: { deleted_by: userId } }
    );

    // 3. LOGIKA PINTAR: Cek apakah SEMUA partisipan sudah klik Clear Chat?
    // Jika sudah, kita Hard Delete semua pesan di percakapan ini agar MongoDB bersih.
    const allCleared = conv.participants.every(p => conv.cleared_at.has(p.toString()));
    
    if (allCleared) {
      await Message.deleteMany({ conversation_id: conversationId });
      // Reset last message dan cleared_at karena sudah benar-benar kosong
      await Conversation.findByIdAndUpdate(conversationId, {
        last_message: null,
        unread_counts: {},
        cleared_at: {} 
      });
    }

    return reply.send({ success: true, message: 'Obrolan telah dibersihkan.' });
  } catch (error) {
    request.log.error(error);
    return reply.status(500).send({ success: false, message: 'Gagal membersihkan obrolan.' });
  }
}
