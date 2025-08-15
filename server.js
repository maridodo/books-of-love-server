import express from "express";
import Stripe from "stripe";
import dotenv from "dotenv";
import bodyParser from "body-parser";
import nodemailer from "nodemailer";
import crypto from "node:crypto";
import { createClient as createBase44Client } from "@base44/sdk";

dotenv.config();

// ✅ Warn if required environment variables are missing
[
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "EMAIL_USER",
  "EMAIL_PASS",
  "BASE44_CONTACT_SECRET",
].forEach((k) => {
  if (!process.env[k]) {
    console.warn(`⚠️ Missing env var: ${k}`);
  }
});

const BASE44_API_URL = process.env.BASE44_API_URL || "https://app.base44.com";
const BASE44_APP_ID = process.env.BASE44_APP_ID; // e.g. 6880b6507073b18d04501aed
const BASE44_API_KEY = process.env.BASE44_SERVER_API_KEY; // keep in env, don't hardcode

// create Base44 client
const base44 = createBase44Client({
  appId: process.env.BASE44_APP_ID,
  apiKey: process.env.BASE44_SERVER_API_KEY,
});

// Monday constants
const MONDAY_API_URL = "https://api.monday.com/v2";
const BOARD_ID = 2048516652; // PURCHASES - NEW

const app = express();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2024-06-20",
});

// JSON parser only for /api routes (Stripe still uses raw body)
app.use("/api", express.json());

const transporter = nodemailer.createTransport({
  service: "Gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
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

      // for dev purposes, log the session ID and metadata
      console.log("🔐 Base44 key ends with:", (BASE44_API_KEY || "").slice(-4));
      console.log("📘 Book ID:", session.metadata?.book_id);

      if (session.metadata?.source !== "booksoflove") {
        console.log("⚠️ Ignoring webhook: not from booksoflove");
        return res.status(200).send("Ignored");
      }

      console.log("✅ Payment complete from booksoflove!", session.id);

      // ✅ Acknowledge Stripe immediately
      res.status(200).send("✅ Webhook received");

      // 🔎 Fetch and log Book after ack
      (async () => {
        const bookId = session.metadata?.book_id;
        if (!bookId) {
          console.warn(
            "⚠️ No book_id in Stripe metadata; skipping Base44 fetch"
          );
          return;
        }
        if (!BASE44_APP_ID || !BASE44_API_KEY) {
          console.error(
            "❌ Missing BASE44_APP_ID or BASE44_SERVER_API_KEY env vars"
          );
          return;
        }

        try {
          const book = await getBookById(bookId);
          console.log("📚 Base44 Book record:");
          console.dir(book, { depth: null });
        } catch (e) {
          console.error("❌ Error fetching Book from Base44:", e.message);
        }
      })();

      return; // don’t fall through
    }

    res.status(200).send("✅ Event ignored");
  }
);

