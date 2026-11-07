// server/cron/retry.js
function isTransient(err) {
  if (!err) return false;
  if (err.code === "ECONNRESET" || err.code === "ETIMEDOUT") return true;
  if (err.code === "EFATAL") return true;
  if (err.response?.status >= 500) return true;
  return false;
}

async function withRetry(fn, { retries = 3, delayMs = 2000 } = {}) {
  let lastErr;
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (err) {
      if (!isTransient(err)) throw err;
      lastErr = err;
      console.warn(`[cron] transient attempt ${i + 1} failed:`, err.message);
      await new Promise((r) => setTimeout(r, delayMs * Math.pow(2, i)));
    }
  }
  throw lastErr;
}

module.exports = { withRetry, isTransient };
