import supabase from "../supabaseClient.js";
import axios from "axios";
//import { GoogleGenAI } from "@google/genai";
import { getModel, rotateKey } from "./geminiClient.js";
import crypto from "crypto";
import process from "process";
import {
  createNewInvoiceNotification,
  scheduleInvoiceReminders,
  checkAndNotifySpendingLimits,
} from "./notificationsService.js";

const categoryMapper = {
  "المقاضي والبيت": "المقاضي",
  "المطاعم والترفيه": "المطاعم",
  "التسوق والأناقة": "التسوق",
  "النقل والسيارة": "النقل",
  "الصحة والعافية": "الصحة",
  "الفواتير والالتزامات": "الالتزامات",
  أخرى: "اخرى",
};

const BUCKET_NAME = "invoice-files";
//const genai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

function getFileType(mimeType) {
  if (mimeType?.startsWith("image/")) return "image";
  if (mimeType === "application/pdf") return "pdf";
  return null;
}

const parseNumber = (val) => {
  if (val === null || val === undefined || val === "") return null;
  const num = Number(val);
  return isNaN(num) ? null : num;
};

// ─────────────────────────────────────────────────────────────
// Prompt
// ─────────────────────────────────────────────────────────────
const INVOICE_EXTRACTION_PROMPT = `
You are a highly accurate invoice data extraction system. Your job is to extract data exactly as it appears on the invoice image or PDF.
Do not calculate, estimate, or guess any values. If a value is missing, set it to null.

CRITICAL LANGUAGE RULE: 
- The receipt is often in Arabic or bilingual. You MUST extract the ARABIC text for item names, merchant names, and descriptions. 
- Merchant Name Extraction Rule:
- Extract the merchant name exactly as it appears. If the receipt provides the name in both Arabic and English, combine them (e.g., 'Danube - الدانوب'). If only one language is present, extract it as is without translating it. This is crucial for search functionality.
- Rules:
- date: use ISO 8601 format (YYYY-MM-DDTHH:mm:ssZ) if time is visible, otherwise YYYY-MM-DD.
- payment_method: strictly one of ["cash", "card", "apple_pay", "stc_pay", "unknown"].
- extra_details: Any additional information printed on the invoice (e.g., branch_name, cashier_name, order_type, return_policy, customer_card_number, wifi_password) should be captured as key-value pairs here. DO NOT put items or core financial data here.
CRITICAL VALIDATION RULE:
- First, check if the image is a financial receipt or invoice. 
- If the image is NOT a receipt or invoice (e.g., a person, a landscape, or a random document), return ONLY this JSON: {"is_invoice": false} and stop.
- If it IS a receipt, return the full JSON structure with "is_invoice": true.
Your job is to extract data exactly as it appears...

- Extract 'tendered_amount' (cash given) and 'change_amount' (cash returned) only if they are explicitly mentioned. If they are not present, set them to null.

CLASSIFICATION RULE:
Identify the correct category for this receipt from the following list ONLY. Use the merchant name and items to decide:
1. "المقاضي والبيت" (Household & Groceries)
2. "المطاعم والترفيه" (Food & Fun)
3. "التسوق والأناقة" (Shopping & Style)
4. "النقل والسيارة" (Auto & Travel)
5. "الصحة والعافية" (Health & Wellness)
6. "الفواتير والالتزامات" (Bills & Services)
7. "أخرى" (Other)

Return the category name EXACTLY as written above in a field called "suggested_category".
If the receipt is unclear or doesn't fit, return null.


Required JSON Structure:
{
  "is_invoice": true,
  "suggested_category": "المطاعم والترفيه",
  "title": null,
  "merchant_name": null,
  "merchant_address": null,
  "merchant_vat": null,
  "invoice_number": null,
  "date": null,
  "subtotal": null,
  "vat_amount": null,
  "total": null,
  "discount_amount": null,
  "payment_method": "unknown",
  "currency": "SAR",
  "extra_details": {
    "branch_name": null,
    "cashier_name": null,
    "return_policy": null
    "tendered_amount": null,
    "change_amount": null,
  },
  "items": [
    {
      "raw_line": "The exact item line as it appears",
      "name": null,
      "quantity": null,
      "unit_price": null,
      "vat_amount": null,
      "line_total": null
    }
  ]
}
`;

const generationConfig = {
  temperature: 0,
  responseMimeType: "application/json",
};

// ─────────────────────────────────────────────────────────────
// استخراج باستخدام Gemini API
// ─────────────────────────────────────────────────────────────

