// Path: functions/[[path]]/rss.xml.js

const BLOG_TITLE = "EBOOK LIBRARY";
const BLOG_DESCRIPTION = "Download Free PDF Ebooks Best Seller";

// --- CONFIG: SPINTAX JUDUL ---
const SPINTAX_PREFIX = `{Download|Get|Free|Read|Review|Grab} \
{PDF|Epub|Mobi|Audiobook|Kindle|Book} \
{Online|Directly|Instant|Fast}`;

const SPINTAX_SUFFIX = `{Full Version|Unabridged|Complete Edition|2026 Updated} \
{No Sign Up|Direct Link|High Speed|Free Account} \
{Best Seller|Trending|Viral|Must Read}`;

const MULTI_LANG_PREFIX = `{Download|Herunterladen (DE)|Télécharger (FR)|Descargar (ES)|Scarica (IT)} \
{Free|Kostenlos|Gratuit|Gratis} \
{PDF|Ebook|Livre|Libro}`;

// --- CONFIG: SPINTAX DESKRIPSI ---
// 1. Variasi kata "Read" (Dibuat beda dari Title agar variatif)
const DESC_PREFIX = `{Read|Enjoy|Discover|Explore|Browse|Open|Look at}`;

// 2. Variasi kata "Free Online"
const DESC_SUFFIX = `{free online|without cost|for free|digitally|no registration|instant access|in full version}`;

// 3. Tag/Keyword seruan Download (CTA Tags)
const DESC_TAGS = `{ebook download pdf|free epub books|read books online|digital library|best seller books|download kindle free|pdf collection}`;

// --- END CONFIG ---

function escapeXML(str) {
  if (!str) return "";
  return str.replace(/[<>&"']/g, function (match) {
    switch (match) {
      case "<": return "&lt;";
      case ">": return "&gt;";
      case "&": return "&amp;";
      case '"': return "&quot;";
      case "'": return "&#39;";
      default: return match;
    }
  });
}

function stringToHash(string) {
  let hash = 0;
  if (string.length === 0) return hash;
  for (let i = 0; i < string.length; i++) {
    const char = string.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; 
  }
  return Math.abs(hash);
}

function spinTextStable(text, seedStr) {
  return text.replace(/\{([^{}]+)\}/g, function (match, content) {
    const choices = content.split("|");
    const uniqueHash = stringToHash(seedStr + content);
    const index = uniqueHash % choices.length;
    return choices[index];
  });
}

