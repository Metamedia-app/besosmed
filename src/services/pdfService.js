import PDFDocument from 'pdfkit';

/**
 * Service untuk generate PDF Laporan Analitik Grup
 * Mengembalikan PDFDocument (Readable Stream)
 */
export function generateGroupAnalyticPDF(data) {
  const doc = new PDFDocument({ margin: 50 });

  // --- HEADER ---
  doc.fontSize(20).text('LAPORAN ANALITIK GRUP MATA KULIAH', { align: 'center' });
  doc.fontSize(10).text('Sistem Informasi Akademik BeSosmed', { align: 'center' });
  doc.moveDown();
  doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
  doc.moveDown();

  // --- INFO GRUP ---
  doc.fontSize(14).text('Informasi Grup', { underline: true });
  doc.fontSize(12).moveDown(0.5);
  doc.text(`Mata Kuliah   : ${data.group_info.subject?.name || '-'} (${data.group_info.subject?.code || '-'})`);
  doc.text(`Kelas / Prodi  : ${data.group_info.class || '-'} / ${data.group_info.subject?.code_prodi || '-'}`);
  doc.text(`Tahun Ajaran : ${data.group_info.academic_year || '-'}`);
  doc.text(`Total Member : ${data.group_info.member_count} Peserta`);
  doc.moveDown();

  // --- RINGKASAN AKTIVITAS ---
  doc.fontSize(14).text('Ringkasan Aktivitas Chat', { underline: true });
  doc.fontSize(12).moveDown(0.5);
  doc.text(`Total Pesan Terkirim      : ${data.stats.total_messages} Pesan`);
  doc.text(`Total Media/File Shared  : ${data.stats.total_media} File`);
  doc.text(`Bad Words Terdeteksi     : ${data.stats.bad_words_blocked} Kali`);
  doc.moveDown();

  // --- TOP KONTRIBUTOR (TABEL SEDERHANA) ---
  doc.fontSize(14).text('Top 5 Mahasiswa Teraktif', { underline: true });
  doc.moveDown(0.5);

  // Header Tabel
  const tableTop = doc.y;
  doc.fontSize(10);
  doc.text('Rank', 50, tableTop);
  doc.text('NIM', 100, tableTop);
  doc.text('Nama Mahasiswa', 200, tableTop);
  doc.text('Jumlah Pesan', 450, tableTop);
  
  doc.moveTo(50, tableTop + 15).lineTo(550, tableTop + 15).stroke();

  // Isi Tabel
  let currentY = tableTop + 25;
  data.top_contributors.forEach((user, index) => {
    doc.text(index + 1, 50, currentY);
    doc.text(user.nim || '-', 100, currentY);
    doc.text(user.nama || '-', 200, currentY);
    doc.text(user.message_count, 450, currentY);
    currentY += 20;
  });

  // --- FOOTER ---
  const footerTop = 750;
  doc.fontSize(8).text(
    `Laporan ini digenerate secara otomatis pada ${new Date().toLocaleString('id-ID')}`,
    50,
    footerTop,
    { align: 'center' }
  );

  doc.end();
  return doc;
}
