// services/tiktok.js
import axios from "axios";
import { ENV } from "../config/env.js";

/**
 * Send purchase event to TikTok Events API
 * @param {Object} purchaseData - The purchase information
 * @param {string} purchaseData.event_id - Unique event ID (prevents duplicates)
 * @param {number} purchaseData.value - Order total
 * @param {string} purchaseData.currency - Currency code
 * @param {string} purchaseData.order_id - Order/session ID
 * @param {string} purchaseData.email - Customer email (hashed automatically)
 * @returns {Promise<Object>} Response from TikTok API
 */
export async function sendTikTokPurchaseEvent(purchaseData) {
  // Use ENV configuration
  const TIKTOK_PIXEL_ID = ENV.TIKTOK_PIXEL_ID;
  const TIKTOK_ACCESS_TOKEN = ENV.TIKTOK_ACCESS_TOKEN;

  if (!TIKTOK_ACCESS_TOKEN) {
    throw new Error("TikTok access token not configured");
  }

  if (!TIKTOK_PIXEL_ID) {
    throw new Error("TikTok pixel ID not configured");
  }

  const payload = {
    pixel_code: TIKTOK_PIXEL_ID,
    event: "CompletePayment",
    event_id: purchaseData.event_id,
    timestamp: Math.floor(Date.now() / 1000),
    properties: {
      content_type: "product",
      value: parseFloat(purchaseData.value),
      currency: purchaseData.currency || "USD",
      order_id: purchaseData.order_id,
      ...(purchaseData.email && { email: purchaseData.email }),
    },
    context: {
      user_agent: "BooksOfLove-Server/1.0",
      ip: "127.0.0.1", // Server IP - TikTok will use this for basic attribution
    },
  };

  try {
    const response = await axios.post(
      "https://business-api.tiktok.com/open_api/v1.3/pixel/track/",
      payload,
      {
        headers: {
          "Access-Token": TIKTOK_ACCESS_TOKEN,
          "Content-Type": "application/json",
        },
        timeout: 10000, // 10 second timeout
      }
    );

    return {
      success: true,
      data: response.data,
    };
  } catch (error) {
    console.error("TikTok API Error:", error.response?.data || error.message);
    throw new Error(`TikTok tracking failed: ${error.message}`);
  }
}