export const extractInvoiceDataWithAI = async (attachment_id, users_id) => {
  try {
    const { data: attachment, error: findError } = await supabase
      .from("invoice_attachments")
      .select("*")
      .eq("attachment_id", attachment_id)
      .eq("user_id", users_id)
      .maybeSingle();

    if (findError) return { error: findError.message };
    if (!attachment) return { error: "Attachment not found" };

    const fileRes = await axios.get(attachment.file_url, {
      responseType: "arraybuffer",
    });
    const base64Data = Buffer.from(fileRes.data).toString("base64");

    const mimeType =
      attachment.file_type === "pdf"
        ? "application/pdf"
        : fileRes.headers["content-type"] || "image/jpeg";

    const executeWithRetry = async (attempt = 0) => {
      try {
        const model = getModel(); // استخدام الدالة من geminiClient.js
        return await model.generateContent({
          contents: [
            {
              parts: [
                { inlineData: { mimeType, data: base64Data } },
                { text: INVOICE_EXTRACTION_PROMPT },
              ],
            },
          ],
          config: generationConfig,
        });
      } catch (error) {
        // إذا كان الخطأ 429 يعني انتهت الكوتا
        if (error.status === 429 && attempt < 3) {
          console.log(
            `خطأ كوتا، محاولة تبديل المفتاح... (المحاولة ${attempt + 1})`,
          );
          rotateKey(); // تبديل المفتاح في geminiClient.js
          return await executeWithRetry(attempt + 1); // إعادة المحاولة بالمفتاح الجديد
        }
        throw error; // إذا كان خطأ غير الكوتا أو انتهت المحاولات
      }
    };

    const response = await executeWithRetry();
    const rawText = response.candidates?.[0]?.content?.parts?.[0]?.text || "";

    let extracted;
    try {
      extracted = JSON.parse(rawText);
    } catch {
      return { error: "Gemini returned invalid JSON", raw_response: rawText };
    }

    await supabase
      .from("invoice_attachments")
      .update({
        processing_status: "processed",
        ocr_confidence: 0.95,
        processing_error: null,
      })
      .eq("attachment_id", attachment_id);

    return { success: true, extracted };
  } catch (error) {
    return { error: error.message };
  }
};
// ─────────────────────────────────────────────────────────────
//
// ─────────────────────────────────────────────────────────────
export const createInvoiceFromAttachment = async (attachment_id, users_id) => {
  try {
    const aiResult = await extractInvoiceDataWithAI(attachment_id, users_id);
    if (aiResult.error) return { error: aiResult.error };

    const data = aiResult.extracted;

    if (data.is_invoice === false) {
      await supabase
        .from("invoice_attachments")
        .update({
          processing_status: "failed",
          processing_error: "Not a valid receipt",
        })
        .eq("attachment_id", attachment_id);

      return {
        error: "INVALID_RECEIPT",
        message: "الصورة ليست فاتورة معتمدة",
      };
    }

    let categoryId = null;
    if (data.suggested_category) {
      const { data: categoryData } = await supabase
        .from("categories")
        .select("categorie_id")
        .eq("categorie_name", data.suggested_category)
        .maybeSingle();

      if (categoryData) {
        categoryId = categoryData.categorie_id;
      }
    }

    const issuedAt = data.date ? new Date(data.date).toISOString() : null;
    let merchantId = null;
    const merchantName = data.merchant_name?.trim();

    if (merchantName) {
      const { data: existingMerchant } = await supabase
        .from("merchant")
        .select("merchant_id")
        .ilike("merchant_name", merchantName)
        .maybeSingle();

      if (existingMerchant) {
        merchantId = existingMerchant.merchant_id;
      } else {
        const { data: newMerchant, error: mError } = await supabase
          .from("merchant")
          .insert([
            {
              merchant_name: merchantName,
              vat_number: data.merchant_vat || null,
              address: data.merchant_address || null,
            },
          ])
          .select()
          .single();

        if (!mError && newMerchant) {
          merchantId = newMerchant.merchant_id;
        }
      }
    }

    const { data: invoice, error: invoiceError } = await supabase
      .from("invoice")
      .insert([
        {
          users_id,
          merchant_id: merchantId,
          categorie_id: categoryId, // ربط التصنيف التلقائي هنا
          title:
            data.title || (merchantName ? `فاتورة - ${merchantName}` : null),
          invoice_number: data.invoice_number || null,
          merchant_name: merchantName || null,
          merchant_address: data.merchant_address || null,
          issued_at: issuedAt,
          merchant_vat: data.merchant_vat || null,
          subtotal: parseNumber(data.subtotal),
          vat_amount: parseNumber(data.vat_amount),
          total_price: parseNumber(data.total),
          discount_amount: parseNumber(data.discount_amount),
          payment_method: data.payment_method || "unknown",
          currency: data.currency || "SAR",
          source_type: "scan",
          source_status: "processed",
          extra_data: data.extra_details || {},
        },
      ])
      .select()
      .single();

    if (invoiceError)
      return { error: `DB Invoice Error: ${invoiceError.message}` };
    // Fire notifications now that the invoice exists
    try {
      await createNewInvoiceNotification(invoice);
      await scheduleInvoiceReminders(invoice);
      await checkAndNotifySpendingLimits(users_id);
    } catch (notifErr) {
      console.error("Notification dispatch failed:", notifErr.message);
      // do NOT fail the request — the invoice itself was saved successfully
    }

    if (data.items && Array.isArray(data.items) && data.items.length > 0) {
      const invoiceItems = data.items
        .filter((item) => item.name || item.raw_line)
        .map((item) => ({
          invoice_id: invoice.invoice_id,
          invoice_item_name: item.name || item.raw_line || null,
          quantity: parseNumber(item.quantity) || null,
          price_before_vat: parseNumber(item.unit_price),
          vat_amount: parseNumber(item.vat_amount),
          price_with_vat: parseNumber(item.line_total),
        }));

      if (invoiceItems.length > 0) {
        const { error: itemsError } = await supabase
          .from("invoice_items")
          .insert(invoiceItems);
        if (itemsError)
          console.error("Failed to insert items:", itemsError.message);
      }
    }

    await supabase
      .from("invoice_attachments")
      .update({
        invoice_id: invoice.invoice_id,
        processing_status: "processed",
      })
      .eq("attachment_id", attachment_id);

    return { success: true, invoice, extracted_data: data };
  } catch (error) {
    return { error: error.message };
  }
};

