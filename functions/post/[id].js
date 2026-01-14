// Path: functions/post/[id].js

// ==================================================================
// KONFIGURASI
// ==================================================================
const CONST_ROUTER_URL = 'https://ads.cantikul.my.id'; 

const DESC_TEMPLATES = [
  "Read {TITLE} online for free. Download the full PDF or Epub version. High quality digital edition available now.",
  "Get the complete edition of {TITLE}. Instant access to the full book. No registration needed for preview.",
  "Full text archive: {TITLE}. Masterpiece collection. Download or stream the audiobook directly.",
  "Exclusive document: {TITLE}. View the secured content and download the complete file."
];

// ==================================================================
// HELPER FUNCTIONS
// ==================================================================

function stringToHash(s){let h=0;if(!s)return h;for(let i=0;i<s.length;i++){h=((h<<5)-h)+s.charCodeAt(i);h=h&h}return Math.abs(h)}
function getSpintaxDesc(t){const h=stringToHash(t||"Document");return DESC_TEMPLATES[h%DESC_TEMPLATES.length].replace("{TITLE}",t||"Document")}

// 1. DATABASE LOCAL
async function getPostFromDB(db, id) {
  try {
    const stmt = db.prepare("SELECT Judul, Image, Author, Kategori FROM Buku WHERE KodeUnik = ?").bind(id);
    return await stmt.first();
  } catch(e) { return null; }
}

// 2. GOOGLE BOOKS API (VIA ISBN)
async function fetchGoogleBooks(isbn) {
    try {
        const url = `https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}`;
        const r = await fetch(url);
        const json = await r.json();
        if (json.totalItems > 0 && json.items[0].volumeInfo) {
            const info = json.items[0].volumeInfo;
            let img = "";
            if (info.imageLinks) {
                img = (info.imageLinks.thumbnail || info.imageLinks.smallThumbnail).replace('http:', 'https:').replace('&edge=curl', '');
            }
            return { found: true, title: info.title, author: info.authors ? info.authors[0] : "Unknown", image: img };
        }
    } catch (e) {}
    return { found: false };
}

