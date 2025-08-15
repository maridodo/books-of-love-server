import nodemailer from "nodemailer";
import { ENV } from "../config/env.js";

export const transporter = nodemailer.createTransport({
  service: "Gmail",
  auth: {
    user: ENV.EMAIL_USER,
    pass: ENV.EMAIL_PASS,
  },
});

// --- Email helpers used by routes ---

export async function sendOrderEmails({ session, lineItems }) {
  const bookTitle = session.metadata?.book_title || "Your Book";
  const customerEmail = session.customer_details?.email || "";
  const customerName = session.customer_details?.name || "Customer";
  const currency = (session.currency || "usd").toUpperCase();
  const amountPaid = (session.amount_total / 100).toFixed(2);
  const localeAmount = `${amountPaid} ${currency}`;

  const items = (lineItems?.data || []).map((li) => ({
    name: li.description,
    qty: li.quantity,
    subtotal: (li.amount_subtotal ?? 0) / 100,
  }));

  // 1) Customer confirmation
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

  const adminMail = {
    from: '"Books of Love" <no-reply@talesofme.io>',
    to: "info@talesofme.io",
    subject: `📚 New Order – ${bookTitle}`,
    text: adminText,
  };

  await Promise.allSettled([
    transporter.sendMail(customerMail),
    transporter.sendMail(adminMail),
  ]);
}

export async function sendContactEmails({
  name,
  email,
  subject,
  message,
  phone,
  orderRef,
  adminHtml,
  adminText,
  autoReplyHtml,
}) {
  const adminMail = {
    from: '"Books of Love" <no-reply@talesofme.io>',
    to: "info@talesofme.io",
    subject: `📨 Contact – ${subject}`,
    text: adminText,
    html: adminHtml,
    replyTo: email,
  };

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
    html: autoReplyHtml,
  };

  return Promise.allSettled([
    transporter.sendMail(adminMail),
    transporter.sendMail(autoReply),
  ]);
}
