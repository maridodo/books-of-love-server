import dotenv from "dotenv";
dotenv.config();

const required = [
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "EMAIL_USER",
  "EMAIL_PASS",
  // Optional for contact endpoint; if you use it, set it.
  "BASE44_CONTACT_SECRET",
];

const missing = required.filter((k) => !process.env[k]);
if (missing.length) {
  console.warn("⚠️ Missing environment variables:", missing.join(", "));
  // Don’t throw here if you want the app to boot without all routes enabled.
  // If you prefer hard-fail, uncomment:
  // throw new Error(`Missing env: ${missing.join(", ")}`);
}

export const ENV = {
  PORT: process.env.PORT || "3000",
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
  STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
  EMAIL_USER: process.env.EMAIL_USER,
  EMAIL_PASS: process.env.EMAIL_PASS,
  BASE44_CONTACT_SECRET: process.env.BASE44_CONTACT_SECRET || "", // allow empty → contact route will 401
};
