import mondaySdk from "monday-sdk-js";
import { ENV } from "../config/env.js";
import { getBookById } from "./base44.js";
import { createGoogleDocWithPages } from "./googleDocs.js";

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
  generated_pages: "long_text_mkv0v67a", // Long text (generatedPages JSON) - keeping for backward compatibility
  generated_pages_docs: {
    PURCHASED: "doc_mkv4jk7r", // Doc column for purchased books
    CREATED: "doc_mkv4b5an", // Doc column for created books
  },
  generated_pages_link: {
    PURCHASED: "link_mkv0w7p8", // Link column for Google Docs (reusing photo URL column)
    CREATED: "link_mkv0w7p8", // Link column for Google Docs (same column ID)
  },
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

// Create Google Doc and add link to Monday.com
async function createGeneratedPagesGoogleDoc(
  itemId,
  boardType,
  generatedPages,
  bookTitle
) {
  if (
    !generatedPages ||
    !Array.isArray(generatedPages) ||
    generatedPages.length === 0
  ) {
    console.log("📄 No generated pages to create Google Doc");
    return null;
  }

  console.log(`📄 Creating Google Doc for ${boardType} board...`);

  try {
    // Create Google Doc
    const docResult = await createGoogleDocWithPages(
      generatedPages,
      bookTitle,
      boardType
    );

    if (!docResult) {
      console.log("📄 Failed to create Google Doc");
      return null;
    }

    // Add Google Doc link to Monday.com item
    console.log("📄 Adding Google Doc link to Monday.com...");
    await addGoogleDocLinkToMonday(
      itemId,
      docResult.docUrl,
      boardType,
      docResult.title
    );

    return docResult;
  } catch (error) {
    console.error("❌ Error in Google Doc creation process:", error);
    return null;
  }
}

// Add Google Doc link to Monday.com item
async function addGoogleDocLinkToMonday(itemId, docUrl, boardType, docTitle) {
  try {
    const linkColumnId = COL.generated_pages_link[boardType];

    if (!linkColumnId) {
      console.log("📄 No link column configured for Google Doc");
      return;
    }

    const mutation = `
      mutation ($itemId: ID!, $columnId: String!, $value: String!) {
        change_column_value(item_id: $itemId, column_id: $columnId, value: $value) {
          id
        }
      }
    `;

    const linkValue = JSON.stringify({
      url: docUrl,
      text: docTitle || "Generated Pages Document",
    });

    const response = await monday.api(mutation, {
      variables: {
        itemId: itemId,
        columnId: linkColumnId,
        value: linkValue,
      },
    });

    if (response.errors) {
      console.error("📄 Monday.com link update errors:", response.errors);
    } else {
      console.log("📄 Google Doc link added to Monday.com successfully");
    }
  } catch (error) {
    console.error("❌ Error adding Google Doc link to Monday.com:", error);
  }
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

function mapBookToColumnValues(book, boardType) {
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

    // Generated pages - now handled by Google Docs
    long_text_mkv0v67a: book.generatedPages
      ? {
          text: `Generated ${
            Array.isArray(book.generatedPages)
              ? book.generatedPages.length
              : "N/A"
          } pages - see Google Doc link`,
        }
      : null,

    // Pages fingerprint
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
  const valuesJson = JSON.stringify(mapBookToColumnValues(book, boardType));

  let resultItemId = null;
  let action = null;

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
      resultItemId = String(existing.id);
      action = "updated";
      console.log("✅ Updated:", updated || "(no payload)");
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
      resultItemId = created?.id ? String(created.id) : null;
      action = "created";
      console.log("✅ Created:", created || "(no payload)");
    }

    // 4) Create Google Doc with generated pages
    if (resultItemId && book.generatedPages) {
      console.log("📄 Creating Google Doc with generated pages...");
      await createGeneratedPagesGoogleDoc(
        resultItemId,
        boardType,
        book.generatedPages,
        book.book_idea_title || book.title || "Untitled Book"
      );
    } else if (resultItemId && !book.generatedPages) {
      console.log("📄 No generated pages found - skipping Google Doc creation");
    } else if (!resultItemId) {
      console.log("📄 No valid item ID - skipping Google Doc creation");
    }

    const url = resultItemId
      ? `https://app.monday.com/boards/${boardId}/pulses/${resultItemId}`
      : "";

    if (resultItemId) console.log("🔗 Open item:", url);
    else
      console.log(
        "⚠️ No item id returned. Raw:",
        JSON.stringify(resp, null, 2)
      );

    return { action, itemId: resultItemId, url, boardType };
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
  console.log("⏳ Waiting 20 seconds for Base44 to save email...");
  await new Promise((resolve) => setTimeout(resolve, 20000));

  return upsertBookById(bookId, "CREATED");
}
