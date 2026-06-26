import Message from '../../models/Message.js';
import Conversation from '../../models/Conversation.js';
import ModerationLog from '../../models/ModerationLog.js';
import User from '../../models/User.js';
import mongoose from 'mongoose';
import { generateGroupAnalyticPDF } from '../../services/pdfService.js';

/**
 * Mendapatkan data statistik dasar sebuah grup mata kuliah (JSON)
 * GET /api/v1/admin/groups/:conversationId/analytics
 */
export async function getGroupAnalytics(request, reply) {
  const { conversationId } = request.params;

  try {
    const convId = new mongoose.Types.ObjectId(conversationId);

    // 1. Ambil Info Dasar Grup
    const group = await Conversation.findById(conversationId)
      .populate('subject_id', 'code name code_prodi')
      .lean();

    if (!group) {
      return reply.status(404).send({ success: false, message: 'Grup tidak ditemukan.' });
    }

    // 2. Agregasi Statistik
    const messageStats = await Message.aggregate([
      { $match: { conversation_id: convId } },
      { 
        $group: {
          _id: null,
          total_messages: { $sum: 1 },
          total_media: { 
            $sum: { $cond: [{ $gt: [{ $size: { $ifNull: ["$attachments", []] } }, 0] }, 1, 0] } 
          }
        }
      }
    ]);
    const stats = messageStats[0] || { total_messages: 0, total_media: 0 };

    // 3. Top 5 Kontributor
    const topContributors = await Message.aggregate([
      { $match: { conversation_id: convId } },
      { $group: { _id: "$sender_id", message_count: { $sum: 1 } } },
      { $sort: { message_count: -1 } },
      { $limit: 5 },
      {
        $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' }
      },
      { $unwind: "$user" },
      {
        $project: {
          nama: "$user.nama",
          nim: "$user.nim",
          message_count: 1
        }
      }
    ]);

    const moderationCount = await ModerationLog.countDocuments({ conversation_id: convId });

    // --- LOGIC FALLBACK UNTUK DATA LAMA ---
    let subjectName = group.subject_id?.name;
    let className = group.class_name;
    
    if (!subjectName && group.name) {
      const parts = group.name.split(' - ');
      subjectName = parts[0] || group.name;
      if (!className) className = parts[1] || '-';
    }

    const analyticsData = {
      group_info: {
        name: group.name,
        class: className || '-',
        academic_year: group.academic_year || 'Data Lama (N/A)',
        subject: {
          name: subjectName || 'Tidak Diketahui',
          code: group.subject_id?.code || '-',
          code_prodi: group.subject_id?.code_prodi || '-'
        },
        member_count: group.participants.length
      },
      stats: {
        total_messages: stats.total_messages,
        total_media: stats.total_media,
        bad_words_blocked: moderationCount
      },
      top_contributors: topContributors
    };

    return reply.send({ success: true, data: analyticsData });

  } catch (error) {
    request.log.error(error);
    return reply.status(500).send({ success: false, message: 'Gagal mengambil data analitik.' });
  }
}

/**
 * Ekspor Laporan Analitik Grup ke file PDF
 * GET /api/v1/admin/groups/:conversationId/analytics/pdf
 */
export async function exportGroupAnalyticsPDF(request, reply) {
  const { conversationId } = request.params;

  try {
    const convId = new mongoose.Types.ObjectId(conversationId);

    const group = await Conversation.findById(conversationId)
      .populate('subject_id', 'code name code_prodi')
      .lean();

    if (!group) {
      return reply.status(404).send({ success: false, message: 'Grup tidak ditemukan.' });
    }

    const messageStats = await Message.aggregate([
      { $match: { conversation_id: convId } },
      { 
        $group: {
          _id: null,
          total_messages: { $sum: 1 },
          total_media: { 
            $sum: { $cond: [{ $gt: [{ $size: { $ifNull: ["$attachments", []] } }, 0] }, 1, 0] } 
          }
        }
      }
    ]);
    const stats = messageStats[0] || { total_messages: 0, total_media: 0 };

    const topContributors = await Message.aggregate([
      { $match: { conversation_id: convId } },
      { $group: { _id: "$sender_id", message_count: { $sum: 1 } } },
      { $sort: { message_count: -1 } },
      { $limit: 5 },
      {
        $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' }
      },
      { $unwind: "$user" },
      {
        $project: {
          nama: "$user.nama",
          nim: "$user.nim",
          message_count: 1
        }
      }
    ]);

    const moderationCount = await ModerationLog.countDocuments({ conversation_id: convId });

    // --- LOGIC FALLBACK UNTUK DATA LAMA ---
    let subjectName = group.subject_id?.name;
    let className = group.class_name;
    
    if (!subjectName && group.name) {
      const parts = group.name.split(' - ');
      subjectName = parts[0] || group.name;
      if (!className) className = parts[1] || '-';
    }

    const data = {
      group_info: {
        name: group.name,
        class: className || '-',
        academic_year: group.academic_year || 'Data Lama (N/A)',
        subject: {
          name: subjectName || 'Tidak Diketahui',
          code: group.subject_id?.code || '-',
          code_prodi: group.subject_id?.code_prodi || '-'
        },
        member_count: group.participants.length
      },
      stats: {
        total_messages: stats.total_messages,
        total_media: stats.total_media,
        bad_words_blocked: moderationCount
      },
      top_contributors: topContributors
    };

    // 4. Set Header untuk Download PDF
    reply.type('application/pdf');
    reply.header('Content-Disposition', `attachment; filename="Analytic_${group.name.replace(/\s+/g, '_')}.pdf"`);

    // 5. Generate & Send Stream (Fastify akan menghandle streaming otomatis)
    const pdfStream = generateGroupAnalyticPDF(data);
    return reply.send(pdfStream);

  } catch (error) {
    request.log.error(error);
    return reply.status(500).send({ success: false, message: 'Gagal mengekspor laporan PDF.' });
  }
}