// ─────────────────────────────────────────────────────────────
export const uploadReceiptAttachment = async (users_id, file, body = {}) => {
  try {
    if (!file) return { error: "File is required" };
    const fileType = getFileType(file.mimetype);
    if (!fileType) return { error: "Only image and PDF files are allowed" };

    const fileExt = file.originalname.split(".").pop();
    const filePath = `${users_id}/${Date.now()}-${crypto.randomUUID()}.${fileExt}`;

    const { error: uploadError } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(filePath, file.buffer, {
        contentType: file.mimetype,
        upsert: false,
      });

    if (uploadError) return { error: uploadError.message };

    const { data: publicUrlData } = supabase.storage
      .from(BUCKET_NAME)
      .getPublicUrl(filePath);

    const { data: attachment, error: insertError } = await supabase
      .from("invoice_attachments")
      .insert([
        {
          invoice_id: body.invoice_id || null,
          user_id: users_id,
          file_name: file.originalname,
          file_url: publicUrlData.publicUrl,
          file_type: fileType,
          file_size: file.size,
          processing_status: "pending",
          ocr_confidence: null,
          source_type: fileType === "pdf" ? "upload_file" : "upload_image",
          extracted_text: null,
          processing_error: null,
          storage_path: filePath,
        },
      ])
      .select()
      .single();

    if (insertError) return { error: insertError.message };
    return { attachment };
  } catch (error) {
    return { error: error.message };
  }
};

export const processAttachment = async (attachment_id, users_id) => {
  try {
    const { data: attachment, error: findError } = await supabase
      .from("invoice_attachments")
      .select("*")
      .eq("attachment_id", attachment_id)
      .eq("user_id", users_id)
      .maybeSingle();

    if (findError) return { error: findError.message };
    if (!attachment) return { error: "Attachment not found" };

    await supabase
      .from("invoice_attachments")
      .update({ processing_status: "needs_review" })
      .eq("attachment_id", attachment_id);

    return { success: true, message: "File is ready for AI extraction" };
  } catch (error) {
    return { error: error.message };
  }
};

export const getUserAttachments = async (users_id) => {
  const { data: attachments, error } = await supabase
    .from("invoice_attachments")
    .select("*")
    .eq("user_id", users_id)
    .order("uploaded_at", { ascending: false });

  if (error) return { error: error.message };
  return { attachments };
};

