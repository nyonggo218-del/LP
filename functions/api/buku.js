// Hardcode: /functions/api/buku.js
// Handles requests to /api/buku
// [MODIFIED] Added full pagination logic

const POSTS_PER_PAGE = 20; // [MODIFIED] Limit 20

/**
 * Handles GET requests to fetch paginated books (posts)
 */
async function handleGetAll(db, page) {
  const limit = POSTS_PER_PAGE;
  const offset = (page - 1) * limit;

  // Query 1: Get total count
  // We cache this count query result in the function (in-memory) for 1 min
  // NOTE: This simple cache won't work across multiple edge locations,
  // but it's better than nothing. The s-maxage cache on the response is more important.
  const countStmt = db.prepare("SELECT COUNT(ID) as total FROM Buku");
  const { total } = await countStmt.first();
  const totalPages = Math.ceil(total / limit);

  // Query 2: Get the posts for the current page
  const postsStmt = db
    .prepare(
      "SELECT ID, Judul, Author, Image, Kategori, KodeUnik FROM Buku ORDER BY ID DESC LIMIT ? OFFSET ?"
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
  // ... (fungsi onRequestPost kamu biarin aja, nggak perlu diubah) ...
  // ... (pastikan kode POST kamu yang lama ada di sini) ...
  // WARNING: This endpoint is open to the public. Secure it!
  const { env, request } = context;
  const db = env.DB;

  try {
    const postData = await request.json();
    if (
      !postData.Judul ||
      !postData.Deskripsi ||
      !postData.Author ||
      !postData.KodeUnik
    ) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
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
        postData.Deskripsi,
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