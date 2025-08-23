import mondaySdk from "monday-sdk-js";
import { ENV } from "../config/env.js";
import { getBookById } from "./base44.js";

const { MONDAY_API_TOKEN } = ENV;
if (!MONDAY_API_TOKEN) {
  throw new Error("Missing MONDAY_API_TOKEN in environment variables");
}

const monday = mondaySdk();
monday.setToken(MONDAY_API_TOKEN);

// ---------- Board & Columns Configuration ----------
const BOARDS = {
  PURCHASED: "2107736787", // Books of Love (original - for purchased books)
  CREATED: "2112014301", // Books of Love - Created (for email collection)
};

// Column IDs (same for both boards since you duplicated)
const COL = {
  base44_id: "text_mkv0wyr5", // Base44 ID
  idea_title: "text_mkv0t2c7", // Book idea/title
  author: "text_mkv06zzx", // Author (name/username)
  email: "email_mkv0aysf", // Email (renamed for consistency)
  author_phone: "phone_mkv0z01", // Author phone
  book_type: "text_mkv0c43m",
  lover_name: "text_mkv0megr",
  gender: "text_mkv0m341",
  book_style: "text_mkv01kbn",
  romance_level: "text_mkv0nv0g",
  answers: "long_text_mkv09jgt", // Long text (answers JSON)
  dedication: "long_text_mkv08epm", // Long text (dedication)
  photo_url: "link_mkv0w7p8", // Link (photo URL)
  status_text: "text_mkv0bg60",
  generated_pages: "long_text_mkv0v67a", // Long text (generatedPages JSON)
  pages_fingerprint: "long_text_mkv0hwkc", // Long text (pagesFingerprint JSON)
  created_at: "date_mkv033jy", // Date
  updated_at: "date_mkv0rp6g", // Date
  is_sample: "boolean_mkv0xrma", // Checkbox ("true"/"false")
};

// ---------- Helper Functions ----------
const normalizeId = (b) => b?._id ?? b?.id ?? b?.book_id ?? null;

function pruneEmpty(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === null || v === undefined) continue;
    out[k] = v;
  }
  return out;
}

// Query all items and find an item where the Base44 ID column text matches
async function findItemByBase44Id(base44Id, boardId) {
  const query = `
    query ($boardId: [ID!]!, $limit: Int) {
      boards(ids: $boardId) {
        items_page(limit: $limit) {
          items {
            id
            name
            column_values {
              id
              text
            }
          }
        }
      }
    }
  `;
  const res = await monday.api(query, {
    variables: { boardId: [boardId], limit: 200 },
  });

  const items = res.data?.boards?.[0]?.items_page?.items || [];
  return items.find((item) =>
    item.column_values?.some(
      (cv) => cv.id === COL.base44_id && cv.text === base44Id
    )
  );
}

function mapBookToColumnValues(book) {
  const docId = normalizeId(book);

  return pruneEmpty({
    // Identity
    text_mkv0wyr5: docId,

    // Title
    text_mkv0t2c7: book.book_idea_title || book.title || "",

    // Contact
    text_mkv06zzx: book.author || "",
    email_mkv0aysf: book.email
      ? {
          email: String(book.email),
          text: String(book.author || book.email),
        }
      : null,
    phone_mkv0z01: book.author_phone
      ? { phone: String(book.author_phone) }
      : null,

    // Core selections
    text_mkv0c43m: book.book_type || "",
    text_mkv0megr: book.lover_name || "",
    text_mkv0m341: book.gender || "",
    text_mkv01kbn: book.book_style || "",
    text_mkv0nv0g: book.romance_level || "",

    // Free-form
    long_text_mkv09jgt: book.answers
      ? { text: JSON.stringify(book.answers, null, 2) }
      : null,
    long_text_mkv08epm: book.dedication_text
      ? { text: String(book.dedication_text) }
      : null,

    // Media
    link_mkv0w7p8: book.photo_url
      ? { url: String(book.photo_url), text: "Photo" }
      : null,

    // Status
    text_mkv0bg60: book.status || "",

    // Large payloads
    long_text_mkv0v67a: book.generatedPages
      ? { text: JSON.stringify(book.generatedPages, null, 2) }
      : null,
    long_text_mkv0hwkc: book.pagesFingerprint
      ? { text: String(book.pagesFingerprint) }
      : null,

    // Dates (use created_date / updated_date from your payload)
    date_mkv033jy: book.created_date
      ? { date: String(book.created_date).split("T")[0] }
      : null,
    date_mkv0rp6g: book.updated_date
      ? { date: String(book.updated_date).split("T")[0] }
      : null,

    // Checkbox (Is Sample)
    // ✅ checked -> { checked: true }
    // ✅ unchecked -> null   (clears the checkbox)
    boolean_mkv0xrma: book.is_sample ? { checked: true } : null,
  });
}

