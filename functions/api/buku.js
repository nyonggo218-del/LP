// Hardcode: /functions/api/buku.js
// Handles requests to /api/buku
// [MODIFIED] Removed Deskripsi & Views columns logic + Security Patch

const POSTS_PER_PAGE = 20; 

/**
 * Handles GET requests to fetch paginated books (posts)
 */
async function handleGetAll(db, page) {
  const limit = POSTS_PER_PAGE;
  // Pastikan page minimal 1 agar tidak error offset
  const safePage = Math.max(1, page); 
  const offset = (safePage - 1) * limit;

  // Query 1: Hitung total data
  const countStmt = db.prepare("SELECT COUNT(ID) as total FROM Buku");
  const { total } = await countStmt.first();
  const totalPages = Math.ceil(total / limit);

  // Query 2: Ambil data (Tanpa Deskripsi, Tanpa Views, Tanpa TanggalPost)
  const postsStmt = db
    .prepare(
      "SELECT ID, Judul, Author, Image, Kategori, KodeUnik FROM Buku ORDER BY ID DESC LIMIT ? OFFSET ?"
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
  const cacheSeconds = 300; // Cache 5 menit

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
    
    // [MODIFIED] Validasi dikurangi (Hapus cek Deskripsi)
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

    // [MODIFIED] Query INSERT disederhanakan
    // Menghapus kolom Deskripsi dari perintah SQL
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