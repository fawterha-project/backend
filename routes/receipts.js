import express from "express";
import {
  storeReceipt,
  getUserReceipts,
  deleteReceipt,
} from "../services/receiptsService.js";

const router = express.Router();

router.post("/", async (req, res) => {
  const {
    users_id,
    merchant_id,
    title,
    invoice_number,
    merchant_name,
    merchant_address,
    issued_at,
    merchant_vat,
    subtotal,
    vat_amount,
    total_price,
    payment_method,
    discount_amount,
    points_used,
    category_id,
    is_favorite,
    qr_code,
    extra_data,
  } = req.body;

  if (
    !users_id ||
    !merchant_id ||
    !title ||
    !invoice_number ||
    !merchant_name ||
    !issued_at ||
    !payment_method ||
    !total_price
  ) {
    return res
      .status(400)
      .json({
        error:
          "users_id, merchant_id, title, invoice_number, merchant_name, issued_at, payment_method and total_price are required",
      });
  }

  const result = await storeReceipt({
    users_id,
    merchant_id,
    title,
    invoice_number,
    merchant_name,
    merchant_address,
    issued_at,
    merchant_vat,
    subtotal,
    vat_amount,
    total_price,
    payment_method,
    discount_amount,
    points_used,
    category_id,
    is_favorite,
    qr_code,
    extra_data,
  });

  if (result.error) {
    return res.status(400).json({ error: result.error });
  }

  res
    .status(201)
    .json({ message: "Receipt stored successfully", receipt: result.receipt });
});

router.get("/", async (req, res) => {
  const { users_id } = req.query;

  if (!users_id) {
    return res.status(400).json({ error: "users_id is required" });
  }

  const result = await getUserReceipts(users_id);

  if (result.error) {
    return res.status(400).json({ error: result.error });
  }

  res.status(200).json({ receipts: result.receipts });
});

router.delete("/:id", async (req, res) => {
  const { id } = req.params;

  if (!id) {
    return res.status(400).json({ error: "invoice_id is required" });
  }

  const result = await deleteReceipt(id);

  if (result.error) {
    return res.status(400).json({ error: result.error });
  }

  res.status(200).json({ message: "Receipt deleted successfully" });
});

export default router;