// ---------- Main Upsert Function (Updated) ----------
export async function upsertBookById(bookId, boardType = "PURCHASED") {
  const boardId = BOARDS[boardType];
  if (!boardId) {
    throw new Error(
      `Invalid board type: ${boardType}. Use "PURCHASED" or "CREATED"`
    );
  }

  console.log(
    `📖 Upserting Base44 book: ${bookId} to ${boardType} board (${boardId})`
  );

  // 1) Fetch book data from Base44
  const book = await getBookById(bookId);
  console.log("🔍 Raw book from Base44:", JSON.stringify(book, null, 2));

  if (!book) throw new Error("Book not found (null response)");

  const docId = normalizeId(book);
  if (!docId) throw new Error("Book found but missing id/_id/book_id");

  // 2) Find existing Monday item by Base44 ID
  const existing = await findItemByBase44Id(docId, boardId);

  // 3) Map → Monday column values
  const valuesJson = JSON.stringify(mapBookToColumnValues(book));

  try {
    if (existing) {
      console.log(
        `✏️ Updating Monday item ${existing.id} in ${boardType} board`
      );
      const mutation = `
        mutation ($itemId: ID!, $boardId: ID!, $values: JSON!) {
          change_multiple_column_values(
            item_id: $itemId,
            board_id: $boardId,
            column_values: $values
          ) { id name }
        }
      `;
      const resp = await monday.api(mutation, {
        variables: {
          itemId: existing.id,
          boardId: boardId,
          values: valuesJson,
        },
      });
      const updated = resp.data?.change_multiple_column_values;
      const url = `https://app.monday.com/boards/${boardId}/pulses/${existing.id}`;
      console.log("✅ Updated:", updated || "(no payload)");
      console.log("🔗 Open item:", url);
      return { action: "updated", itemId: String(existing.id), url, boardType };
    } else {
      console.log(`➕ Creating new Monday item in ${boardType} board`);
      const mutation = `
        mutation ($boardId: ID!, $name: String!, $values: JSON) {
          create_item(
            board_id: $boardId,
            item_name: $name,
            column_values: $values
          ) { id name }
        }
      `;
      const resp = await monday.api(mutation, {
        variables: {
          boardId: boardId,
          name: book.book_idea_title || book.title || `Book ${docId}`,
          values: valuesJson,
        },
      });
      const created = resp.data?.create_item;
      const itemId = created?.id ? String(created.id) : null;
      const url = itemId
        ? `https://app.monday.com/boards/${boardId}/pulses/${itemId}`
        : "";
      console.log("✅ Created:", created || "(no payload)");
      if (itemId) console.log("🔗 Open item:", url);
      else
        console.log(
          "⚠️ No item id returned. Raw:",
          JSON.stringify(resp, null, 2)
        );
      return { action: "created", itemId, url, boardType };
    }
  } catch (err) {
    // Bubble up detailed Monday errors
    const details = err?.response?.data || err?.message || err;
    console.error("❌ Monday API error:", details);
    throw new Error(
      typeof details === "string" ? details : JSON.stringify(details, null, 2)
    );
  } finally {
    console.log("✅ Upsert complete");
  }
}

// ---------- Convenience Functions ----------
export async function upsertBookToPurchased(bookId) {
  return upsertBookById(bookId, "PURCHASED");
}

export async function upsertBookToCreated(bookId) {
  console.log("⏳ Waiting 3 seconds for Base44 to save email...");
  await new Promise((resolve) => setTimeout(resolve, 3000));

  return upsertBookById(bookId, "CREATED");
}
