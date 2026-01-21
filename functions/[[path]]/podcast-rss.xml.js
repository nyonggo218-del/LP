// Path: functions/[[path]]/podcast.xml.js

// ==================================================================
// KONFIGURASI UTAMA
// ==================================================================
const POSTS_PER_PAGE = 1000; 
const CACHE_TTL = 21600;     // Cache 6 Jam
const DEFAULT_EMAIL_USER = "contact"; 

// 📢 METADATA MASTER FILE
const MASTER_FILE_SIZE = 200179; 
const MASTER_DURATION = 12;      

// --- SPINTAX CONFIG ---
const FEED_TITLE_SPIN = `{Audiobook Collection|Best Audio Library|Daily Listen|Podcast Books|Story Time|Audio Archive|The Reader's Hub|Digital Book Shelf}`;
const FEED_DESC_SPIN = `{Welcome to our extensive Audiobook Collection where you can listen to the best stories completely free of charge. We provide a wide range of genres including fiction, non-fiction, and educational materials for your daily listening pleasure.|Your daily dose of stories starts here. Enjoy high-quality audiobooks ranging from mystery to romance, available for instant streaming and download without any registration required.|This is the complete collection of audiobooks for free. We feature unabridged versions, detailed reviews, author biographies, and immersive storytelling sessions for book lovers everywhere.|Discover our archive of classic and modern literature. Whether you are looking for self-improvement books or thrilling novels, our library has something special for every listener.}`;
const FEED_AUTHOR_SPIN = `{Ebook Library|Audio Team|Story Teller|Book Lover|Digital Archive|Net Reader|The Librarian|Audio Admin}`;

const SPINTAX_PREFIX = `{Download|Get|Free|Read|Review|Grab} {PDF|Epub|Mobi|Audiobook|Kindle|Book} {Online|Directly|Instant|Fast}`;
const SPINTAX_SUFFIX = `{Full Version|Unabridged|Complete Edition|2026 Updated} {No Sign Up|Direct Link|High Speed|Free Account} {Best Seller|Trending|Viral|Must Read}`;
const MULTI_LANG_PREFIX = `{Download|Herunterladen|Télécharger|Descargar|Scarica} {Free|Kostenlos|Gratuit|Gratis} {PDF|Ebook|Livre|Libro}`;

// --- TEMPLATES ---
const DESC_PREFIX = `{Listen to|Enjoy|Discover|Explore|Browse|Hear|Check out}`;
const DESC_SUFFIX = `{free audiobook|without cost|for free|digitally|no registration|instant access|in full version}`;
const DESC_TAGS = `{audiobook download|free mp3 books|listen books online|digital library|best seller audiobooks|download kindle free|podcast collection}`;
const PINTEREST_INTRO = `{For more visual guides|To see the book cover|For related images|Check out our visual collection|Discover more about this title} {visit our Pinterest|check this Board|on our Pinterest Board|view the gallery|see the pin}`;
const PINTEREST_ANCHOR = `{View Board|Visit Pinterest|See Collection|Visual Guide|Pin It}`;
const TIER2_INTRO = `{Also available on|Listen on our partner platform|Supported by|Alternative streaming link|Mirror link} {via|at|on|checking|visiting}`;
const TIER2_ANCHOR = `{Official Stream|Partner Site|High Speed Server|External Player|Mirror Source}`;

// --- HELPER FUNCTIONS ---
function cdata(str) {
  if (!str) return "";
  let clean = str.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
  clean = clean.replace(/]]>/g, "]]]]><![CDATA[>");
  return `<![CDATA[${clean}]]>`;
}

function stringToHash(string) {
  let hash = 0;
  if (string.length === 0) return hash;
  for (let i = 0; i < string.length; i++) {
    hash = ((hash << 5) - hash) + string.charCodeAt(i);
    hash = hash & hash;
  }
  return Math.abs(hash);
}

function spinTextStable(text, seedStr) {
  return text.replace(/\{([^{}]+)\}/g, (match, content) => {
    const choices = content.split("|");
    const index = stringToHash(seedStr + content) % choices.length;
    return choices[index];
  });
}

function generateUUID(seed) {
    const hash = stringToHash(seed).toString(16).padEnd(32, '0');
    return `${hash.substr(0,8)}-${hash.substr(8,4)}-4${hash.substr(13,3)}-8${hash.substr(17,3)}-${hash.substr(20,12)}`;
}

function getRootDomain(hostname) {
  const parts = hostname.split('.');
  if (parts.length > 2) {
    return parts.slice(1).join('.');
  }
  return hostname;
}

