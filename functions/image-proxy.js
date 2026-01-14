// Hardcode: /functions/image-proxy.js
// This function fetches an external image and serves it
// from our own domain to act as a proxy.

export async function onRequestGet(context) {
  const { request } = context;
  const url = new URL(request.url);

  // 1. Ambil URL gambar aslinya dari parameter ?url=
  const imageUrl = url.searchParams.get("url");

  if (!imageUrl) {
    return new Response("Missing 'url' parameter", { status: 400 });
  }

  try {
    // 2. Fetch gambar aslinya
    // Kita tambahin User-Agent biar sopan
    const imageResponse = await fetch(imageUrl, {
      headers: {
        "User-Agent": "Flowork-Image-Proxy/1.0 (Cloudflare Worker)",
      },
    });

    if (!imageResponse.ok) {
      return new Response("Failed to fetch image", {
        status: imageResponse.status,
      });
    }

    // 3. Ambil Tipe Konten aslinya (e.g., image/jpeg)
    const contentType =
      imageResponse.headers.get("Content-Type") || "application/octet-stream";

    // 4. Kirim balik gambarnya dengan header yang udah di-cache
    return new Response(imageResponse.body, {
      headers: {
        "Content-Type": contentType,
        // Cache di Edge Cloudflare selama 1 hari
        "Cache-Control": "public, s-maxage=86400, max-age=86400",
      },
    });
  } catch (e) {
    return new Response(`Error proxying image: ${e.message}`, { status: 500 });
  }
}