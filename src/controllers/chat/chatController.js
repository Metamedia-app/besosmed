import Conversation from '../../models/Conversation.js';
import Message from '../../models/Message.js';
import User from '../../models/User.js';
import { encryptMessage, decryptMessage, encryptBuffer, decryptBuffer } from '../../services/encryptionService.js';
import { uploadFile, r2Client, GetObjectCommand, deleteFile } from '../../services/r2Service.js';
import { emitNewMessage, emitTypingStatus, emitUnreadUpdate, emitMessageStatusUpdate, isOnline } from '../../services/wsService.js';
import { createChatNotification, markChatAsRead, triggerPushNotification } from '../../services/notificationService.js';
import { getUnreadSummaryData } from './unreadController.js';
import { containsToxicWords } from '../../utils/badWords.js';

/**
 * Mengambil daftar percakapan (List Inbox)
 */
export async function getConversations(request, reply) {
  const userId = request.user.id;

  try {
    const conversations = await Conversation.find({
      participants: userId,
      type: 'inbox' // Filter hanya percakapan pribadi (Inbox)
    })
      .sort({ updatedAt: -1 })
      .populate('participants', 'nama nim avatar_url')
      .populate({
        path: 'last_message',
        select: 'body sender_id createdAt is_deleted_for_everyone deleted_by',
      })
      .lean();

    const formatted = await Promise.all(conversations.map(async c => {
      // Hilangkan diri sendiri dari daftar partisipan untuk tampilan FE
      const otherUser = c.participants.find(p => p._id.toString() !== userId);
      const userClearedAt = c.cleared_at?.[userId] || new Date(0);
      
      let finalLastMessage = c.last_message;

      // CEK: Apakah pesan terakhir valid untuk user ini?
      // (Bukan ditarik, tidak dihapus 'for me', dan dikirim SETELAH clear chat)
      const isInvalid = !finalLastMessage || 
                        (finalLastMessage.deleted_by && finalLastMessage.deleted_by.includes(userId)) || 
                        (finalLastMessage.createdAt && finalLastMessage.createdAt < userClearedAt);

      if (isInvalid) {
        // Cari pesan terakhir yang BENAR-BENAR valid untuk user ini
        finalLastMessage = await Message.findOne({
          conversation_id: c._id,
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
        _id: c._id,
        user: otherUser,
        last_message: lastMessagePreview,
        last_message_at: finalLastMessage ? finalLastMessage.createdAt : c.updatedAt,
        unread_count: c.unread_counts?.[userId] || 0,
      };
    }));

    return reply.send({ success: true, data: formatted });
  } catch (error) {
    console.error('INBOX_ERROR_DETAIL:', error);
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
  const { before, limit = 30 } = request.query;

  try {
    // 1. Pastikan user adalah peserta percakapan ini dan bertipe INBOX
    const conv = await Conversation.findOne({ 
      _id: conversationId, 
      participants: userId,
      type: 'inbox' 
    });
    
    if (!conv) {
      return reply.status(403).send({ success: false, message: 'Akses ditolak.' });
    }

    // 2. Ambil pesan & Dekripsi (Cursor-based pagination)
    const parsedLimit = Math.min(parseInt(limit) || 30, 100);
    const query = {
      conversation_id: conversationId,
      deleted_by: { $ne: userId },
    };
    // Jika ada cursor 'before', ambil pesan yang lebih LAMA dari ID tersebut
    if (before) {
      query._id = { $lt: before };
    }

    // Ambil limit+1 untuk mendeteksi apakah masih ada pesan lebih lama (has_more)
    const rawMessages = await Message.find(query)
      .sort({ _id: -1 })
      .limit(parsedLimit + 1)
      .lean();

    const has_more = rawMessages.length > parsedLimit;
    const messages = rawMessages.slice(0, parsedLimit).reverse();

    const formatted = messages.map(m => ({
      ...m,
      body: m.is_deleted_for_everyone ? 'Pesan ini telah ditarik' : decryptMessage(m.body),
    }));

    // 3. Reset unread count untuk user ini
    await Conversation.findByIdAndUpdate(conversationId, {
      [`unread_counts.${userId}`]: 0
    });

    // 4. Tandai notifikasi chat sebagai terbaca
    await markChatAsRead(userId);

    // 5. Emit Real-time Unread Update ke user yang membaca
    const unreadData = await getUnreadSummaryData(userId);
    emitUnreadUpdate(userId, unreadData);

    // --- FITUR BARU: Update Status Pesan ke 'read' (Ceklis Biru) ---
    const recipientId = conv.participants.find(p => p.toString() !== userId);
    if (recipientId) {
      const updated = await Message.updateMany(
        { conversation_id: conversationId, sender_id: recipientId, status: { $ne: 'read' } },
        { status: 'read' }
      );

      if (updated.modifiedCount > 0) {
        // Beritahu si pengirim bahwa pesannya sudah dibaca
        emitMessageStatusUpdate(recipientId, conversationId, 'read');
      }
    }

    return reply.send({ success: true, data: formatted, meta: { has_more } });
  } catch (error) {
    return reply.status(500).send({ success: false, message: 'Gagal mengambil riwayat pesan.' });
  }
}

/**
 * Mengirim Pesan (Teks & Media)
 */
export async function sendMessage(request, reply) {
  const senderId = request.user.id;
  
  let recipientId = '';
  let conversationId = '';
  let body = '';
  const attachments = [];

  try {
    // Parse multipart secara manual karena attachFieldsToBody dimatikan
    const parts = request.parts();
    for await (const part of parts) {
      if (part.type === 'field') {
        if (part.fieldname === 'recipientId') recipientId = part.value;
        if (part.fieldname === 'conversationId') conversationId = part.value;
        if (part.fieldname === 'body') body = part.value;
      } else if (part.type === 'file') {
        const chunks = [];
        for await (const chunk of part.file) {
          chunks.push(chunk);
        }
        const buffer = Buffer.concat(chunks);
        
        // --- ENKRIPSI BINER SEBELUM UPLOAD ---
        const encryptedBuffer = encryptBuffer(buffer);
        
        const upload = await uploadFile(encryptedBuffer, part.mimetype, 'inbox');
        
        // Simpan URL Proxy (Backend) bukan URL R2 langsung
        const baseUrl = process.env.APP_URL || `http://${request.hostname}`;
        const proxyUrl = `${baseUrl}/api/v1/chat/media/inbox/${upload.key.split('/').pop()}`;

        attachments.push({
          url: proxyUrl,
          type: upload.type,
          name: part.filename,
          size: buffer.length,
          key: upload.key // Simpan key asli untuk kebutuhan internal
        });
      }
    }

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

    // --- PROTEKSI MUTE GRUP (Hanya untuk grup/community) ---
    const currentConv = await Conversation.findById(convId);
    if (currentConv && currentConv.is_muted) {
      const userRole = request.user.role;
      if (userRole !== 'admin' && userRole !== 'dosen') {
        return reply.status(403).send({
          success: false,
          message: 'Grup sedang di-mute oleh Dosen. Anda tidak dapat mengirim pesan saat ini.'
        });
      }
    }

    // --- FILTER KATA KASAR ---
    if (containsToxicWords(body)) {
      return reply.status(400).send({ success: false, message: 'Pesanmu mengandung kata-kata yang tidak pantas. Mohon gunakan bahasa yang sopan.' });
    }

    // 3. Enkripsi pesan teks
    const encryptedBody = encryptMessage(body);

    // --- CEK APAKAH PENERIMA ONLINE (Untuk Status 'Delivered') ---
    let initialStatus = 'sent';
    const recipientIdForStatus = recipientId || (currentConv ? currentConv.participants.find(p => p.toString() !== senderId) : null);
    
    if (recipientIdForStatus && await isOnline(recipientIdForStatus)) {
      initialStatus = 'delivered';
    }

    // 4. Simpan Pesan
    const newMessage = await Message.create({
      conversation_id: convId,
      sender_id: senderId,
      body: encryptedBody,
      attachments,
      status: initialStatus
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

        // 7. Emit via Socket.io
        emitNewMessage(recipient, {
          ...newMessage.toObject(),
          body: decryptMessage(newMessage.body) 
        });

        // 8. Emit Real-time Unread Update ke penerima
        const unreadData = await getUnreadSummaryData(recipient);
        emitUnreadUpdate(recipient, unreadData);

        // 9. Kirim Push Notification via FCM
        triggerPushNotification(recipient, {
          title: 'Notifikasi',
          body: 'Ada pesan baru untukmu.',
          data: {
            type: 'chat',
            reference_id: conversationId.toString()
          }
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
      
      // --- HAPUS FILE DARI R2 JIKA ADA ATTACHMENTS ---
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

        // LOGIKA BARU: Jika yang dihapus "for me" adalah pesan terakhir, 
        // kita harus update preview 'last_message' agar user tidak melihat "pesan hantu"
        const conv = await Conversation.findById(message.conversation_id);
        if (conv.last_message && conv.last_message.toString() === messageId) {
          // Cari pesan terakhir yang TIDAK ada di list deleted_by user ini
          const prevVisibleMessage = await Message.findOne({ 
            conversation_id: message.conversation_id,
            deleted_by: { $ne: userId }
          }).sort({ createdAt: -1 });

          // Note: Kita tidak bisa update field 'last_message' secara global karena akan berefek ke user lain.
          // Jadi kita biarkan 'last_message' di DB tetap, TAPI saat GET Conversations (list inbox), 
          // kita akan buat logic untuk mencari pesan yang valid buat user tersebut.
        }
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

/**
 * Menghapus percakapan secara permanen (Hard Delete)
 * Menghapus Percakapan, Pesan, dan File di R2
 */
export async function deleteConversation(request, reply) {
  const userId = request.user.id;
  const { conversationId } = request.params;

  try {
    // 1. Cari percakapan & pastikan user adalah peserta
    const conv = await Conversation.findOne({ _id: conversationId, participants: userId });
    if (!conv) {
      return reply.status(404).send({ success: false, message: 'Percakapan tidak ditemukan.' });
    }

    // 2. Ambil semua pesan untuk menghapus file di R2
    const messages = await Message.find({ conversation_id: conversationId });
    
    for (const msg of messages) {
      if (msg.attachments && msg.attachments.length > 0) {
        for (const attachment of msg.attachments) {
          if (attachment.key) {
            // Hapus file dari R2 Cloud Storage
            await deleteFile(attachment.key).catch(err => {
              console.error(`[R2_DELETE_ERR] Gagal hapus file ${attachment.key}:`, err);
            });
          }
        }
      }
    }

    // 3. Hapus semua pesan dari MongoDB
    await Message.deleteMany({ conversation_id: conversationId });

    // 4. Hapus Dokumen Percakapan itu sendiri (Agar hilang dari list)
    await Conversation.findByIdAndDelete(conversationId);

    return reply.send({ 
      success: true, 
      message: 'Percakapan dan seluruh isinya telah dihapus permanen.' 
    });

  } catch (error) {
    return reply.status(500).send({ success: false, message: 'Gagal menghapus percakapan.' });
  }
}

/**
 * Mendapatkan ID Percakapan dengan user tertentu (Direct DM dari Profil)
 * Jika sudah ada, kembalikan ID-nya. Jika belum, buat baru.
 */
export async function getConversationWithUser(request, reply) {
  const userId = request.user.id;
  const { targetUserId } = request.params;

  try {
    // 1. Validasi: Jangan chat diri sendiri
    if (userId === targetUserId) {
      return reply.status(400).send({ success: false, message: 'Anda tidak dapat memulai percakapan dengan diri sendiri.' });
    }

    // 2. Cari apakah sudah ada percakapan pribadi (inbox) antara dua user ini
    let conv = await Conversation.findOne({
      type: 'inbox',
      participants: { $all: [userId, targetUserId] }
    });

    let isNew = false;
    if (!conv) {
      // 3. Jika belum ada, buat baru (Opsi A sesuai permintaan User)
      conv = await Conversation.create({
        type: 'inbox',
        participants: [userId, targetUserId]
      });
      isNew = true;
    }

    return reply.send({
      success: true,
      message: isNew ? 'Percakapan baru berhasil dibuat' : 'Percakapan ditemukan',
      data: {
        conversation_id: conv._id,
        is_new: isNew
      }
    });

  } catch (error) {
    request.log.error(error);
    return reply.status(500).send({ success: false, message: 'Terjadi kesalahan saat memproses permintaan DM.' });
  }
}

/**
 * Proxy Media: Ambil dari R2 -> Dekripsi -> Kirim ke User
 * URL: /api/v1/chat/media/:folder/:filename
 */
export async function getMedia(request, reply) {
  const { folder, filename } = request.params;
  const key = `massage/${folder}/${filename}`;

  try {
    // 1. Ambil data terenkripsi dari R2 menggunakan Client yang sudah diekspor
    const command = new GetObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: key,
    });

    const { Body, ContentType } = await r2Client.send(command);

    if (!Body) {
      return reply.status(404).send({ success: false, message: 'File tidak ditemukan.' });
    }

    // Convert stream ke buffer
    const chunks = [];
    for await (const chunk of Body) {
      chunks.push(chunk);
    }
    const encryptedBuffer = Buffer.concat(chunks);

    // 2. Dekripsi Buffer
    const decryptedBuffer = decryptBuffer(encryptedBuffer);

    // 3. Kirim ke user dengan tipe konten yang sesuai
    return reply
      .type(ContentType)
      .header('Cache-Control', 'public, max-age=86400') // Cache 24 jam agar BE tidak berat
      .send(decryptedBuffer);

  } catch (error) {
    request.log.error(error);
    return reply.status(500).send({ success: false, message: 'Gagal memuat media.' });
  }
}

/**
 * Menandai semua pesan dalam percakapan Inbox sebagai 'read'
 * PATCH /api/v1/chat/inbox/:conversationId/read
 */
export async function markInboxAsRead(request, reply) {
  const userId = request.user.id;
  const { conversationId } = request.params;

  try {
    const conv = await Conversation.findOne({ _id: conversationId, participants: userId });
    if (!conv) return reply.status(404).send({ success: false, message: 'Percakapan tidak ditemukan.' });

    // 1. Reset unread count untuk user ini
    await Conversation.findByIdAndUpdate(conversationId, {
      [`unread_counts.${userId}`]: 0
    });

    // 2. Tandai notifikasi chat sebagai terbaca
    await markChatAsRead(userId);

    // 3. Update status pesan dari lawan bicara menjadi 'read'
    const recipientId = conv.participants.find(p => p.toString() !== userId);
    if (recipientId) {
      const updated = await Message.updateMany(
        { conversation_id: conversationId, sender_id: recipientId, status: { $ne: 'read' } },
        { status: 'read' }
      );

      if (updated.modifiedCount > 0) {
        // Beritahu si pengirim via Socket
        emitMessageStatusUpdate(recipientId, conversationId, 'read');
      }
    }

    // 4. Update Badge unread global
    const unreadData = await getUnreadSummaryData(userId);
    emitUnreadUpdate(userId, unreadData);

    return reply.send({ success: true, message: 'Percakapan ditandai sebagai dibaca.' });
  } catch (error) {
    return reply.status(500).send({ success: false, message: 'Gagal menandai pesan.' });
  }
}
