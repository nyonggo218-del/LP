// Hardcode: /functions/post/[id].js
// This is a dynamic SSR (Server-Side Rendered) page for SEO.

/**
 * [BUGFIX] This function MUST be here.
 * Helper function to truncate text for meta description
 */
function truncate(str, length = 155) {
  if (!str) return "";
  // Strip HTML tags (simple version)
  const cleanStr = str.replace(/<[^>]*>?/gm, '');
  if (cleanStr.length <= length) return cleanStr;
  // Truncate and add ellipsis
  return cleanStr.substring(0, length) + "...";
}

/**
 * Helper function to fetch a single post
 */
async function getPost(db, id) {
  const stmt = db.prepare("SELECT * FROM Buku WHERE KodeUnik = ?").bind(id);
  const result = await stmt.first();
  return result;
}

/**
 * Helper function to generate the full HTML page on the server
 * @param {object} post - The post data from D1
 */
function renderPage(post) {
  // This line requires the truncate() function above
  const metaDescription = truncate(post.Deskripsi);

  return `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />

        <title>${post.Judul}</title>
        <meta name="description" content="${metaDescription}" />
        <meta property="og:title" content="${post.Judul}" />
        <meta property="og:description" content="${metaDescription}" />
        <meta property="og:image" content="${post.Image || 'https://via.placeholder.com/1200x630'}" />
        <meta property="og:type" content="article" />
        <link rel="stylesheet" href="/style.css" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
        <link
          href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>

        <a href="/" class="back-link">&larr; Back to all posts</a>

        <main class="post-detail-container">
          <article class="post-detail-content">
            <header class="post-detail-header">
              <h1>${post.Judul}</h1>
              <p class="post-meta">
                By <strong>${post.Author}</strong>
                in <em>${post.Kategori || "General"}</em>
              </p>
              ${
                post.Image
                  ? `<img src="${post.Image}" alt="${post.Judul}" class="post-detail-image" />`
                  : ""
              }
            </header>

            <a href="https://flowork.cloud" target="_blank" rel="noopener noreferrer" class="download-btn">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="feather feather-zap"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>
              <span>Get This Component</span>
            </a>
            <section class="post-content-body">
              ${post.Deskripsi}
            </section>

          </article>
        </main>

      </body>
    </html>
  `;
}

/**
 * Main handler for the dynamic page
 */
export async function onRequestGet(context) {
  const { env, params } = context;
  const db = env.DB;

  try {
    const uniqueCode = params.id; // Matches [id].js
    const post = await getPost(db, uniqueCode);

    if (!post) {
      return new Response("Post not found", { status: 404 });
    }

    const html = renderPage(post);

    return new Response(html, {
      headers: {
        "Content-Type": "text/html;charset=UTF-8",
        "Cache-Control": "s-maxage=3600",
      },
    });
  } catch (e) {
    return new Response(`Server error: ${e.message}`, { status: 500 });
  }
}