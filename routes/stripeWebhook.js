import express from "express";
import bodyParser from "body-parser";
import { stripe } from "../services/stripe.js";
import { sendOrderEmails } from "../services/mailer.js";
import { ENV } from "../config/env.js";
import { asyncHandler } from "../utils.js";

const router = express.Router();

/**
 * Stripe requires the RAW body for signature verification.
 * We attach bodyParser.raw ON THIS ROUTE ONLY.
 */
router.post(
  "/stripe-webhook",
  bodyParser.raw({ type: "application/json" }),
  asyncHandler(async (req, res) => {
    console.log("🔔 Webhook received from Stripe");

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

      // Only process your app’s orders
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
        await sendOrderEmails({ session, lineItems });
      } catch (err) {
        console.error("📧 Email send failed:", err);
      }
      return;
    }

    // Acknowledge other events
    res.status(200).send("✅ Event ignored");
  })
);

export default router;
