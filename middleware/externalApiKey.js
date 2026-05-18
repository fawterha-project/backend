import process from "node:process";

// Verifies the X-API-Key header against EXTERNAL_API_KEY from .env.
// Used to protect endpoints that external systems (like odoo) call.
export const requireExternalApiKey = (req, res, next) => {
  const expected = process.env.EXTERNAL_API_KEY;
  if (!expected) {
    console.error("[external-api-key] EXTERNAL_API_KEY env var is not set");
    return res.status(500).json({ error: "Server misconfigured" });
  }
  if (req.headers["x-api-key"] !== expected) {
    return res.status(403).json({ error: "Forbidden — invalid API key" });
  }
  next();
};