// Helper function to fetch Book by ID from Base44
async function getBookById(bookId) {
  const url = `${BASE44_API_URL}/api/apps/${encodeURIComponent(
    BASE44_APP_ID
  )}/entities/Book/${encodeURIComponent(bookId)}`;
  const res = await fetch(url, {
    method: "GET",
    headers: {
      api_key: BASE44_API_KEY,
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Base44 GET ${url} failed: ${res.status} ${res.statusText} ${text}`
    );
  }
  return res.json();
}
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

// .env must include: BASE44_CONTACT_SECRET=supersecretstring
app.post("/api/contact", async (req, res) => {
  const reqId = crypto.randomUUID();

  const incomingSecret = (req.body?.secret ?? "").toString();
  const serverSecret = process.env.BASE44_CONTACT_SECRET || "";

  // Log masked tails + lengths (never full values)
  console.log(`🔐 [contact ${reqId}] secrets`, {
    incomingLen: incomingSecret.length,
    incomingTail: maskTail(incomingSecret),
    serverLen: serverSecret.length,
    serverTail: maskTail(serverSecret),
  });

  // Use constant-time compare to avoid timing leaks
  const authorized = timingSafeEq(incomingSecret, serverSecret);
  if (!authorized) {
    console.warn(`🚫 [contact ${reqId}] Unauthorized: secret mismatch`);
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }

  try {
    // 🔐 Require the shared secret
    if (req.body?.secret !== process.env.BASE44_CONTACT_SECRET) {
      return res.status(401).json({ ok: false, error: "Unauthorized" });
    }

    // 🧹 Extract fields
    const name = (req.body?.name ?? "").toString().trim();
    const email = (req.body?.email ?? "").toString().trim();
    const subject = (req.body?.subject ?? "New Contact Form").toString().trim();
    const message = (req.body?.message ?? "").toString().trim();
    const phone = (req.body?.phone ?? "").toString().trim();
    const orderRef = (req.body?.orderRef ?? "").toString().trim();

    if (!name || !email || !message) {
      return res
        .status(400)
        .json({ ok: false, error: "Missing required fields" });
    }

    // ✉️ Admin email to info@talesofme.io
    const adminText = [
      `New contact form submission:`,
      ``,
      `Name: ${name}`,
      `Email: ${email}`,
      phone ? `Phone: ${phone}` : null,
      orderRef ? `Order Ref: ${orderRef}` : null,
      ``,
      `Subject: ${subject}`,
      ``,
      `Message:`,
      message,
    ]
      .filter(Boolean)
      .join("\n");

    const adminHTML = `
      <div style="font-family:Arial, sans-serif;line-height:1.5">
        <h2>📨 New Contact Form</h2>
        <p><strong>Name:</strong> ${escapeHtml(name)}</p>
        <p><strong>Email:</strong> ${escapeHtml(email)}</p>
        ${phone ? `<p><strong>Phone:</strong> ${escapeHtml(phone)}</p>` : ""}
        ${
          orderRef
            ? `<p><strong>Order Ref:</strong> ${escapeHtml(orderRef)}</p>`
            : ""
        }
        <p><strong>Subject:</strong> ${escapeHtml(subject)}</p>
        <h3>Message</h3>
        <pre style="white-space:pre-wrap;background:#f8f8f8;padding:12px;border-radius:8px;border:1px solid #eee;">${escapeHtml(
          message
        )}</pre>
      </div>
    `;

    const adminMail = {
      from: '"Books of Love" <no-reply@talesofme.io>',
      to: "info@talesofme.io",
      subject: `📨 Contact – ${subject}`,
      text: adminText,
      html: adminHTML,
      replyTo: email,
    };

    // (Optional) auto‑reply — comment out if not needed
    const autoReply = {
      from: '"Books of Love" <no-reply@talesofme.io>',
      to: email,
      subject: `We received your message ✔️`,
      text: `Hi ${name},

Thanks for reaching out! We received your message and will get back to you shortly.

Subject: ${subject}

${message}

With love,
Books of Love Team`,
      html: `
        <div style="font-family:Arial,sans-serif;line-height:1.6">
          <p>Hi ${escapeHtml(name)},</p>
          <p>Thanks for reaching out! We received your message and will get back to you shortly.</p>
          <p><strong>Subject:</strong> ${escapeHtml(subject)}</p>
          <p><strong>Message:</strong></p>
          <pre style="white-space:pre-wrap;background:#f8f8f8;padding:12px;border-radius:8px;border:1px solid #eee;">${escapeHtml(
            message
          )}</pre>
          <p>With love,<br/>Books of Love Team</p>
        </div>
      `,
    };

    const results = await Promise.allSettled([
      transporter.sendMail(adminMail),
      transporter.sendMail(autoReply), // ← remove this line to disable auto‑reply
    ]);

    // Log failures for observability
    results.forEach((r, i) => {
      if (r.status === "rejected") {
        console.error(
          i === 0 ? "❌ Admin email failed:" : "❌ Auto-reply failed:",
          r.reason
        );
      }
    });

    return res.json({ ok: true });
  } catch (err) {
    console.error("❌ /api/contact error:", err);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
});

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

//helper
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

//Logging utility to mask sensitive info (secret from base44)
function maskTail(s = "") {
  if (!s) return "(missing)";
  if (s.length <= 6) return "*".repeat(s.length);
  return `${s.slice(0, 2)}…${s.slice(-4)}`;
}

function timingSafeEq(a = "", b = "") {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

// 🔐 Log masked secret info (for quick sanity check)
const sec = process.env.BASE44_CONTACT_SECRET || "";
if (!sec) {
  console.warn("🚫 BASE44_CONTACT_SECRET is EMPTY/undefined");
} else {
  console.log(
    `🔐 CONTACT_SECRET length=${sec.length}, endsWith=${sec.slice(-4)}`
  );
}