export const deleteAttachment = async (attachment_id, users_id) => {
  try {
    const { data: attachment, error: findError } = await supabase
      .from("invoice_attachments")
      .select("*")
      .eq("attachment_id", attachment_id)
      .eq("user_id", users_id)
      .maybeSingle();

    if (findError) return { error: findError.message };
    if (!attachment) return { error: "Attachment not found" };
    if (!attachment.storage_path) return { error: "No storage_path found" };

    const { data: removedFiles, error: storageError } = await supabase.storage
      .from(BUCKET_NAME)
      .remove([attachment.storage_path.trim()]);

    if (storageError) return { error: storageError.message };
    if (!removedFiles || removedFiles.length === 0)
      return { error: "Storage file was not deleted." };

    const { error: deleteError } = await supabase
      .from("invoice_attachments")
      .delete()
      .eq("attachment_id", attachment_id)
      .eq("user_id", users_id);

    if (deleteError) return { error: deleteError.message };
    return { success: true, message: "Attachment deleted successfully" };
  } catch (error) {
    return { error: error.message };
  }
};

// ─────────────────────────────────────────────────────────────
export const getUserReceipts = async (users_id, filters = {}) => {
  let query = supabase
    .from("invoice")
    .select(`*, invoice_items (*), merchant (*), categories (*)`)
    .eq("users_id", users_id)
    .eq("is_deleted", false)
    .order("created_at", { ascending: false });

  if (filters.period === "month") {
    const start = new Date();
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
    query = query.gte("issued_at", start.toISOString());
  }
  if (filters.period === "year") {
    query = query.gte(
      "issued_at",
      new Date(new Date().getFullYear(), 0, 1).toISOString(),
    );
  }
  if (filters.categorie_id)
    query = query.eq("categorie_id", filters.categorie_id);
  if (filters.unclassified === "true") query = query.is("categorie_id", null);

  if (filters.search) {
    query = query.or(
      `merchant_name.ilike.%${filters.search}%,invoice_number.ilike.%${filters.search}%,title.ilike.%${filters.search}%`,
    );
  }

  const { data: receipts, error } = await query;
  if (error) return { error: error.message };

  const formattedReceipts = receipts.map((receipt) => {
    let updatedReceipt = { ...receipt };

    if (updatedReceipt.categories && updatedReceipt.categories.categorie_name) {
      updatedReceipt.categories.categorie_name =
        categoryMapper[updatedReceipt.categories.categorie_name] ||
        updatedReceipt.categories.categorie_name;
    }

    return updatedReceipt;
  });

  return { receipts: formattedReceipts };
};

export const getReceiptById = async (invoice_id, users_id) => {
  const { data: receipt, error } = await supabase
    .from("invoice")
    .select(
      `*, invoice_items (*), merchant (*), categories (*), invoice_attachments (*)`,
    )
    .eq("invoice_id", invoice_id)
    .eq("users_id", users_id)
    .eq("is_deleted", false)
    .single();

  if (error) return { error: error.message };

  if (receipt && receipt.categories && receipt.categories.categorie_name) {
    receipt.categories.categorie_name =
      categoryMapper[receipt.categories.categorie_name] ||
      receipt.categories.categorie_name;
  }

  return { receipt };
};

export const deleteReceipt = async (invoice_id, users_id) => {
  try {
    const { data: attachment } = await supabase
      .from("invoice_attachments")
      .select("attachment_id, storage_path")
      .eq("invoice_id", invoice_id)
      .maybeSingle();

    if (attachment && attachment.storage_path) {
      await supabase.storage
        .from(BUCKET_NAME)
        .remove([attachment.storage_path]);

      await supabase
        .from("invoice_attachments")
        .delete()
        .eq("attachment_id", attachment.attachment_id);
    }

    const { error: invoiceError } = await supabase
      .from("invoice")
      .delete()
      .eq("invoice_id", invoice_id)
      .eq("users_id", users_id);

    if (invoiceError) throw invoiceError;

    return { success: true };
  } catch (error) {
    console.error("Delete Error:", error.message);
    return { error: error.message };
  }
};
export const updateInvoiceCategory = async (
  invoice_id,
  users_id,
  categorie_id,
) => {
  const { data, error } = await supabase
    .from("invoice")
    .update({ categorie_id: categorie_id })
    .eq("invoice_id", invoice_id)
    .eq("users_id", users_id)
    .select(); //

  if (error) return { error: error.message };

  if (!data || data.length === 0) {
    return { error: "الفاتورة غير موجودة أو ليس لديك صلاحية لتعديلها." };
  }

  return { success: true, message: "تم تحديث التصنيف بنجاح", invoice: data[0] };
};
