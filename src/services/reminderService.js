import Assignment from '../models/Assignment.js';
import { emitAssignmentReminder } from './wsService.js';

/**
 * Memulai pengecekan deadline tugas secara berkala (setiap 1 menit)
 */
export function startReminderService() {
  console.log('[ReminderService] Smart Reminder Service started.');
  
  setInterval(async () => {
    try {
      const now = new Date();
      
      // Cari tugas yang aktif dan belum lewat deadline
      const assignments = await Assignment.find({
        is_active: true,
        due_date: { $gt: now }
      });

      for (const assignment of assignments) {
        const diffMs = assignment.due_date - now;
        const diffMin = Math.round(diffMs / 60000);

        // Logic 30 Menit
        if (diffMin <= 30 && diffMin > 25 && !assignment.reminders_sent.thirty_min) {
          await sendReminder(assignment, 'thirty_min', 'Tersisa 30 menit lagi!');
        } 
        // Logic 10 Menit
        else if (diffMin <= 10 && diffMin > 7 && !assignment.reminders_sent.ten_min) {
          await sendReminder(assignment, 'ten_min', 'Tersisa 10 menit lagi! Segera kumpulkan!');
        }
        // Logic 5 Menit
        else if (diffMin <= 5 && diffMin > 0 && !assignment.reminders_sent.five_min) {
          await sendReminder(assignment, 'five_min', 'DARURAT! Waktu tinggal 5 menit lagi!');
        }
      }
    } catch (err) {
      console.error('[ReminderService] Error in background check:', err);
    }
  }, 60000); // Cek setiap 60 detik
}

async function sendReminder(assignment, type, timeText) {
  const message = `PENGINGAT: Tugas "${assignment.title}" ${timeText}`;
  console.log(`[ReminderService] Sending reminder: ${message}`);
  
  // 1. Update DB agar tidak kirim lagi
  assignment.reminders_sent[type] = true;
  await assignment.save();

  // 2. Kirim via Socket.io
  emitAssignmentReminder(assignment.conversation_id, assignment, message);
}
