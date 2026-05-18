import express from "express";
import { importOdooInvoice } from "../services/odooService.js";
import { requireExternalApiKey } from "../middleware/externalApiKey.js";

const router = express.Router();

// All routes in this file require the X-API-Key header
router.use(requireExternalApiKey);

// POST /external/invoices — receives a single invoice from Odoo
router.post("/invoices", async (req, res) => {
  const result = await importOdooInvoice(req.body);

  if (result.error) {
    // User-not-found is a 404 (so Odoo's team knows to fix the email)
    if (result.error.startsWith("No Fawterha user found")) {
      return res.status(404).json({ error: result.error });
    }
    // Everything else is a 400 (validation, DB constraints, etc.)
    return res.status(400).json({ error: result.error });
  }

  // Duplicate retry — return 200 with the existing invoice (idempotent)
  if (result.duplicate) {
    return res.status(200).json({
      message: "Invoice already imported",
      duplicate: true,
      receipt: result.receipt,
    });
  }

  // New invoice — return 201 Created
  return res.status(201).json({
    message: "Invoice imported successfully",
    receipt: result.receipt,
  });
});

export default router;
