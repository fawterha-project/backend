
import express from "express";
import multer from "multer";
import { authMiddleware } from "../middleware/authMiddleware.js";

import {
  uploadReceiptAttachment,
  getUserAttachments,
  deleteAttachment,
  getUserReceipts,
  getReceiptById,
  deleteReceipt,
  extractInvoiceDataWithAI, 
  createInvoiceFromAttachment,
} from "../services/receiptsService.js";

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5 MB
  },
});

// 1. رفع الفاتورة (صورة أو PDF)
router.post("/upload", authMiddleware, upload.single("file"), async (req, res) => {
  try {
    const result = await uploadReceiptAttachment(
      req.user.users_id,
      req.file,
      req.body
    );

    if (result.error) {
      return res.status(400).json({ message: result.error });
    }

    res.status(201).json({
      message: "File uploaded successfully",
      attachment: result.attachment,
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

router.post("/attachments/:id/process", authMiddleware, async (req, res) => {
  try {
  
    const result = await extractInvoiceDataWithAI(
      req.params.id,
      req.user.users_id
    );

    if (result.error) {
      return res.status(400).json({
        message: result.error,
      });
    }

  
    res.status(200).json({
      message: "Data extracted successfully",
      extracted_data: result.extracted
    });
  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
});


router.post("/attachments/:id/create-invoice", authMiddleware, async (req, res) => {
    try {
     
     
      const result = await createInvoiceFromAttachment(
        req.params.id,
        req.user.users_id
      );

      if (result.error) {
        return res.status(400).json({
          message: result.error,
        });
      }

      res.status(201).json(result);
    } catch (error) {
      res.status(500).json({
        message: error.message,
      });
    }
  }
);

// Get user uploaded attachments
router.get("/attachments", authMiddleware, async (req, res) => {
  const result = await getUserAttachments(req.user.users_id);

  if (result.error) {
    return res.status(400).json({ message: result.error });
  }

  res.status(200).json({
    attachments: result.attachments,
  });
});

// Delete attachment
router.delete("/attachments/:id", authMiddleware, async (req, res) => {
  const result = await deleteAttachment(req.params.id, req.user.users_id);

  if (result.error) {
    return res.status(400).json({ message: result.error });
  }

  res.status(200).json({
    message: "Attachment deleted successfully",
  });
});

// Get all invoices for logged-in user
router.get("/", authMiddleware, async (req, res) => {
  const result = await getUserReceipts(req.user.users_id, req.query);

  if (result.error) {
    return res.status(400).json({ message: result.error });
  }

  res.status(200).json({
    receipts: result.receipts,
  });
});

// Get invoice details
router.get("/:id", authMiddleware, async (req, res) => {
  const result = await getReceiptById(req.params.id, req.user.users_id);

  if (result.error) {
    return res.status(404).json({ message: result.error });
  }

  res.status(200).json({
    receipt: result.receipt,
  });
});

// Soft delete invoice
router.delete("/:id", authMiddleware, async (req, res) => {
  const result = await deleteReceipt(req.params.id, req.user.users_id);

  if (result.error) {
    return res.status(400).json({ message: result.error });
  }

  res.status(200).json({
    message: "Receipt deleted successfully",
  });
});

export default router;