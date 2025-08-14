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

//Webhook endpoint for checkout session completion from stripe
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

      // 🛑 Only process your app’s orders
      if (session.metadata?.source !== "booksoflove") {
        console.log("⚠️ Ignoring webhook: not from booksoflove");
        return res.status(200).send("Ignored");
      }

      console.log("✅ Payment complete from booksoflove!", session.id);

      // ✅ Acknowledge to Stripe immediately (don’t risk timeouts)
      res.status(200).send("✅ Webhook received");

      // 🔎 Enrich details after responding
      try {
        // Get line items
        const lineItems = await stripe.checkout.sessions.listLineItems(
          session.id,
          { limit: 50 }
        );

        // Optionally expand more objects if you need them:
        // const fullSession = await stripe.checkout.sessions.retrieve(session.id, {
        //   expand: ["payment_intent", "customer"],
        // });

        await sendOrderEmails(session, lineItems);
      } catch (err) {
        console.error("📧 Email send failed:", err);
      }
      return; // important: don't fall through to the 200 below
    }

    // For other event types, just 200 OK
    res.status(200).send("✅ Event ignored");
  }
);

// Stripe requires the raw body
// app.post(
//   "/stripe-webhook",
//   bodyParser.raw({ type: "application/json" }),
//   async (req, res) => {
//     console.log("🔔 Webhook received from Stripe");

//     const sig = req.headers["stripe-signature"];
//     const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

//     let event;

//     try {
//       event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
//     } catch (err) {
//       console.error("❌ Signature verification failed.", err.message);
//       return res.status(400).send(`Webhook Error: ${err.message}`);
//     }

//     if (event.type === "checkout.session.completed") {
//       const session = event.data.object;

//       // 🛑 Filter out non-Base44 orders
//       if (session.metadata?.source !== "booksoflove") {
//         console.log("⚠️ Ignoring webhook: not from booksoflove");
//         return res.status(200).send("Ignored");
//       }

//       console.log("✅ Payment complete from booksoflove!", session);

//       // Send email only for Base44 orders
//       await sendOrderEmail(session);
//     }

//     res.status(200).send("✅ Webhook received");
//   }
// );

async function sendOrderEmails(session, lineItems) {
  const bookTitle = session.metadata?.book_title || "Your Book";
  const customerEmail = session.customer_details?.email || "";
  const customerName = session.customer_details?.name || "Customer";
  const currency = (session.currency || "usd").toUpperCase();
  const amountPaid = (session.amount_total / 100).toFixed(2);
  const localeAmount = `${amountPaid} ${currency}`;

  const items = (lineItems?.data || []).map((li) => ({
    name: li.description,
    qty: li.quantity,
    unitAmount: (li.price?.unit_amount ?? 0) / 100,
    subtotal: (li.amount_subtotal ?? 0) / 100,
  }));

  const transporter = nodemailer.createTransport({
    service: "Gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  // 1) Customer confirmation (same as before)
  const customerMail = {
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

  // 2) Admin notification
  const adminText = [
    `A new order has been placed!`,
    ``,
    `Customer: ${customerName} <${customerEmail}>`,
    `Amount Paid: ${localeAmount}`,
    ``,
    `Items:`,
    ...items.map(
      (i) => `- ${i.name} x${i.qty} — ${i.subtotal.toFixed(2)} ${currency}`
    ),
    ``,
    `Book Title: ${bookTitle}`,
    `Stripe Session ID: ${session.id}`,
  ].join("\n");

  const adminHTML = `
    <div style="font-family:Arial, sans-serif;line-height:1.5">
      <h2>🧾 New Order Received</h2>
      <p><strong>Customer:</strong> ${escapeHtml(
        customerName
      )} &lt;${escapeHtml(customerEmail)}&gt;</p>
      <p><strong>Amount Paid:</strong> ${localeAmount}</p>
      <h3>Items</h3>
      <ul>
        ${items
          .map(
            (i) =>
              `<li>${escapeHtml(i.name)} ×${i.qty} — ${i.subtotal.toFixed(
                2
              )} ${currency}</li>`
          )
          .join("")}
      </ul>
      <p><strong>Book Title:</strong> ${escapeHtml(bookTitle)}</p>
      <p><strong>Stripe Session ID:</strong> ${session.id}</p>
    </div>
  `;

  const adminMail = {
    from: '"Books of Love" <no-reply@talesofme.io>',
    to: "info@talesofme.io",
    subject: `📚 New Order – ${bookTitle}`,
    text: adminText,
    html: adminHTML,
  };

  await Promise.allSettled([
    transporter.sendMail(customerMail),
    transporter.sendMail(adminMail),
  ]);
}

function escapeHtml(str = "") {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

// async function sendOrderEmail(session) {
//   const bookTitle = session.metadata.book_title || "Your Book";
//   const orderNumber = session.metadata.order_number || "N/A";
//   const customerEmail = session.customer_details.email;

//   const transporter = nodemailer.createTransport({
//     service: "Gmail", // Only if you're using Gmail
//     auth: {
//       user: process.env.EMAIL_USER,
//       pass: process.env.EMAIL_PASS,
//     },
//   });

//   const mailOptions = {
//     from: '"Books of Love" <no-reply@talesofme.io>',
//     to: customerEmail,
//     subject: "Your Love Book Order Is Confirmed!",
//     text: `Thank you for your order!
// Your Love Book is now being created and prepared for print.

// Book Title: ${bookTitle}

// We can’t wait for you to see it!

// With big love,
// Books of Love Team`,
//   };

//   await transporter.sendMail(mailOptions);
// }

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
