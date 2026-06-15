import Conversation from '../../models/Conversation.js';
import Message from '../../models/Message.js';
import User from '../../models/User.js';
import { encryptMessage, decryptMessage, encryptBuffer } from '../../services/encryptionService.js';
import { uploadFile, deleteFile } from '../../services/r2Service.js';
import { emitGroupMessage, emitGroupTypingStatus, emitUnreadUpdate, emitMessageStatusUpdate } from '../../services/wsService.js';
import { createChatNotificationsBatch, markChatAsRead, triggerPushNotificationBatch } from '../../services/notificationService.js';
import { getUnreadSummaryData } from './unreadController.js';
import { containsToxicWords } from '../../utils/badWords.js';

/**
 * 1. Membuat Komunitas Baru
 */
export async function createCommunity(request, reply) {
  const creatorId = request.user.id;
  let name = '';
  let description = '';
  let avatarUrl = '';
  let avatarKey = '';
  let initialMembers = [];

  try {
    const parts = request.parts();
    for await (const part of parts) {
      if (part.type === 'field') {
        if (part.fieldname === 'name') name = part.value;
        if (part.fieldname === 'description') description = part.value;
        if (part.fieldname === 'members') {
          try {
            const raw = part.value.trim();
            initialMembers = JSON.parse(raw);
            console.log('[Community] Parsed members NIM:', initialMembers);
          } catch (e) {
            // Fallback: coba ekstrak NIM dengan regex (handle encoding issue dari Swagger)
            const matches = part.value.match(/\d{9,15}/g);
            initialMembers = matches || [];
            console.log('[Community] Fallback regex members NIM:', initialMembers);
          }
        }
      } else if (part.type === 'file' && part.fieldname === 'avatar') {
        const chunks = [];
        for await (const chunk of part.file) chunks.push(chunk);
        const buffer = Buffer.concat(chunks);
        
        // Enkripsi Avatar sebelum upload (Optional but following user request for full encryption)
        const encryptedBuffer = encryptBuffer(buffer);
        const upload = await uploadFile(encryptedBuffer, part.mimetype, 'community');
        
        const baseUrl = process.env.APP_URL || `http://${request.hostname}`;
        avatarUrl = `${baseUrl}/api/v1/chat/media/community/${upload.key.split('/').pop()}`;
        avatarKey = upload.key;
      }
    }

    if (!name) {
      return reply.status(400).send({ success: false, message: 'Nama komunitas diperlukan.' });
    }

    // Cari _id berdasarkan array NIM yang dikirim user
    let memberIds = [];
    let notFoundNims = [];
    if (initialMembers.length > 0) {
      const foundUsers = await User.find({ nim: { $in: initialMembers } }).select('_id nim nama');
      const foundNims = foundUsers.map(u => u.nim);
      memberIds = foundUsers.map(u => u._id.toString());
      // Cari NIM yang tidak ketemu
      notFoundNims = initialMembers.filter(nim => !foundNims.includes(nim));
    }

    const participants = Array.from(new Set([creatorId, ...memberIds]));

    const community = await Conversation.create({
      type: 'community',
      name,
      description,
      avatar_url: avatarUrl,
      creator_id: creatorId,
      admins: [creatorId],
      participants: participants
    });

    // Pesan warning kalau ada NIM yang salah / tidak ditemukan
    const message = notFoundNims.length > 0
      ? `Komunitas berhasil dibuat. NIM tidak ditemukan dan dilewati: ${notFoundNims.join(', ')}`
      : 'Komunitas berhasil dibuat.';

    return reply.status(201).send({
      success: true,
      message,
      data: {
        ...community.toObject(),
        added_member_count: memberIds.length,
        not_found_nims: notFoundNims
      }
    });
  } catch (error) {
    request.log.error(error);
    return reply.status(500).send({ success: false, message: 'Gagal membuat komunitas.' });
  }
}

/**
 * 2. Mengambil Daftar Komunitas yang Diikuti
 */
