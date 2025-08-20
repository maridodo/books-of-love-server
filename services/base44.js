import axios from "axios";
import { ENV } from "../config/env.js";

const { BASE44_API_URL, BASE44_APP_ID, BASE44_SERVER_API_KEY } = ENV;

export async function getBookById(bookId) {
  if (!BASE44_APP_ID || !BASE44_SERVER_API_KEY) {
    throw new Error("Missing BASE44_APP_ID or BASE44_SERVER_API_KEY");
  }

  const url = `${BASE44_API_URL}/api/apps/${encodeURIComponent(
    BASE44_APP_ID
  )}/entities/Book/${encodeURIComponent(bookId)}`;

  const res = await axios.get(url, {
    headers: {
      api_key: BASE44_SERVER_API_KEY,
      "Content-Type": "application/json",
    },
    timeout: 10000,
  });

  return res.data;
}
