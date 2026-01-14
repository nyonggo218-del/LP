// Hardcode: /functions/api/upload-csv.js
// Handles CSV file uploads and batch inserts into D1.
// [MODIFIED] CSV parser now auto-detects comma (,) or semicolon (;) delimiters.

// !!! PENTING !!!
// Ganti ini dengan password rahasia lu sendiri.
const SECRET_TOKEN = "123123123"; // [TODO] Ganti ini!

/**
 * [MODIFIED] Simple CSV text parser.
 * Now auto-detects delimiter (',' or ';') from the header row.
 */
function simpleCSVParser(text) {
  const lines = text.trim().split("\n");
  if (lines.length < 2) {
    throw new Error("CSV must have a header row and at least one data row.");
  }

  // Get header row
  const headerLine = lines.shift().trim();

  // --- [NEW] Auto-detect delimiter ---
  const commaCount = (headerLine.match(/,/g) || []).length;
  const semicolonCount = (headerLine.match(/;/g) || []).length;

  let delimiter = ","; // Default to comma
  if (semicolonCount > commaCount) {
    delimiter = ";"; // Switch to semicolon if it's used more
  }
  // --- [END NEW] ---

  // Use the detected delimiter
  const headers = headerLine
    .split(delimiter) // [MODIFIED]
    .map((h) => h.trim());

  // Expected headers
  const expectedHeaders = [
    "Judul",
    "Deskripsi",
    "Author",
    "Image",
    "Kategori",
    "KodeUnik",
    "tangal",
  ];

  // Check if all expected headers are present
  for (const h of expectedHeaders) {
    if (!headers.includes(h)) {
      throw new Error(
        `Missing required header column in CSV: ${h}. Headers found: ${headers.join(
          ", "
        )}`
      );
    }
  }

  // Map rows to objects
  const data = lines.map((line, rowIndex) => {
    const values = line.trim().split(delimiter); // [MODIFIED]
    if (values.length !== headers.length) {
      console.warn(
        `Row ${
          rowIndex + 2
        }: Mismatched column count. Expected ${headers.length}, got ${
          values.length
        }. Skipping.`
      );
      return null;
    }

    let obj = {};
    headers.forEach((header, index) => {
      obj[header] = values[index].trim();
    });
    return obj;
  });

  return data.filter((row) => row !== null); // Filter out skipped rows
}

/**
 * Main handler for POST requests
 */
export async function onRequestPost(context) {
  const { request, env } = context;
  const db = env.DB;

  try {
    // 1. Check content type
    const contentType = request.headers.get("content-type");
    if (!contentType || !contentType.includes("multipart/form-data")) {
      return new Response(
        JSON.stringify({ error: "Invalid Content-Type" }),
        { status: 415 }
      );
    }

    // 2. Parse FormData
    const formData = await request.formData();
    const file = formData.get("file");
    const token = formData.get("token");

    // 3. Check Security Token
    if (token !== SECRET_TOKEN) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 403,
      });
    }

    // 4. Check File
    if (!file) {
      return new Response(JSON.stringify({ error: "No file uploaded" }), {
        status: 400,
      });
    }

    // 5. Read and Parse CSV
    const csvText = await file.text();
    const rows = simpleCSVParser(csvText); // [MODIFIED] This function is now smarter

    if (rows.length === 0) {
      return new Response(
        JSON.stringify({
          error: "Tidak ada baris data valid yang ditemukan dalam CSV.",
        }),
        { status: 400 }
      );
    }

    // 6. Prepare D1 Batch Insert
    const statements = [];
    const insertSql =
      "INSERT INTO Buku (Judul, Deskripsi, Author, Image, Kategori, KodeUnik, tangal, pv) VALUES (?, ?, ?, ?, ?, ?, ?, 0)";
    const stmt = db.prepare(insertSql);

    for (const row of rows) {
      // Basic validation
      if (!row.Judul || !row.KodeUnik || !row.tangal) {
        console.warn("Skipping row with missing required fields:", row);
        continue;
      }
      statements.push(
        stmt.bind(
          row.Judul,
          row.Deskripsi || null,
          row.Author || null,
          row.Image || null,
          row.Kategori || null,
          row.KodeUnik,
          row.tangal // Assumes 'YYYY-MM-DD' format
        )
      );
    }

    if (statements.length === 0) {
      return new Response(
        JSON.stringify({
          error:
            "All rows failed validation (e.g., missing Judul/KodeUnik/tangal).",
        }),
        { status: 400 }
      );
    }

    // 7. Execute Batch
    await db.batch(statements);

    // 8. Send Success Response
    return new Response(
      JSON.stringify({
        success: true,
        count: statements.length,
        message: "CSV data imported successfully.",
      }),
      {
        status: 201,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

/**
 * Handle other methods (GET, etc.)
 */
export async function onRequest(context) {
  if (context.request.method === "POST") {
    return await onRequestPost(context);
  }
  return new Response(JSON.stringify({ error: "Method not allowed" }), {
    status: 405,
  });
}