export async function getMyCommunities(request, reply) {
  const userId = request.user.id;

  try {
    const communities = await Conversation.find({
      participants: userId,
      type: 'community'
    })
    .populate('creator_id', 'nama nim avatar_url')
    .populate({
      path: 'last_message',
      select: 'body sender_id createdAt is_deleted_for_everyone deleted_by',
    })
    .sort({ updatedAt: -1 })
    .lean();

    const formatted = await Promise.all(communities.map(async c => {
      const userClearedAt = c.cleared_at?.[userId] || new Date(0);
      
      let finalLastMessage = c.last_message;

      // CEK: Apakah pesan terakhir valid untuk user ini?
      const isInvalid = !finalLastMessage || 
                        (finalLastMessage.deleted_by && finalLastMessage.deleted_by.includes(userId)) || 
                        (finalLastMessage.createdAt && finalLastMessage.createdAt < userClearedAt);

      if (isInvalid) {
        // Cari pesan terakhir yang BENAR-BENAR valid untuk user ini di komunitas ini
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
        ...c,
        creator: c.creator_id,
        creator_id: undefined,
        last_message: lastMessagePreview,
        last_message_at: finalLastMessage ? finalLastMessage.createdAt : c.updatedAt,
        unread_count: c.unread_counts?.[userId] || 0,
      };
    }));

    return reply.send({ success: true, data: formatted });
  } catch (error) {
    request.log.error(error);
    return reply.status(500).send({ success: false, message: 'Gagal mengambil daftar komunitas.' });
  }
}

/**
 * 2b. Detail Komunitas (Member List, Count, Info Lengkap)
 */
export async function getCommunityDetail(request, reply) {
  const userId = request.user.id;
  const { communityId } = request.params;

  try {
    const community = await Conversation.findOne({
      _id: communityId,
      type: 'community',
      participants: userId // Hanya member yang bisa lihat detail
    })
    .populate('creator_id', 'nama nim avatar_url')
    .populate('admins', 'nama nim avatar_url')
    .populate('participants', 'nama nim avatar_url')
    .lean();

    if (!community) {
      return reply.status(404).send({ success: false, message: 'Komunitas tidak ditemukan atau Anda bukan anggotanya.' });
    }

    return reply.send({
      success: true,
      data: {
        _id: community._id,
        name: community.name,
        description: community.description,
        avatar_url: community.avatar_url,
        creator: community.creator_id,
        admins: community.admins,
        members: community.participants,
        member_count: community.participants.length,
        createdAt: community.createdAt,
        updatedAt: community.updatedAt
      }
    });
  } catch (error) {
    return reply.status(500).send({ success: false, message: 'Gagal mengambil detail komunitas.' });
  }
}

/**
 * 3. Mengambil Riwayat Pesan Komunitas
 */
export async function getCommunityMessages(request, reply) {
  const userId = request.user.id;
  const { communityId } = request.params;
  const { limit = 30, skip = 0 } = request.query;

  try {
    // Pastikan user adalah member komunitas
    const conv = await Conversation.findOne({ 
      _id: communityId, 
      participants: userId, 
      type: 'community' 
    });
    if (!conv) return reply.status(403).send({ success: false, message: 'Akses ditolak. Anda bukan anggota komunitas ini.' });

    const messages = await Message.find({
      conversation_id: communityId,
      deleted_by: { $ne: userId } // Jangan tampilkan pesan yang sudah dihapus "for me"
    })
    .sort({ createdAt: -1 })
    .skip(parseInt(skip))
    .limit(parseInt(limit))
    .populate('sender_id', 'nama nim avatar_url')
    .lean();

    // Dekripsi semua pesan
    const formatted = messages.map(m => ({
      ...m,
      body: m.is_deleted_for_everyone ? 'Pesan ini telah ditarik' : decryptMessage(m.body),
    })).reverse(); // Balik urutan: lama ke baru

    // Reset unread count
    await Conversation.findByIdAndUpdate(communityId, {
      [`unread_counts.${userId}`]: 0
    });

    // Tandai notifikasi chat sebagai terbaca
    await markChatAsRead(userId);

    // Emit Real-time Unread Update ke user yang membaca
    const unreadData = await getUnreadSummaryData(userId);
    emitUnreadUpdate(userId, unreadData);

    // --- FITUR BARU: Update read_by & Ceklis Biru (Read by Everyone) ---
    const convForRead = await Conversation.findById(communityId);
    if (convForRead) {
      const messagesToUpdate = await Message.find({
        conversation_id: communityId,
        sender_id: { $ne: userId },
        read_by: { $ne: userId }
      });

      const totalParticipants = convForRead.participants.length;
      for (const msg of messagesToUpdate) {
        msg.read_by.addToSet(userId);
        if (msg.read_by.length >= totalParticipants) {
          msg.status = 'read';
          emitMessageStatusUpdate(msg.sender_id, communityId, 'read');
        }
        await msg.save();
      }
    }

    return reply.send({ 
      success: true, 
      data: formatted,
      meta: {
        total: formatted.length,
        limit: parseInt(limit),
        skip: parseInt(skip)
      }
    });
  } catch (error) {
    request.log.error(error);
    return reply.status(500).send({ success: false, message: 'Gagal mengambil riwayat pesan.' });
  }
}

