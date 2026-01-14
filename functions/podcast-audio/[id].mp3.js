// Hardcode: /functions/podcast-audio/[id].mp3.js

const TOTAL_TRACKS = 1;
// Pastikan ini mengarah ke file fisik yang SUDAH ada ID3-nya
const AUDIO_PATH_PREFIX = "/audio/audio_fixed"; 
const AUDIO_PATH_SUFFIX = ".mp3"; 

export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);

  // Tentukan lokasi file fisik asli
  const targetPath = `${AUDIO_PATH_PREFIX}${AUDIO_PATH_SUFFIX}`;
  const targetUrl = `${url.origin}${targetPath}`;

  // ============================================================
  // 🚀 METODE BARU: STREAMING PASSTHROUGH (PIPA TRANSPARAN)
  // Kita tidak mendownload file, kita hanya menyambungkan kabel.
  // Validator minta byte 0-100, kita minta byte 0-100 ke server,
  // lalu langsung teruskan.
  // ============================================================

  // 1. Buat Request Baru yang meneruskan SEMUA Header validator
  // (Terutama header 'Range' yang mencegah timeout)
  const newRequest = new Request(targetUrl, {
    method: request.method,
    headers: request.headers, // KUNCI ANTI-TIMEOUT
    redirect: "follow"
  });

  // 2. Fetch ke file fisik
  const response = await fetch(newRequest);

  // 3. Siapkan Header Respon
  const newHeaders = new Headers(response.headers);
  
  // Paksa agar validator percaya ini file MP3 valid
  newHeaders.set("Content-Type", "audio/mpeg");
  newHeaders.set("Access-Control-Allow-Origin", "*");
  
  // Pastikan fitur Resume/Streaming aktif
  if (!newHeaders.has("Accept-Ranges")) {
    newHeaders.set("Accept-Ranges", "bytes");
  }

  // 4. Return Response dengan Body Stream Asli
  // Kita kirim 'response.body' mentah-mentah.
  // Cloudflare tidak akan menunggu file selesai didownload.
  // Begitu 1 byte diterima, langsung dikirim ke SoundOn.
  return new Response(response.body, {
    status: response.status, // Bisa 200 atau 206 (Partial Content)
    statusText: response.statusText,
    headers: newHeaders
  });
}
