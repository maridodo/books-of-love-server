import express from "express";
import { ENV } from "../config/env.js";
import { asyncHandler, escapeHtml } from "../utils.js";
import { sendContactEmails } from "../services/mailer.js";

const router = express.Router();

// JSON parser for /api routes is applied in app.js

router.post(
  "/api/contact",
  asyncHandler(async (req, res) => {
    // Require the shared secret
    const incomingSecret = (req.body?.secret ?? "").toString();
    if (!incomingSecret || incomingSecret !== ENV.BASE44_CONTACT_SECRET) {
      return res.status(401).json({ ok: false, error: "Unauthorized" });
    }

    // Extract fields
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

    const adminHtml = `
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

    const autoReplyHtml = `
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
    `;

    const results = await sendContactEmails({
      name,
      email,
      subject,
      message,
      phone,
      orderRef,
      adminHtml,
      adminText,
      autoReplyHtml,
    });

    results.forEach((r, i) => {
      if (r.status === "rejected") {
        console.error(
          i === 0 ? "❌ Admin email failed:" : "❌ Auto-reply failed:",
          r.reason
        );
      }
    });

    return res.json({ ok: true });
  })
);

export default router;
