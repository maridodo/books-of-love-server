// server.js (or index.js)
import express from "express";
import { ENV } from "./config/env.js";
import stripeWebhookRouter from "./routes/stripeWebhook.js";
import contactRouter from "./routes/contact.js";
// import devBase44Router from "./routes/dev-base44.js";
// import devBase44ListRouter from "./routes/dev-base44-list.js";
// import devBase44RawRouter from "./routes/dev-base44-raw.js";
// import devBase44RecentRouter from "./routes/dev-base44-recent.js";

// Build app
const app = express();
app.set("trust proxy", 1); // <-- here

app.use("/api", express.json());
app.get("/healthz", (req, res) => res.json({ ok: true }));
app.use(stripeWebhookRouter);
app.use(contactRouter);
// app.use(devBase44Router);
// app.use(devBase44ListRouter);
// app.use(devBase44RawRouter);
// app.use(devBase44RecentRouter);

// Error handler
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ ok: false, error: "Server error" });
});

// Start server
app.listen(ENV.PORT, () => {
  console.log(`🚀 Server rrrunning on port ${ENV.PORT}`);
});
