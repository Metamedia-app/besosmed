import Post from '../../models/Post.js';
import User from '../../models/User.js';

const APP_URL = process.env.APP_URL || 'http://localhost:3000';
const APP_SCHEME = 'besosmed'; // Deep link scheme milik aplikasi FE
const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.anonymous.Fe_Sosmed_metamedia';
const DEFAULT_OG_IMAGE = `${APP_URL}/logo.png`; // Fallback jika postingan tidak punya foto

/**
 * Web Preview untuk Sharing (Open Graph + Deep Link)
 * Rute PUBLIK (tanpa auth): GET /post/:postId
 * 
 * Fungsi:
 * 1. WhatsApp/Telegram membaca HTML ini → memunculkan preview card (foto, judul, deskripsi)
 * 2. Jika diklik pada HP ber-aplikasi → redirect ke app via deep link
 * 3. Jika diklik tanpa aplikasi → arahkan ke Play Store
 */
export async function sharePostPreview(request, reply) {
  const { postId } = request.params;

  try {
    const post = await Post.findById(postId)
      .populate('author_id', 'nama avatar_url')
      .lean();

    // Jika postingan tidak ditemukan, redirect ke landing page
    if (!post) {
      return reply.redirect(APP_URL);
    }

    const authorName = post.author_id?.nama || 'Pengguna MetaU';
    const postBody = post.caption || post.body || '';
    const description = postBody.length > 100 ? postBody.substring(0, 100) + '...' : postBody || 'Lihat postingan ini di MetaU!';
    const ogImage = post.media?.[0]?.url || post.author_id?.avatar_url || DEFAULT_OG_IMAGE;
    const shareUrl = `${APP_URL}/post/${postId}`;
    const deepLinkUrl = `${APP_SCHEME}://post/${postId}`;

    const html = `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">

  <!-- Open Graph Meta Tags (Untuk WhatsApp, Telegram, Twitter, dll) -->
  <meta property="og:title" content="Postingan dari ${authorName}" />
  <meta property="og:description" content="${description}" />
  <meta property="og:image" content="${ogImage}" />
  <meta property="og:url" content="${shareUrl}" />
  <meta property="og:type" content="article" />
  <meta property="og:site_name" content="MetaU" />

  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="Postingan dari ${authorName}" />
  <meta name="twitter:description" content="${description}" />
  <meta name="twitter:image" content="${ogImage}" />

  <title>Postingan dari ${authorName} — MetaU</title>

  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f5f5f5; display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 16px; }
    .card { background: white; border-radius: 16px; padding: 32px; max-width: 400px; width: 100%; text-align: center; box-shadow: 0 4px 20px rgba(0,0,0,0.1); }
    .logo { font-size: 24px; font-weight: 800; color: #1a73e8; margin-bottom: 8px; }
    .msg { color: #666; font-size: 14px; margin-bottom: 24px; }
    .btn { display: inline-block; background: #1a73e8; color: white; padding: 12px 28px; border-radius: 30px; text-decoration: none; font-weight: 600; font-size: 15px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">🎓 MetaU</div>
    <p class="msg">Postingan dari <strong>${authorName}</strong> sedang dibuka di aplikasi...</p>
    <a href="${PLAY_STORE_URL}" class="btn">Download Aplikasi</a>
  </div>

  <script>
    // Coba buka aplikasi via deep link
    window.location.href = '${deepLinkUrl}';
    // Jika aplikasi tidak terinstall (setelah 2.5 detik), arahkan ke Play Store
    setTimeout(function() {
      window.location.href = '${PLAY_STORE_URL}';
    }, 2500);
  </script>
</body>
</html>`;

    return reply.type('text/html').send(html);

  } catch (error) {
    request.log.error({ err: error }, '[SharePreview] Gagal memuat postingan');
    return reply.redirect(APP_URL);
  }
}
