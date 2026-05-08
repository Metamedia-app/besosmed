import Conversation from '../../models/Conversation.js';

/**
 * Helper: Mengambil data ringkasan unread untuk satu user
 * (Dipakai oleh API dan Socket.io)
 */
export async function getUnreadSummaryData(userId) {
  const conversations = await Conversation.find({
    participants: userId
  }).select('type unread_counts').lean();

  let total = 0;
  let inbox = 0;
  let group = 0;
  let community = 0;

  conversations.forEach(conv => {
    const count = conv.unread_counts?.[userId] || 0;
    if (count > 0) {
      total += count;
      if (conv.type === 'inbox') inbox += count;
      else if (conv.type === 'group') group += count;
      else if (conv.type === 'community') community += count;
    }
  });

  return {
    total_unread: total,
    categories: {
      inbox,
      group,
      community
    }
  };
}

/**
 * Mengambil ringkasan jumlah pesan belum dibaca (Total & Per Kategori)
 */
export async function getUnreadSummary(request, reply) {
  const userId = request.user.id;

  try {
    const data = await getUnreadSummaryData(userId);
    return reply.send({ success: true, data });
  } catch (error) {
    request.log.error(error);
    return reply.status(500).send({ success: false, message: 'Gagal menghitung pesan belum dibaca.' });
  }
}
