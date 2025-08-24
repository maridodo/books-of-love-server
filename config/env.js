// config/env.js - Claude v27 - Added Google API credentials
import dotenv from "dotenv";
dotenv.config();

const required = [
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "EMAIL_USER",
  "EMAIL_PASS",

  // ✅ Base44: required for our dev routes & webhook enrichment
  "BASE44_APP_ID",
  "BASE44_SERVER_API_KEY",

  // Monday.com
  "MONDAY_API_TOKEN",

  // Google API (for Google Docs)
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "GOOGLE_REFRESH_TOKEN",

  // TikTok: required for server-side purchase tracking
  "TIKTOK_ACCESS_TOKEN",
];

const missing = required.filter((k) => !process.env[k]);
if (missing.length) {
  console.warn("⚠️ Missing environment variables:", missing.join(", "));
  // If you prefer a hard fail in dev, uncomment:
  // throw new Error(`Missing env: ${missing.join(", ")}`);
}

export const ENV = {
  // Runtime
  NODE_ENV: process.env.NODE_ENV || "development",
  PORT: process.env.PORT || "3000",

  // Stripe
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
  STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,

  // Mail
  EMAIL_USER: process.env.EMAIL_USER,
  EMAIL_PASS: process.env.EMAIL_PASS,

  // Base44
  BASE44_API_URL: process.env.BASE44_API_URL || "https://app.base44.com",
  BASE44_APP_ID: process.env.BASE44_APP_ID,
  BASE44_SERVER_API_KEY: process.env.BASE44_SERVER_API_KEY,

  // Monday
  MONDAY_API_URL: process.env.MONDAY_API_URL || "https://api.monday.com",
  MONDAY_API_TOKEN: process.env.MONDAY_API_TOKEN,

  // Google API
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
  GOOGLE_REFRESH_TOKEN: process.env.GOOGLE_REFRESH_TOKEN,

  // TikTok
  TIKTOK_ACCESS_TOKEN: process.env.TIKTOK_ACCESS_TOKEN,
  TIKTOK_PIXEL_ID: process.env.TIKTOK_PIXEL_ID || "D2HBRHBC7U76CJBP4G",

  // Misc
  DEBUG_SECRET: process.env.DEBUG_SECRET || "",
  BASE44_CONTACT_SECRET: process.env.BASE44_CONTACT_SECRET || "",
  IS_PROD: (process.env.NODE_ENV || "").toLowerCase() === "production",
  IS_DEV: (process.env.NODE_ENV || "").toLowerCase() !== "production",
};