// 3. GOODREADS SEARCH (BY ASIN) - [FIX: ANTI-AUTHOR]
async function scrapeGoodreadsSearch(asin) {
    try {
        const url = `https://www.goodreads.com/search?q=${asin}`;
        const r = await fetch(url, {
            headers: { 
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });
        
        const html = await r.text();
        const finalUrl = r.url;

        // A. CEK JIKA REDIRECT KE HALAMAN BUKU (DETAIL PAGE)
        if (finalUrl.includes("/book/show/")) {
            // Di halaman detail, judul biasanya H1
            const h1Match = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
            const authorMatch = html.match(/<a class="authorName"[^>]*>.*?<span itemprop="name">([^<]+)<\/span>/s);
            
            if (h1Match && h1Match[1]) {
                return { 
                    found: true, 
                    title: h1Match[1].trim(), 
                    author: authorMatch ? authorMatch[1].trim() : "Goodreads Author" 
                };
            }
        }

        // B. CEK HALAMAN PENCARIAN (SEARCH RESULT)
        // KITA CARI: <span ... role="heading" ... aria-level="4" ...> JUDUL </span>
        // Penulis TIDAK PUNYA role="heading", jadi aman.
        
        // Regex ini mencari span yang PUNYA 'role="heading"' DAN 'aria-level="4"' (Urutan atribut bisa bolak-balik)
        // Kita tidak peduli 'itemprop' lagi karena itu bikin bingung sama author.
        
        // Pola 1: role dulu baru aria-level
        let titleMatch = html.match(/<span[^>]*role="heading"[^>]*aria-level="4"[^>]*>\s*([^<]+)\s*<\//i);
        
        // Pola 2: aria-level dulu baru role (Jaga-jaga)
        if (!titleMatch) {
            titleMatch = html.match(/<span[^>]*aria-level="4"[^>]*role="heading"[^>]*>\s*([^<]+)\s*<\//i);
        }

        // Pola 3: Fallback ke Class "bookTitle" (Sangat Spesifik Judul)
        if (!titleMatch) {
            titleMatch = html.match(/class="bookTitle"[^>]*>.*?<span[^>]*>([^<]+)<\/span>/s);
        }

        // Regex untuk Author (Ambil dari class authorName biar gak ketukar)
        const authorMatch = html.match(/class="authorName"[^>]*>.*?<span itemprop="name">([^<]+)<\/span>/s);

        if (titleMatch && titleMatch[1]) {
            let title = titleMatch[1].trim();
            // Bersihkan sampah HTML
            title = title.replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"');
            
            let author = authorMatch && authorMatch[1] ? authorMatch[1].trim() : "Amazon Author";
            return { found: true, title: title, author: author };
        }
    } catch (e) { console.log("GR Search Error:", e); }
    return { found: false };
}

// 4. DIRECT GOODREADS BOOK PAGE (BY ID)
async function scrapeDirectGoodreads(id) {
    try {
        const url = `https://www.goodreads.com/book/show/${id}`;
        const r = await fetch(url, {
            headers: { 
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });
        if (!r.ok) return { found: false };
        const html = await r.text();
        const titleMatch = html.match(/<meta property="og:title" content="([^"]+)"/);
        const imageMatch = html.match(/<meta property="og:image" content="([^"]+)"/);
        if (titleMatch && titleMatch[1]) {
            return { found: true, title: titleMatch[1], image: imageMatch ? imageMatch[1] : "" };
        }
    } catch (e) { }
    return { found: false };
}

// 5. GOOGLE SEARCH SCRAPING (GENERAL)
async function scrapeGoogleSearch(query, mode = 'text') {
    try {
        const param = mode === 'image' ? '&udm=2' : '';
        const url = `https://www.google.com/search?q=${encodeURIComponent(query)}${param}`;
        
        const r = await fetch(url, {
            headers: { 
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });
        
        const html = await r.text();
        
        if (mode === 'text') {
            const h3Match = html.match(/<h3[^>]*>([^<]+)<\/h3>/);
            if (h3Match && h3Match[1]) {
                let title = h3Match[1].replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
                title = title.replace(/ - Amazon\.com.*/i, '').replace(/ - Amazon.*/i, '');
                return { found: true, title: title };
            }
        }

        if (mode === 'image') {
            const imgMatch = html.match(/src="(https:\/\/encrypted-tbn0\.gstatic\.com\/images\?q=[^"]+)"/);
            let imgUrl = "";
            if (imgMatch && imgMatch[1]) imgUrl = imgMatch[1].replace(/&amp;/g, '&');
            
            const titleMatch = html.match(/alt="([^"]*goodreads[^"]*)"/i) || html.match(/<h3[^>]*>([^<]+)<\/h3>/);
            let titleTxt = titleMatch && titleMatch[1] ? titleMatch[1] : decodeURIComponent(query);
            
            if (imgUrl) return { found: true, title: titleTxt, image: imgUrl };
        }

    } catch (e) { console.log("Google Scrap Error:", e); }
    return { found: false };
}

// 6. HELPER REDIRECT (MAGIC LINK)
async function getRedirectData(id) {
  try {
    const targetUrl = `https://www.goodreads.com/book_link/follow/3?book_id=${id}&source=compareprices`;
    const r = await fetch(targetUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        redirect: 'follow'
    });
    const finalUrl = r.url;
    const bnMatch = finalUrl.match(/ean=(\d{13})/) || finalUrl.match(/\/(\d{13})/);
    if (bnMatch && bnMatch[1]) {
        return { found: true, type: 'bn', id: bnMatch[1] };
    }
  } catch(e) {}
  return { found: false };
}

// ==================================================================
// LOGIKA FALLBACK DATA (FINAL)
// ==================================================================
async function getDataFallback(id) {
  let d = { Judul: "Restricted Document", Image: "", Author: "Unknown Author", Kategori: "General", KodeUnik: id };

  try {
    // ----------------------------------------------------------------
    // JALUR 1: AMAZON (Prefix A- atau ASIN)
    // ----------------------------------------------------------------
    if (id.startsWith("A-") || /^B[A-Z0-9]{9}$/.test(id)) {
      const realId = id.startsWith("A-") ? id.substring(2) : id;
      
      // 1. GAMBAR
      d.Image = `https://images-na.ssl-images-amazon.com/images/P/${realId}.01.LZZZZZZZ.jpg`;
      d.Kategori = "Kindle Ebook";
      
      // 2. JUDUL: Goodreads Search (Pasti Akurat)
      const grSearch = await scrapeGoodreadsSearch(realId);
      if (grSearch.found) {
          d.Judul = grSearch.title;
          d.Author = grSearch.author;
          return d;
      }

      // 3. JUDUL: Google Search (Cadangan)
      const gSearch = await scrapeGoogleSearch(`amazon book ${realId}`, 'text');
      if (gSearch.found) {
          d.Judul = gSearch.title;
          d.Author = "Amazon Author"; 
          return d;
      }

      // 4. JUDUL: OpenLibrary (Terakhir)
      try {
        const r = await fetch(`https://openlibrary.org/search.json?q=${realId}&fields=title`, { cf: { cacheTtl: 86400 } });
        const j = await r.json();
        if (j.docs && j.docs.length > 0) d.Judul = j.docs[0].title;
        else d.Judul = "Restricted Document";
      } catch (e) { d.Judul = "Restricted Document"; }
      
      return d;
    }

    // ----------------------------------------------------------------
    // JALUR 2: ISBN (Prefix B-)
    // ----------------------------------------------------------------
    if (id.startsWith("B-") || /^\d{9}[\d|X]$|^\d{13}$/.test(id.replace(/-/g,""))) {
      const realId = id.startsWith("B-") ? id.substring(2) : id;
      const cleanIsbn = realId.replace(/-/g,"");
      
      d.Image = `https://covers.openlibrary.org/b/isbn/${cleanIsbn}-L.jpg`;

      const gb = await fetchGoogleBooks(cleanIsbn);
      if (gb.found) {
          d.Judul = gb.title;
          d.Author = gb.author;
          if (gb.image) d.Image = gb.image;
      } 
      return d;
    }

    // ----------------------------------------------------------------
    // JALUR 3: GOODREADS ID (Prefix C-)
    // ----------------------------------------------------------------
    if (id.startsWith("C-") || /^\d{1,9}$/.test(id)) {
      const realId = id.startsWith("C-") ? id.substring(2) : id;
      
      // STEP 1: SCRAP GOODREADS LANGSUNG
      const grData = await scrapeDirectGoodreads(realId);
      if (grData.found) {
          d.Judul = grData.title;
          d.Image = grData.image;
          d.Kategori = "Goodreads Book";
          return d;
      }

      // STEP 2: LEWAT B&N (AMBIL ISBN)
      const redir = await getRedirectData(realId);
      if (redir.found && redir.type === 'bn') {
          const gb = await fetchGoogleBooks(redir.id);
          if (gb.found) {
              d.Judul = gb.title;
              d.Author = gb.author;
              if (gb.image) d.Image = gb.image;
              d.Kategori = "B&N Edition";
              return d;
          }
      }

      // STEP 3: GOOGLE IMAGE SEARCH
      const gSearch = await scrapeGoogleSearch(`goodreads book ${realId}`, 'image');
      if (gSearch.found) {
          d.Judul = gSearch.title;
          d.Image = gSearch.image;
          d.Kategori = "Archived Search Result";
      } else {
          if (d.Judul === "Restricted Document") d.Judul = "Goodreads Secure File";
      }
      return d;
    }

    // ----------------------------------------------------------------
    // JALUR 4: BARNES & NOBLE (Prefix D-)
    // ----------------------------------------------------------------
    if (id.startsWith("D-")) {
       const realId = id.substring(2);
       const gb = await fetchGoogleBooks(realId);
       if (gb.found) {
           d.Judul = gb.title;
           d.Author = gb.author;
           if (gb.image) d.Image = gb.image;
           d.Kategori = "B&N Edition";
       }
       return d;
    }

  } catch (e) { console.log("Fatal Fallback Error:", e); }
  return d;
}

// ==================================================================
// RENDER HTML TEMPLATE
// ==================================================================
function renderFakeViewer(post, SITE_URL) {
  const metaDescription = getSpintaxDesc(post.Judul);
  let coverImage = post.Image || "";
  
  const generatedDesc = `<p>Are you looking for <strong>${post.Judul}</strong>? This is the perfect place to download or read it online. Digital content provided by <em>${post.Author || 'Unknown Author'}</em>.</p><p>This document belongs to the <strong>${post.Kategori || 'General'}</strong> category.</p><p>Join our community to access the full document. Registration is free and takes less than 2 minutes.</p>`;
  const cssTextPattern = `background-image: repeating-linear-gradient(transparent, transparent 12px, #e5e5e5 13px, #e5e5e5 15px); background-size: 100% 100%;`;

  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>${post.Judul}</title>
    <meta name="description" content="${metaDescription}">
    <meta property="og:image" content="${coverImage || 'https://via.placeholder.com/300?text=Document'}" />
    <link href="https://fonts.googleapis.com/css?family=Mukta+Malar:400,600,800" rel="stylesheet">
    <style>
        * { box-sizing: border-box; }
        body { margin: 0; padding: 0; font-family: 'Mukta Malar', sans-serif; background-color: #525659; overflow: hidden; height: 100vh; }
        .navbar { height: 48px; background-color: #323639; display: flex; align-items: center; justify-content: space-between; padding: 0 10px; color: #f1f1f1; font-size: 14px; position: fixed; top: 0; width: 100%; z-index: 100; box-shadow: 0 2px 5px rgba(0,0,0,0.2); }
        .nav-title { font-weight: 600; color: #14AF64; text-transform: uppercase; letter-spacing: 0.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 60%; }
        .nav-right { display: flex; gap: 15px; align-items: center; }
        .main-container { display: flex; height: 100vh; padding-top: 48px; }
        .sidebar { width: 240px; background-color: #323639; border-right: 1px solid #444; overflow-y: hidden; display: flex; flex-direction: column; align-items: center; padding: 20px 0; flex-shrink: 0; }
        .thumb-page { width: 120px; height: 160px; background: white; margin-bottom: 20px; box-shadow: 0 2px 5px rgba(0,0,0,0.3); position: relative; overflow: hidden; opacity: 0.6; transition: 0.2s; cursor: pointer; }
        .thumb-page.active { border: 3px solid #14AF64; opacity: 1; }
        .text-pattern { width: 100%; height: 100%; padding: 10px; ${cssTextPattern} }
        .text-header { width: 60%; height: 8px; background: #ccc; margin-bottom: 15px; }
        .content-area { flex-grow: 1; background-color: #525659; overflow-y: auto; display: flex; justify-content: center; padding: 40px; position: relative; }
        .pdf-page { width: 100%; max-width: 800px; min-height: 1100px; background-color: white; box-shadow: 0 0 15px rgba(0,0,0,0.5); padding: 50px; display: flex; flex-direction: column; align-items: center; position: relative; margin-bottom: 20px; }
        .cover-wrapper { width: 100%; max-width: 400px; min-height: 550px; display: flex; justify-content: center; align-items: center; margin-bottom: 30px; position: relative; }
        .pdf-cover-img { width: 100%; height: auto; box-shadow: 0 10px 25px rgba(0,0,0,0.3); z-index: 2; }
        .fallback-cover { position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: linear-gradient(135deg, #333 0%, #555 100%); display: flex; flex-direction: column; justify-content: center; align-items: center; color: white; text-align: center; padding: 20px; box-shadow: 0 10px 25px rgba(0,0,0,0.3); border: 2px solid #fff; }
        .fallback-title { font-size: 24px; font-weight: 800; margin-bottom: 10px; line-height: 1.3; }
        .fallback-sub { font-size: 14px; opacity: 0.8; text-transform: uppercase; letter-spacing: 1px; }
        .blurred-text-content { width: 100%; filter: blur(4px); opacity: 0.6; user-select: none; margin-top: 20px; }
        .b-line { height: 12px; background: #333; margin-bottom: 10px; width: 100%; opacity: 0.7; }
        .info-bar { position: absolute; top: 48px; left: 0; width: 100%; background: #fff; color: #333; padding: 10px 20px; font-size: 13px; border-bottom: 1px solid #ddd; z-index: 90; display: flex; align-items: center; gap: 10px; }
        .modal-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.85); z-index: 200; display: flex; align-items: center; justify-content: center; backdrop-filter: blur(5px); }
        .modal-box { background: white; width: 90%; max-width: 450px; border-radius: 8px; overflow: hidden; animation: popIn 0.3s ease-out; box-shadow: 0 20px 50px rgba(0,0,0,0.5); }
        .modal-body { padding: 30px; text-align: center; }
        .modal-cover-wrapper { width: 120px; height: 180px; margin: 0 auto 20px auto; position: relative; }
        .modal-img { width: 100%; height: 100%; object-fit: cover; border-radius: 4px; box-shadow: 0 5px 15px rgba(0,0,0,0.2); }
        .modal-fallback { position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: #eee; border: 1px solid #ddd; display: flex; align-items: center; justify-content: center; font-size: 30px; color: #aaa; border-radius: 4px; }
        .btn { display: block; width: 100%; padding: 15px; margin: 10px 0; font-weight: bold; text-transform: uppercase; border: none; border-radius: 4px; cursor: pointer; font-size: 16px; color: white; transition: 0.2s; }
        .btn-signup { background-color: #d9534f; }
        .btn-signup:hover { background-color: #c9302c; }
        .btn-download { background-color: #4285f4; }
        @keyframes popIn { from { transform: scale(0.9); opacity: 0; } to { transform: scale(1); opacity: 1; } }
        @media (max-width: 768px) { .sidebar, .info-bar { display: none; } }
    </style>
</head>
<body>
    <nav class="navbar">
        <div class="nav-title">WWW.${new URL(SITE_URL).hostname.toUpperCase()}</div>
        <div class="nav-right">
            <span style="background:#000; padding:2px 8px; border-radius:4px; font-size:11px;">1 / 154</span>
        </div>
    </nav>
    <div class="info-bar">
        <span>⚠️</span> <span>You are about to access "<strong>${post.Judul}</strong>". Available formats: PDF, TXT, ePub.</span>
    </div>
    <div class="main-container">
        <div class="sidebar">
            <div class="thumb-page active"><div class="text-pattern"><div class="text-header" style="background: #14AF64;"></div></div></div>
            <div class="thumb-page"><div class="text-pattern"><div class="text-header"></div></div></div>
            <div class="thumb-page"><div class="text-pattern"></div></div>
            <div class="thumb-page"><div class="text-pattern"><div class="text-header"></div></div></div>
        </div>
        <div class="content-area">
            <div class="pdf-page">
                <div class="cover-wrapper">
                    <div id="fallback-cover-main" class="fallback-cover" style="display: ${coverImage ? 'none' : 'flex'};">
                        <div class="fallback-title">${post.Judul}</div>
                        <div class="fallback-sub">Protected Document</div>
                    </div>
                    ${coverImage ? `<img src="${coverImage}" class="pdf-cover-img" alt="${post.Judul}" onerror="this.style.display='none'; document.getElementById('fallback-cover-main').style.display='flex';">` : ''}
                </div>
                <h2 style="text-align:center; color:#333; margin-top:0;">Description</h2>
                <div style="color:#444; line-height:1.6; font-size:14px; margin-bottom:30px;">${generatedDesc}</div>
                <div class="blurred-text-content">
                    <div class="b-line" style="width: 100%"></div><div class="b-line" style="width: 90%"></div>
                    <div class="b-line" style="width: 95%"></div><div class="b-line" style="width: 85%"></div><br>
                    <div class="b-line" style="width: 100%"></div><div class="b-line" style="width: 92%"></div>
                </div>
            </div>
        </div>
    </div>
    <div class="modal-overlay">
        <div class="modal-box">
            <div class="modal-body">
                <h3 style="margin-top: 0; color: #333;">Registration Required</h3>
                <div class="modal-cover-wrapper">
                     <div id="fallback-cover-modal" class="modal-fallback" style="display: ${coverImage ? 'none' : 'flex'};">📖</div>
                     ${coverImage ? `<img src="${coverImage}" class="modal-img" onerror="this.style.display='none'; document.getElementById('fallback-cover-modal').style.display='flex';">` : ''}
                </div>
                <p style="color: #666; font-size: 14px; margin-bottom: 20px;">
                    You need a verified account to access:<br>
                    <strong style="font-size: 16px; color: #333; display:block; margin: 5px 0;">${post.Judul}</strong>
                    <span style="font-size: 13px;">Sign up takes less than 2 minutes.</span>
                </p>
                <button class="btn btn-signup" onclick="executeDoubleMoney()">Create Free Account</button>
                <button class="btn btn-download" onclick="executeDoubleMoney()">Download PDF</button>
            </div>
        </div>
    </div>
    <script>
        function executeDoubleMoney() {
            var cpaUrl = '${CONST_ROUTER_URL}/offer';
            var adsteraUrl = '${CONST_ROUTER_URL}/download';
            
            var newTab = window.open(cpaUrl, '_blank');
            if (newTab) {
                window.location.href = adsteraUrl;
                newTab.focus();
            } else {
                window.location.href = cpaUrl;
            }
        }
    </script>
</body>
</html>
  `;
}

// ==================================================================
// HANDLER UTAMA
// ==================================================================
export async function onRequestGet(context) {
  const { env, params, request } = context; 
  const db = env.DB;
  const url = new URL(request.url);
  const cacheKey = new Request(url.toString(), request);
  const cache = caches.default;
  
  let response = await cache.match(cacheKey);
  if (response) { return response; }

  try {
    const SITE_URL = url.origin;
    const uniqueCode = params.id; 

    let post = await getPostFromDB(db, uniqueCode);
    if (!post) { post = await getDataFallback(uniqueCode); }

    const html = renderFakeViewer(post, SITE_URL);
    
    response = new Response(html, {
      status: 200,
      headers: {
        "Content-Type": "text/html;charset=UTF-8",
        "Cache-Control": "public, max-age=31536000, s-maxage=31536000", 
      },
    });

    context.waitUntil(cache.put(cacheKey, response.clone()));
    return response;
  } catch (e) {
    return new Response(`Server error: ${e.message}`, { status: 500 });
  }
}
