import express from "express";
import Stripe from "stripe";
import dotenv from "dotenv";
import bodyParser from "body-parser";
import nodemailer from "nodemailer";

dotenv.config();

const app = express();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2022-11-15",
});

// Stripe requires the raw body
app.post(
  "/stripe-webhook",
  bodyParser.raw({ type: "application/json" }),
  async (req, res) => {
    console.log("🔔 Webhook received from Stripe");

    const sig = req.headers["stripe-signature"];
    const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

    let event;

    try {
      event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
    } catch (err) {
      console.error("❌ Signature verification failed.", err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    if (event.type === "checkout.session.completed") {
      const session = event.data.object;

      // 🛑 Filter out non-Base44 orders
      if (session.metadata?.source !== "booksoflove") {
        console.log("⚠️ Ignoring webhook: not from booksoflove");
        return res.status(200).send("Ignored");
      }

      console.log("✅ Payment complete from booksoflove!", session);

      // Send email only for Base44 orders
      await sendOrderEmail(session);
    }

    res.status(200).send("✅ Webhook received");
  }
);

async function sendOrderEmail(session) {
  const bookTitle = session.metadata.book_title || "Your Book";
  const orderNumber = session.metadata.order_number || "N/A";
  const customerEmail = session.customer_details.email;

  const transporter = nodemailer.createTransport({
    service: "Gmail", // Only if you're using Gmail
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  const mailOptions = {
    from: '"Books of Love" <no-reply@talesofme.io>',
    to: customerEmail,
    subject: "Your Love Book Order Is Confirmed!",
    text: `Thank you for your order!
Your Love Book is now being created and prepared for print.

Book Title: ${bookTitle}

We can’t wait for you to see it!

With big love,
Books of Love Team`,
  };

  await transporter.sendMail(mailOptions);
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
