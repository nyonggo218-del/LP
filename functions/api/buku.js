// Hardcode: /functions/api/buku.js
// Handles requests to /api/buku
// [MODIFIED] Added full pagination logic
// [FIXED] Replaced ID with KodeUnik and rowid for sorting
// [UPDATED] Made Description optional for D1 space saving

const POSTS_PER_PAGE = 20; // Limit 20

/**
 * Handles GET requests to fetch paginated books (posts)
 */
async function handleGetAll(db, page) {
  const limit = POSTS_PER_PAGE;
  const offset = (page - 1) * limit;

  // Query 1: Get total count
  // Menggunakan KodeUnik karena kolom ID tidak ada
  const countStmt = db.prepare("SELECT COUNT(KodeUnik) as total FROM Buku");
  const { total } = await countStmt.first();
  const totalPages = Math.ceil(total / limit);

  // Query 2: Get the posts for the current page
  // Hapus 'ID' dari SELECT
  // Ganti ORDER BY ID -> ORDER BY rowid (untuk urutan 'terbaru' berdasarkan waktu insert)
  const postsStmt = db
    .prepare(
      "SELECT Judul, Author, Image, Kategori, KodeUnik FROM Buku ORDER BY rowid DESC LIMIT ? OFFSET ?"
    )
    .bind(limit, offset);

  const { results } = await postsStmt.all();

  return {
    posts: results,
    totalPages: totalPages,
    currentPage: page,
  };
}

/**
 * Main handler for GET requests (list)
 */
export async function onRequestGet(context) {
  const { env, request } = context;
  const db = env.DB;
  const cacheSeconds = 300; // 5 minutes

  try {
    // Get page number from query, default to 1
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
  // WARNING: This endpoint is open to the public. Secure it!
  const { env, request } = context;
  const db = env.DB;

  try {
    const postData = await request.json();
    
    // [UPDATED] Deskripsi dihapus dari validasi wajib
    if (
      !postData.Judul ||
      !postData.Author ||
      !postData.KodeUnik
    ) {
      return new Response(JSON.stringify({ error: "Missing required fields (Judul, Author, KodeUnik)" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const stmt = db
      .prepare(
        "INSERT INTO Buku (Judul, Deskripsi, Author, Image, Kategori, KodeUnik) VALUES (?, ?, ?, ?, ?, ?)"
      )
      .bind(
        postData.Judul,
        postData.Deskripsi || "", // [UPDATED] Default ke string kosong jika null
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
    // Send back a JSON error
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
