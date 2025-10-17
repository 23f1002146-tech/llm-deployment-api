import axios from "axios";

export async function notifyEvaluation(url, data) {
  try {
    await axios.post(url, data, { headers: { "Content-Type": "application/json" } });
    console.log(`📬 Notified evaluator successfully at ${url}`);
  } catch (err) {
    console.error("❌ Notify failed:", err.response?.data || err.message);
  }
}
