// Add this to your existing router file (alongside your /api/contact endpoint)

import { upsertBookToCreated } from "../services/monday.js";

router.post(
  "/api/book-created",
  asyncHandler(async (req, res) => {
    // Require the shared secret (same pattern as contact)
    const incomingSecret = (req.body?.secret ?? "").toString();
    if (!incomingSecret || incomingSecret !== ENV.BASE44_CONTACT_SECRET) {
      return res.status(401).json({ ok: false, error: "Unauthorized" });
    }

    // Extract fields
    const bookId = (req.body?.book_id ?? "").toString().trim();
    const userEmail = (req.body?.email ?? "").toString().trim(); // Changed from user_email to email
    const source = (req.body?.source ?? "").toString().trim(); // Optional source field

    // 1. LOG: Received request
    console.log("🎯 === BOOK CREATION WEBHOOK RECEIVED ===");
    console.log(`📖 Book ID: ${bookId}`);
    console.log(`📧 Email: ${userEmail || "not provided"}`);
    console.log(`📍 Source: ${source || "not provided"}`);
    console.log("============================================");

    if (!bookId) {
      console.log("❌ Missing book_id, returning 400");
      return res
        .status(400)
        .json({ ok: false, error: "Missing required field: book_id" });
    }

    try {
      // 2. LOG: About to fetch from Base44 (this happens inside upsertBookToCreated)
      console.log(
        `🔍 Fetching book data from Base44 for book ID: ${bookId}...`
      );

      // Send to "Created" table using the new function
      const result = await upsertBookToCreated(bookId);

      // 3. LOG: Success response from Monday
      console.log("✅ === MONDAY.COM RESPONSE SUCCESS ===");
      console.log(`📝 Action: ${result.action}`);
      console.log(`🆔 Monday Item ID: ${result.itemId}`);
      console.log(`📋 Board Type: ${result.boardType}`);
      console.log(`🔗 URL: ${result.url || "N/A"}`);
      console.log("======================================");

      return res.json({
        ok: true,
        action: result.action,
        itemId: result.itemId,
        boardType: result.boardType,
      });
    } catch (error) {
      console.error("❌ === ERROR IN BOOK CREATION PROCESS ===");
      console.error(`📖 Book ID: ${bookId}`);
      console.error(`📧 Email: ${userEmail || "not provided"}`);
      console.error(`🔥 Error: ${error.message}`);
      console.error(`🔍 Full error:`, error);
      console.error("========================================");

      return res.status(500).json({
        ok: false,
        error: "Internal server error",
        details: error.message,
      });
    }
  })
);

export default router;
