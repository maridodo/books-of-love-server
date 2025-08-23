import express from "express";
import bodyParser from "body-parser";
import { stripe } from "../services/stripe.js";
import { sendOrderEmails } from "../services/mailer.js";
import { upsertBookToPurchased } from "../services/monday.js";
//import { sendTikTokPurchaseEvent } from "../services/tiktok.js"; // not in use anymore
import { ENV } from "../config/env.js";
import { asyncHandler } from "../utils.js";

const router = express.Router();

router.post(
  "/stripe-webhook",
  bodyParser.raw({ type: "application/json" }),
  asyncHandler(async (req, res) => {
    console.log("📧 Webhook received from Stripe");

    const sig = req.headers["stripe-signature"];
    let event;
    try {
      event = stripe.webhooks.constructEvent(
        req.body,
        sig,
        ENV.STRIPE_WEBHOOK_SECRET
      );
    } catch (err) {
      console.error("❌ Signature verification failed.", err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    if (event.type === "checkout.session.completed") {
      const session = event.data.object;

      // Only process your app's orders
      if (session.metadata?.source !== "booksoflove") {
        console.log("⚠️ Ignoring webhook: not from booksoflove");
        return res.status(200).send("Ignored");
      }

      console.log("✅ Payment complete from booksoflove!", session.id);

      // Respond to Stripe immediately to avoid timeouts
      res.status(200).send("✅ Webhook received");

      // Post-ack enrichment
      try {
        const lineItems = await stripe.checkout.sessions.listLineItems(
          session.id,
          { limit: 50 }
        );

        // Send emails (existing functionality)
        await sendOrderEmails({ session, lineItems });
        console.log("📧 Order emails sent successfully");

        // Extract book_id and sync to Monday.com
        const bookId = extractBookId(session);

        if (bookId) {
          console.log("📚 Found book_id, syncing to Monday.com:", bookId);
          try {
            const result = await upsertBookToPurchased(bookId);
            console.log("✅ Monday.com sync successful:", result.action);
          } catch (mondayErr) {
            console.error(
              "❌ Monday.com sync failed (non-blocking):",
              mondayErr.message
            );
          }
        } else {
          console.log("ℹ️ No book_id found - skipping Monday.com sync");
        }

        // NEW: Send TikTok purchase event - commented out coz we are soing it client side now
        // try {
        //   const tiktokData = {
        //     event_id: session.id, // Use Stripe session ID as unique event ID
        //     value: session.amount_total / 100, // Convert cents to dollars
        //     currency: session.currency?.toUpperCase() || "USD",
        //     order_id: session.id,
        //     email: session.customer_details?.email || session.customer_email,
        //   };

        //   console.log("🎯 Sending TikTok purchase event:", session.id);
        //   const tiktokResult = await sendTikTokPurchaseEvent(tiktokData);
        //   console.log("✅ TikTok tracking successful:", tiktokResult.success);
        // } catch (tiktokErr) {
        //   console.error(
        //     "❌ TikTok tracking failed (non-blocking):",
        //     tiktokErr.message
        //   );
        //   // Don't throw - we don't want TikTok issues to fail the webhook
        // }
      } catch (err) {
        console.error("🔧 Post-webhook processing failed:", err);
      }
      return;
    }

    // Acknowledge other events
    res.status(200).send("✅ Event ignored");
  })
);

function extractBookId(session) {
  return session.metadata?.book_id || null;
}

export default router;
