// Hardcode: /functions/api/buku.js
// Handles requests to /api/buku
// [MODIFIED] Consistent with RSS/Podcast logic (rowid sort)

const POSTS_PER_PAGE = 20; 

/**
 * Handles GET requests to fetch paginated books (posts)
 */
async function handleGetAll(db, page) {
  const limit = POSTS_PER_PAGE;
  // Pastikan page minimal 1
  const safePage = Math.max(1, page); 
  const offset = (safePage - 1) * limit;

  // Query 1: Hitung total data
  // Kita hitung berdasarkan rowid atau KodeUnik (PK) sama saja
  const countStmt = db.prepare("SELECT COUNT(KodeUnik) as total FROM Buku");
  const { total } = await countStmt.first();
  const totalPages = Math.ceil(total / limit);

  // Query 2: Ambil data
  // [UPDATE] Menggunakan 'ORDER BY rowid DESC' agar konsisten dengan RSS
  // Data terbaru (yang baru diinsert) akan muncul paling atas
  const postsStmt = db
    .prepare(
      "SELECT KodeUnik, Judul, Author, Image, Kategori FROM Buku ORDER BY rowid DESC LIMIT ? OFFSET ?"
    )
    .bind(limit, offset);

  const { results } = await postsStmt.all();

  return {
    posts: results,
    totalPages: totalPages,
    currentPage: safePage,
  };
}

/**
 * Main handler for GET requests (list)
 */
export async function onRequestGet(context) {
  const { env, request } = context;
  const db = env.DB;
  const cacheSeconds = 300; // Cache 5 Menit

  try {
    const url = new URL(request.url);
    const page = parseInt(url.searchParams.get("page") || "1");

    const data = await handleGetAll(db, page);

    return new Response(JSON.stringify(data), {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": `s-maxage=${cacheSeconds}`,
      },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

/**
 * Main handler for POST requests (create)
 */
export async function onRequestPost(context) {
  const { env, request } = context;
  const db = env.DB;

  // [SECURITY] Cek API Key
  const API_KEY = env.API_KEY || "RAHASIA"; 
  const authHeader = request.headers.get("x-api-key");

  if (authHeader !== API_KEY) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const postData = await request.json();
    
    // Validasi Input (Hanya kolom wajib)
    if (
      !postData.Judul ||
      !postData.Author ||
      !postData.KodeUnik
    ) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Insert Data (Tanpa TanggalPost, Deskripsi, Views)
    const stmt = db
      .prepare(
        "INSERT INTO Buku (Judul, Author, Image, Kategori, KodeUnik) VALUES (?, ?, ?, ?, ?)"
      )
      .bind(
        postData.Judul,
        postData.Author,
        postData.Image || null,
        postData.Kategori || null,
        postData.KodeUnik
      );
      
    await stmt.run();
    
    return new Response(
      JSON.stringify({ success: true, message: "Post created" }),
      { status: 201, headers: { "Content-Type": "application/json" } }
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