export async function onRequestGet(context) {
  const { env, request, params } = context;
  const db = env.DB;

  try {
    const url = new URL(request.url);

    // DETEKSI SUBDOMAIN/ROUTER
    const forwardedHost = request.headers.get("X-Forwarded-Host");
    const SITE_URL = forwardedHost 
      ? `${url.protocol}//${forwardedHost}` 
      : url.origin;

    // Menangkap kategori dari folder [[path]]
    // Contoh: domain.com/business/rss.xml -> params.path = ['business']
    const pathSegments = params.path || [];
    const kategori = pathSegments[0] || null;

    const queryParams = [];
    
    // QUERY DATABASE
    // Mengambil kolom yang sudah disepakati: Judul, Author, Kategori, Image, KodeUnik, TanggalPost, Views
    let query =
      "SELECT Judul, Author, Kategori, Image, KodeUnik, TanggalPost, Views FROM Buku WHERE TanggalPost IS NOT NULL AND TanggalPost <= DATETIME('now', 'localtime')";

    if (kategori) {
      // Filter berdasarkan kategori yang ditangkap dari URL
      query += " AND UPPER(Kategori) = UPPER(?)";
      queryParams.push(kategori);
    }
    
    query += " ORDER BY TanggalPost DESC LIMIT 50"; 
    
    const stmt = db.prepare(query).bind(...queryParams);
    const { results } = await stmt.all();

    const feedTitle = kategori
      ? `${escapeXML(BLOG_TITLE)} - ${escapeXML(kategori)} Collection`
      : escapeXML(BLOG_TITLE);
      
    // Self Link menyesuaikan URL saat ini
    const selfPath = url.pathname; 
    const selfLink = `${SITE_URL}${selfPath}`;

    let xml = `<?xml version="1.0" encoding="UTF-8" ?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
  <title>${feedTitle}</title>
  <link>${SITE_URL}</link>
  <description>${escapeXML(BLOG_DESCRIPTION)}</description>
  <language>en-us</language>
  <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
  <atom:link href="${selfLink}" rel="self" type="application/rss+xml" />
`;

    for (const post of results) {
      // Link post tetap mengarah ke /post/ID
      const postUrl = `${SITE_URL}/post/${post.KodeUnik}`;
      
      const judulAsli = escapeXML(post.Judul);
      const seed = post.KodeUnik || post.Judul; 

      // --- LOGIKA SPINTAX JUDUL ---
      const isMultiLang = (stringToHash(seed + "langType") % 100) < 50; 
      let awalan = "";
      let akhiran = "";

      if (isMultiLang) {
        awalan = spinTextStable(MULTI_LANG_PREFIX, seed + "prefix");
        akhiran = spinTextStable("{2025|2026|Full}", seed + "suffix"); 
      } else {
        awalan = spinTextStable(SPINTAX_PREFIX, seed + "prefix");
        akhiran = spinTextStable(SPINTAX_SUFFIX, seed + "suffix");
      }

      const judulBaru = `${awalan} ${judulAsli} ${akhiran}`;
      const ctaDesc = spinTextStable("{Click to Download|Get it Now|Read Online}", seed + "cta");

      // --- LOGIKA SPINTAX DESKRIPSI ---
      // Format: [Read Spintax] Judul by Author [Free Spintax]. Tags: [Tag Spintax]
      const descStart = spinTextStable(DESC_PREFIX, seed + "descStart");
      const descEnd = spinTextStable(DESC_SUFFIX, seed + "descEnd");
      const descTags = spinTextStable(DESC_TAGS, seed + "descTags");
      
      const authorSafe = escapeXML(post.Author || "Unknown Author");
      const deskripsiOtomatis = `${descStart} <strong>${judulAsli}</strong> by ${authorSafe} ${descEnd}. <br/>Tags: ${descTags}`;

      let proxiedImageUrl = "";
      if (post.Image) {
        const encodedImageUrl = encodeURIComponent(post.Image);
        proxiedImageUrl = `${SITE_URL}/image-proxy?url=${encodedImageUrl}`;
      }

      const pubDate = post.TanggalPost 
        ? new Date(post.TanggalPost).toUTCString() 
        : new Date().toUTCString();

      xml += `
  <item>
    <title>${escapeXML(judulBaru)}</title> 
    <link>${postUrl}</link>
    <guid isPermaLink="true">${postUrl}</guid>
    <g:id>${escapeXML(post.KodeUnik)}</g:id>
    <description><![CDATA[
      ${deskripsiOtomatis}<br/><br/> 
      <strong>${ctaDesc}</strong>: <a href="${postUrl}">${escapeXML(judulBaru)}</a>
    ]]></description>
    ${
      proxiedImageUrl
        ? `<g:image_link>${escapeXML(proxiedImageUrl)}</g:image_link>`
        : ""
    }
    <g:availability>in stock</g:availability>
    <pubDate>${pubDate}</pubDate>
  </item>
`;
    }
    xml += `
</channel>
</rss>`;

    return new Response(xml, {
      headers: {
        "Content-Type": "application/rss+xml; charset=utf-8",
        "Cache-Control": "s-maxage=3600", 
      },
    });
  } catch (e) {
    return new Response(`Server error: ${e.message}`, {
      status: 500,
      headers: { "Content-Type": "text/plain" },
    });
  }
}