/**
 * 4. Mengirim Pesan ke Komunitas
 */
export async function sendCommunityMessage(request, reply) {
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
        for await (const chunk of part.file) chunks.push(chunk);
        const buffer = Buffer.concat(chunks);
        
        // --- ENKRIPSI BINER R2 ---
        const encryptedBuffer = encryptBuffer(buffer);
        const upload = await uploadFile(encryptedBuffer, part.mimetype, 'community');
        
        const baseUrl = process.env.APP_URL || `http://${request.hostname}`;
        const proxyUrl = `${baseUrl}/api/v1/chat/media/community/${upload.key.split('/').pop()}`;

        attachments.push({
          url: proxyUrl,
          type: upload.type,
          name: part.filename,
          size: buffer.length,
          key: upload.key
        });
      }
    }

    if (!conversationId) return reply.status(400).send({ success: false, message: 'ID Komunitas diperlukan.' });

    // --- FILTER KATA KASAR ---
    if (containsToxicWords(body)) {
      return reply.status(400).send({ success: false, message: 'Pesanmu mengandung kata-kata yang tidak pantas. Mohon gunakan bahasa yang sopan.' });
    }

    // Enkripsi teks
    const encryptedBody = encryptMessage(body);

    const message = await Message.create({
      conversation_id: conversationId,
      sender_id: senderId,
      body: encryptedBody,
      attachments,
      read_by: [senderId] // Pengirim otomatis dianggap sudah baca
    });

    // Update last_message & unread counts
    const conv = await Conversation.findById(conversationId);
    if (!conv) return reply.status(404).send({ success: false, message: 'Komunitas tidak ditemukan.' });

    conv.last_message = message._id;
    conv.participants.forEach(pId => {
      const pIdStr = pId.toString();
      if (pIdStr !== senderId) {
        const currentCount = conv.unread_counts.get(pIdStr) || 0;
        conv.unread_counts.set(pIdStr, currentCount + 1);
      }
    });
    await conv.save();

    // 6. Siapkan daftar penerima (kecuali pengirim)
    const otherParticipants = conv.participants.filter(p => p.toString() !== senderId);

    // 7. Emit Real-time Unread Update ke SEMUA penerima
    otherParticipants.forEach(async (pId) => {
      const data = await getUnreadSummaryData(pId.toString());
      emitUnreadUpdate(pId.toString(), data);
    });

    // 8. Kirim Push Notification via FCM ke SEMUA penerima
    triggerPushNotificationBatch(otherParticipants, {
      title: 'Notifikasi',
      body: 'Ada pesan baru untukmu.',
      data: {
        type: 'chat',
        reference_id: conversationId.toString()
      }
    });

    await message.populate('sender_id', 'nama nim avatar_url');

    // Broadcast via Socket.io (kirim teks asli ke semua member)
    emitGroupMessage(conversationId, {
      ...message.toObject(),
      body: body
    });

    return reply.status(201).send({ 
      success: true, 
      data: {
        ...message.toObject(),
        body: body  // Kembalikan teks asli ke pengirim, bukan enkripsi
      }
    });
  } catch (error) {
    request.log.error(error);
    return reply.status(500).send({ success: false, message: 'Gagal mengirim pesan komunitas.' });
  }
}

/**
 * 4. Menghapus Pesan (Me / Everyone)
 */