export async function onRequest(context) {
  const { env, request, params } = context;
  const db = env.DB;
  const url = new URL(request.url);

  // 1. CACHE STRATEGY (Hemat D1)
  const cacheKey = new Request(url.toString(), request);
  const cache = caches.default;
  let response = await cache.match(cacheKey);
  if (response) {
    const newRes = new Response(response.body, response);
    newRes.headers.set("X-Cache-Status", "HIT");
    return newRes;
  }

  if (request.method === "OPTIONS") {
    return new Response(null, { headers: { "Access-Control-Allow-Origin": "*" } });
  }

  try {
    const forwardedHost = request.headers.get("X-Forwarded-Host");
    const CURRENT_HOST = forwardedHost || url.host;
    const SITE_URL = `${url.protocol}//${CURRENT_HOST}`;
    const selfLink = `${SITE_URL}${url.pathname}`;

    // =========================================================
    // 🚀 NEW PARSING LOGIC (SUPER RAMPING)
    // Format: /Category/User/PintUser/PintBoard/Tier2...
    // =========================================================
    const pathSegments = params.path || [];
    
    // Index 0: Kategori
    const categoryParam = pathSegments[0]; 
    
    // Index 1: Username (Untuk Email)
    const usernameParam = pathSegments[1]; 

    // Index 2 & 3: Pinterest (Backlink Tier 1)
    const pintUserParam = pathSegments[2];
    const pintBoardParam = pathSegments[3];
    
    // Index 4+: Tier 2 Link (Backlink Tier 2)
    const extraBacklinkSegments = pathSegments.slice(4);

    // Hardcode Volume ke 1 (Karena kamu sudah pecah kategori jadi max 1000)
    const volParam = 1;

    const emailUser = usernameParam || DEFAULT_EMAIL_USER; 
    const emailDomain = getRootDomain(CURRENT_HOST);
    const DYNAMIC_EMAIL = `${emailUser}@${emailDomain}`; 
    const identitySeed = (categoryParam || "") + (usernameParam || "");
    const channelUUID = generateUUID(identitySeed);

    // Metadata
    const dynamicFeedTitle = spinTextStable(FEED_TITLE_SPIN, identitySeed + "title");
    const dynamicFeedDesc = spinTextStable(FEED_DESC_SPIN, identitySeed + "desc");
    const dynamicFeedAuthor = spinTextStable(FEED_AUTHOR_SPIN, identitySeed + "auth");

    // Backlink Logic
    let rawPinterestUrl = "";
    if (pintUserParam && pintBoardParam) {
        rawPinterestUrl = `https://www.pinterest.com/${pintUserParam}/${pintBoardParam}/`;
    }
    let rawTier2Url = "";
    if (extraBacklinkSegments.length > 0) {
        rawTier2Url = extraBacklinkSegments.join("/");
        if (!rawTier2Url.startsWith("http")) rawTier2Url = "https://" + rawTier2Url;
    }

    // 2. QUERY DATABASE (Optimized: No Offset Logic needed practically)
    const limit = POSTS_PER_PAGE; 
    const offset = 0; // Selalu 0 karena Vol selalu 1

    const queryParams = [];
    let query = "SELECT Judul, Author, Kategori, Image, KodeUnik FROM Buku WHERE 1=1";
    
    if (categoryParam) {
      // Query tanpa UPPER untuk performa index
      query += " AND Kategori = ?"; 
      queryParams.push(categoryParam);
    }
    
    query += ` ORDER BY rowid DESC LIMIT ? OFFSET ?`;
    queryParams.push(limit);
    queryParams.push(offset);
    
    const stmt = db.prepare(query).bind(...queryParams);
    const { results } = await stmt.all();

    // Time Logic (Current Time)
    const baseDate = new Date();
    const BASE_TIME_MS = baseDate.getTime();
    const WINDOW_MS = 12 * 60 * 60 * 1000; 
    const lastBuildDate = baseDate.toUTCString();
    
    const picsumSeed = identitySeed || "default";
    const channelCoverUrl = `${SITE_URL}/image-proxy?url=${encodeURIComponent(`https://picsum.photos/seed/${picsumSeed}/1400/1400`)}&amp;ext=.jpg`;

    // XML HEADER
    let xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" 
    xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" 
    xmlns:content="http://purl.org/rss/1.0/modules/content/" 
    xmlns:podcast="https://podcastindex.org/namespace/1.0" 
    xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
<title>${cdata(dynamicFeedTitle)}</title>
<link>${SITE_URL}</link>
<description>${cdata(dynamicFeedDesc)}</description>
<generator>CloudflarePages</generator>
<lastBuildDate>${lastBuildDate}</lastBuildDate>
<language>en-us</language>
<copyright>${cdata(dynamicFeedAuthor)}</copyright>

<atom:link href="${selfLink}" rel="self" type="application/rss+xml" />

<itunes:image href="${channelCoverUrl}"/>
<itunes:explicit>no</itunes:explicit>
<itunes:type>episodic</itunes:type>
<itunes:summary>${cdata(dynamicFeedDesc)}</itunes:summary>
<itunes:author>${cdata(dynamicFeedAuthor)}</itunes:author>
<itunes:owner>
    <itunes:name>${cdata(dynamicFeedAuthor)}</itunes:name>
    <itunes:email>${DYNAMIC_EMAIL}</itunes:email>
</itunes:owner>
<itunes:category text="Arts"><itunes:category text="Books"/></itunes:category>

<image>
    <url>${channelCoverUrl}</url>
    <title>${cdata(dynamicFeedTitle)}</title>
    <link>${SITE_URL}</link>
</image>

<podcast:locked owner="${DYNAMIC_EMAIL}">no</podcast:locked>
<podcast:guid>${channelUUID}</podcast:guid>
`;

    if (results && results.length > 0) {
      for (let i = 0; i < results.length; i++) {
        const post = results[i];
        
        const audioUrl = `${SITE_URL}/podcast-audio/${post.KodeUnik}.mp3`;
        const postUrl = `${SITE_URL}/post/${post.KodeUnik}`;
        
        const seed = (post.KodeUnik || post.Judul) + identitySeed;
        const judulAsli = post.Judul || "Untitled";

        const timeOffset = Math.floor((i / results.length) * WINDOW_MS);
        const postTime = new Date(BASE_TIME_MS - timeOffset);
        // Tanggal mundur dinamis dari waktu sekarang
        const pubDate = postTime.toUTCString();

        const isMultiLang = (stringToHash(seed + "langType") % 100) < 50; 
        let awalan = isMultiLang ? spinTextStable(MULTI_LANG_PREFIX, seed + "prefix") : spinTextStable(SPINTAX_PREFIX, seed + "prefix");
        let akhiran = isMultiLang ? spinTextStable("{2025|2026|Full}", seed + "suffix") : spinTextStable(SPINTAX_SUFFIX, seed + "suffix");
        const finalTitle = `${awalan} ${judulAsli} ${akhiran}`;
        
        // Backlink Tier 1 & 2 Logic
        let pinterestPart = "";
        let tier2Part = "";
        const luckFactor = stringToHash(seed + "backlinkLuck") % 100;
        if (luckFactor < 70) {
            if (rawPinterestUrl) {
                pinterestPart = `<p>📌 ${spinTextStable(PINTEREST_INTRO, seed + "pintro")}: <a href="${rawPinterestUrl}">${spinTextStable(PINTEREST_ANCHOR, seed + "panchor")}</a></p>`;
            }
            if (rawTier2Url) {
                tier2Part = `<p>🔗 ${spinTextStable(TIER2_INTRO, seed + "tintro")} <strong><a href="${rawTier2Url}">${spinTextStable(TIER2_ANCHOR, seed + "tanchor")}</a></strong></p>`;
            }
        }

        const descStart = spinTextStable(DESC_PREFIX, seed + "descStart");
        const descEnd = spinTextStable(DESC_SUFFIX, seed + "descEnd");
        const descTags = spinTextStable(DESC_TAGS, seed + "descTags");
        const authorSafe = post.Author || "Unknown Author";
        const rawDescText = `${descStart} ${judulAsli} by ${authorSafe} ${descEnd}. Tags: ${descTags}`;
        const ctaPrefix = spinTextStable("{DOWNLOAD|GET BOOK|READ NOW|ACCESS FILE}", seed + "cta");
        const liveLinkText = `📥 ${ctaPrefix}: ${judulAsli}`;

        // HTML Content dengan Link Hidup
        const htmlContent = `
          <p>${rawDescText}</p>
          <hr/>
          <p>👉 <strong><a href="${postUrl}">${liveLinkText}</a></strong></p>
          ${pinterestPart}
          ${tier2Part}
        `;
        
        let episodeImage = channelCoverUrl; 
        if (post.Image) {
          episodeImage = `${SITE_URL}/image-proxy?url=${encodeURIComponent(post.Image)}&amp;ext=.jpg`;
        }

        xml += `<item>
<title>${cdata(finalTitle)}</title>
<link>${postUrl}</link>
<guid isPermaLink="false">${post.KodeUnik}</guid>
<pubDate>${pubDate}</pubDate>
<enclosure url="${audioUrl}" type="audio/mpeg" length="${MASTER_FILE_SIZE}"/>
<description>${cdata(htmlContent)}</description>
<content:encoded>${cdata(htmlContent)}</content:encoded>
<itunes:duration>${MASTER_DURATION}</itunes:duration>
<itunes:explicit>no</itunes:explicit>
<itunes:image href="${episodeImage}"/>
<itunes:episodeType>full</itunes:episodeType>
</item>`;
      }
    }

    xml += `</channel></rss>`;
    
    const finalString = xml.trim(); 
    const encoder = new TextEncoder();
    const data = encoder.encode(finalString);
    
    response = new Response(data, {
      status: 200,
      headers: {
        "Content-Type": "application/rss+xml; charset=utf-8",
        "Cache-Control": `public, max-age=3600, s-maxage=${CACHE_TTL}`,
        "Content-Length": data.byteLength.toString(),
        "Access-Control-Allow-Origin": "*",
        "X-Cache-Status": "MISS" 
      },
    });

    context.waitUntil(cache.put(cacheKey, response.clone()));

    return response;

  } catch (e) {
    return new Response(`Error: ${e.message}`, { status: 500 });
  }
}