export async function deleteCommunityMessage(request, reply) {
  const userId = request.user.id;
  const { messageId } = request.params;
  const { type } = request.body; // 'me' | 'everyone'

  try {
    const message = await Message.findById(messageId);
    if (!message) return reply.status(404).send({ success: false, message: 'Pesan tidak ditemukan.' });

    if (type === 'everyone') {
      // Hanya pengirim yang bisa tarik pesan
      if (message.sender_id.toString() !== userId) {
        return reply.status(403).send({ success: false, message: 'Hanya pengirim yang bisa menarik pesan.' });
      }

      // --- HAPUS FILE DARI R2 ---
      if (message.attachments && message.attachments.length > 0) {
        for (const attachment of message.attachments) {
          if (attachment.key) {
            await deleteFile(attachment.key).catch(err => console.error('R2_DELETE_ERR:', err));
          }
        }
      }

      // Hard Delete
      await Message.deleteOne({ _id: messageId });
    } else {
      // Delete for me
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
 * 5. Invite Member ke Komunitas (Admin Only)
 */
export async function inviteToCommunity(request, reply) {
  const adminId = request.user.id;
  const { communityId, nim } = request.body;

  try {
    const community = await Conversation.findById(communityId);
    if (!community || community.type !== 'community') {
      return reply.status(404).send({ success: false, message: 'Komunitas tidak ditemukan.' });
    }

    if (community.is_default_alumni) {
      return reply.status(403).send({ success: false, message: 'Grup alumni dikelola otomatis oleh sistem. Anda tidak bisa menambah anggota.' });
    }

    // Cek apakah yang invite adalah Admin
    if (!community.admins.map(a => a.toString()).includes(adminId)) {
      return reply.status(403).send({ success: false, message: 'Hanya Admin yang dapat mengundang anggota.' });
    }

    // Cari user berdasarkan NIM
    const targetUser = await User.findOne({ nim }).select('_id nama nim');
    if (!targetUser) {
      return reply.status(404).send({ success: false, message: `User dengan NIM ${nim} tidak ditemukan.` });
    }

    // Cek apakah sudah jadi member
    if (community.participants.map(p => p.toString()).includes(targetUser._id.toString())) {
      return reply.status(400).send({ success: false, message: 'User ini sudah menjadi anggota komunitas.' });
    }

    // Tambahkan ke participants
    await Conversation.findByIdAndUpdate(communityId, {
      $addToSet: { participants: targetUser._id }
    });

    return reply.send({ 
      success: true, 
      message: `${targetUser.nama} berhasil diundang ke komunitas.`,
      data: { user_id: targetUser._id, nama: targetUser.nama, nim: targetUser.nim }
    });
  } catch (error) {
    return reply.status(500).send({ success: false, message: 'Gagal mengundang anggota.' });
  }
}

/**
 * 6. Kick Member dari Komunitas (Admin Only)
 */
export async function kickFromCommunity(request, reply) {
  const adminId = request.user.id;
  const { communityId, userId } = request.params;

  try {
    const community = await Conversation.findById(communityId);
    if (!community) return reply.status(404).send({ success: false, message: 'Komunitas tidak ditemukan.' });

    if (community.is_default_alumni) {
      return reply.status(403).send({ success: false, message: 'Anda tidak dapat keluar atau dikeluarkan dari grup Alumni.' });
    }

    // Cek apakah Admin
    if (!community.admins.includes(adminId)) {
      return reply.status(403).send({ success: false, message: 'Hanya Admin yang dapat mengeluarkan anggota.' });
    }

    // Tidak bisa kick diri sendiri (Pencipta)
    if (community.creator_id.toString() === userId) {
      return reply.status(400).send({ success: false, message: 'Tidak dapat mengeluarkan pencipta komunitas.' });
    }

    // Hapus dari participants & admins
    await Conversation.findByIdAndUpdate(communityId, {
      $pull: { participants: userId, admins: userId }
    });

    return reply.send({ success: true, message: 'Anggota berhasil dikeluarkan.' });
  } catch (error) {
    return reply.status(500).send({ success: false, message: 'Gagal mengeluarkan anggota.' });
  }
}

/**
 * 7. Hapus Komunitas (Hanya Creator)
 */
export async function deleteCommunity(request, reply) {
  const userId = request.user.id;
  const { communityId } = request.params;

  try {
    const community = await Conversation.findById(communityId);
    if (!community || community.type !== 'community') {
      return reply.status(404).send({ success: false, message: 'Komunitas tidak ditemukan.' });
    }

    if (community.is_default_alumni) {
      return reply.status(403).send({ success: false, message: 'Grup Alumni adalah bagian dari sistem dan tidak boleh dihapus.' });
    }

    // Hanya Creator yang bisa hapus komunitas
    if (community.creator_id.toString() !== userId) {
      return reply.status(403).send({ success: false, message: 'Hanya pencipta komunitas yang dapat menghapus komunitas ini.' });
    }

    // Hapus semua file media dari R2 terlebih dahulu
    const messages = await Message.find({ conversation_id: communityId });
    for (const msg of messages) {
      if (msg.attachments && msg.attachments.length > 0) {
        for (const attachment of msg.attachments) {
          if (attachment.key) {
            await deleteFile(attachment.key).catch(err => console.error('[R2] Gagal hapus file:', err));
          }
        }
      }
    }

    // Hapus avatar komunitas dari R2 (jika ada)
    if (community.avatar_url) {
      const urlParts = community.avatar_url.split('/api/v1/chat/media/community/');
      if (urlParts[1]) {
        const avatarKey = `massage/community/${urlParts[1]}`;
        await deleteFile(avatarKey).catch(err => console.error('[R2] Gagal hapus avatar:', err));
      }
    }

    // Hard delete semua pesan komunitas dari MongoDB
    await Message.deleteMany({ conversation_id: communityId });

    // Hard delete komunitas itu sendiri
    await Conversation.findByIdAndDelete(communityId);

    return reply.send({ success: true, message: 'Komunitas berhasil dihapus beserta seluruh isinya.' });
  } catch (error) {
    request.log.error(error);
    return reply.status(500).send({ success: false, message: 'Gagal menghapus komunitas.' });
  }
}

/**
 * 8. Typing Indicator untuk Komunitas (Real-time)
 */
export async function setCommunityTypingStatus(request, reply) {
  const userId = request.user.id;
  const { conversationId, isTyping } = request.body;

  try {
    // Pastikan user adalah member komunitas ini
    const conv = await Conversation.findOne({ _id: conversationId, participants: userId, type: 'community' });
    if (!conv) return reply.status(403).send({ success: false, message: 'Akses ditolak.' });

    // Broadcast typing ke semua orang di room komunitas
    emitGroupTypingStatus(conversationId, userId, isTyping);

    return reply.send({ success: true });
  } catch (error) {
    return reply.status(500).send({ success: false });
  }
}

/**
 * Menandai semua pesan komunitas sebagai dibaca oleh user ini
 * PATCH /api/v1/chat/communities/:communityId/read
 */
export async function markCommunityAsRead(request, reply) {
  const userId = request.user.id;
  const { communityId } = request.params;

  try {
    const conv = await Conversation.findOne({ _id: communityId, participants: userId, type: 'community' });
    if (!conv) return reply.status(404).send({ success: false, message: 'Komunitas tidak ditemukan.' });

    // 1. Reset unread count
    await Conversation.findByIdAndUpdate(communityId, {
      [`unread_counts.${userId}`]: 0
    });

    // 2. Tandai notifikasi chat sebagai terbaca
    await markChatAsRead(userId);

    // 3. Update badge realtime
    const unreadData = await getUnreadSummaryData(userId);
    emitUnreadUpdate(userId, unreadData);

    // 4. Update read_by untuk semua pesan yang belum terbaca
    const messagesToUpdate = await Message.find({
      conversation_id: communityId,
      sender_id: { $ne: userId },
      read_by: { $ne: userId }
    });

    const totalParticipants = conv.participants.length;
    for (const msg of messagesToUpdate) {
      msg.read_by.addToSet(userId);
      if (msg.read_by.length >= totalParticipants) {
        msg.status = 'read';
        emitMessageStatusUpdate(msg.sender_id, communityId, 'read');
      }
      await msg.save();
    }

    return reply.send({ success: true, message: 'Pesan komunitas ditandai sebagai dibaca.' });
  } catch (error) {
    return reply.status(500).send({ success: false, message: 'Gagal menandai pesan.' });
  }
}
