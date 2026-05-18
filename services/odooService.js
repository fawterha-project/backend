import supabase from "../supabaseClient.js";
import {
  createNewInvoiceNotification,
  scheduleInvoiceReminders,
  computeInvoiceDeadlines,
  checkAndNotifySpendingLimits,
} from "./notificationsService.js";
import process from "node:process";
import { GoogleGenAI } from "@google/genai";

const genai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const CATEGORIES_PROMPT = `You are an invoice classifier. Classify the following invoice into ONE category from this exact list. Return ONLY the Arabic category name, with no quotes, no explanation, exactly as written.

Categories:
- المقاضي والبيت
- المطاعم والترفيه
- التسوق 
- النقل والسيارة
- الصحة 
- الالتزامات
- أخرى`;

// Text-based classifier — uses merchant name + items (no image).
// Returns a categorie_id UUID or null if classification fails / no API key / no useful data.
async function classifyInvoiceFromText({ merchant_name, items }) {
  if (!process.env.GEMINI_API_KEY) {
    console.warn("[odoo-classify] GEMINI_API_KEY not set, skipping");
    return null;
  }
  if (!merchant_name && (!items || items.length === 0)) return null;

  const itemsText = (items || [])
    .map((i) => i.name || i.invoice_item_name)
    .filter(Boolean)
    .join(", ");

  const userInput = `Merchant: ${merchant_name || "unknown"}\nItems: ${itemsText || "none"}`;

  try {
    const response = await genai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{ parts: [{ text: CATEGORIES_PROMPT + "\n\n" + userInput }] }],
      config: { temperature: 0.1 },
    });

    const rawText =
      response.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
    if (!rawText) return null;

    const { data: category } = await supabase
      .from("categories")
      .select("categorie_id")
      .eq("categorie_name", rawText)
      .maybeSingle();

    return category?.categorie_id || null;
  } catch (err) {
    console.warn("[odoo-classify] failed:", err.message);
    return null;
  }
}

// Expected payload from Odoo's automated action (this is to make my teammate be in the Picture of my work!):
// {
//   external_invoice_id: "ODOO-2026-00042"   <-- required, Odoo's invoice ID
//   partner_email:       "user@example.com"  <-- required, used to find Fawterha user
//   invoice_number:      "INV-ODOO-0042"     <-- required, must be unique in invoice table
//   merchant_name:       "Panda"             <-- required
//   issued_at:           "2026-05-15T10:30:00Z" <-- required, ISO timestamp
//   total_price:         115.00              <-- required
//   payment_method:      "card"              <-- required, must match payment_method_enum
//   subtotal:            100.00              (optional)
//   vat_amount:          15.00               (optional)
//   currency:            "SAR"               (optional)
//   qr_code:             "..."               (optional)
//   title:               "Order #4521"       (optional)
//   merchant_address:    "Riyadh"            (optional)
//   merchant_vat:        "300000000000003"   (optional)
//   items:               [...]               (optional, array of line items)
// }

function validatePayload(p) {
  const required = [
    "external_invoice_id",
    "partner_email",
    "invoice_number",
    "merchant_name",
    "issued_at",
    "total_price",
    "payment_method",
  ];
  const missing = required.filter((f) => p[f] == null || p[f] === "");
  if (missing.length)
    return { error: `Missing required fields: ${missing.join(", ")}` };
  return { ok: true };
}

async function findUserByEmail(email) {
  const { data, error } = await supabase
    .from("users")
    .select("users_id")
    .ilike("email", email)
    .maybeSingle();
  if (error) return { error: error.message };
  return { user: data };
}

async function findOrCreateMerchant(merchant_name) {
  const { data: existing, error: lookupErr } = await supabase
    .from("merchant")
    .select("merchant_id, return_days, exchange_days")
    .ilike("merchant_name", merchant_name)
    .maybeSingle();
  if (lookupErr) return { error: lookupErr.message };
  if (existing) return { merchant: existing };

  // Auto-create if no match — won't have return/exchange policy set
  const { data: created, error: createErr } = await supabase
    .from("merchant")
    .insert({ merchant_name })
    .select("merchant_id, return_days, exchange_days")
    .single();
  if (createErr) return { error: createErr.message };
  return { merchant: created };
}

async function findExistingInvoice(users_id, external_invoice_id) {
  const { data, error } = await supabase
    .from("invoice")
    .select("*")
    .eq("users_id", users_id)
    .eq("external_invoice_id", external_invoice_id)
    .maybeSingle();
  if (error) return { error: error.message };
  return { invoice: data };
}

export const importOdooInvoice = async (payload) => {
  console.log(
    "[odoo] received payload:",
    JSON.stringify(payload).slice(0, 200),
  );
  // 1. Validate required fields
  const validation = validatePayload(payload);
  if (validation.error) return { error: validation.error };

  // 2. Find the Fawterha user by email
  const userResult = await findUserByEmail(payload.partner_email);
  if (userResult.error) return { error: userResult.error };
  if (!userResult.user) {
    return {
      error: `No Fawterha user found with email: ${payload.partner_email}`,
    };
  }
  const users_id = userResult.user.users_id;

  // 3. Find (or auto-create) the merchant
  const merchantResult = await findOrCreateMerchant(payload.merchant_name);
  if (merchantResult.error) return { error: merchantResult.error };
  const merchant = merchantResult.merchant;

  // 4. Check for duplicate — idempotent retries return the existing invoice
  const dup = await findExistingInvoice(users_id, payload.external_invoice_id);
  if (dup.error) return { error: dup.error };
  if (dup.invoice) {
    return { receipt: dup.invoice, duplicate: true };
  }

  // 5. Compute return/exchange deadlines from merchant policy
  const deadlines = computeInvoiceDeadlines(
    payload.issued_at,
    merchant.return_days,
    merchant.exchange_days,
  );

  // 5.5. Classify the invoice (text-based, since Odoo doesn't send images)
  const categorieId = await classifyInvoiceFromText({
    merchant_name: payload.merchant_name,
    items: payload.items,
  });

  // 6. Build the invoice row
  const invoiceData = {
    users_id,
    merchant_id: merchant.merchant_id,
    categorie_id: categorieId,
    title: payload.title || `Odoo Invoice ${payload.external_invoice_id}`,
    invoice_number: payload.invoice_number,
    merchant_name: payload.merchant_name,
    merchant_address: payload.merchant_address,
    issued_at: payload.issued_at,
    merchant_vat: payload.merchant_vat,
    subtotal: payload.subtotal,
    vat_amount: payload.vat_amount,
    total_price: payload.total_price,
    qr_code: payload.qr_code,
    payment_method: payload.payment_method,
    discount_amount: payload.discount_amount,
    points_used: payload.points_used,
    extra_data: payload.extra_data,
    currency: payload.currency || "SAR",
    source_type: "odoo",
    source_status: "processed",
    external_invoice_id: payload.external_invoice_id,
    imported_at: new Date().toISOString(),
    return_until: deadlines.return_until,
    exchange_until: deadlines.exchange_until,
  };

  // Strip undefined keys so column defaults apply
  const cleaned = Object.fromEntries(
    Object.entries(invoiceData).filter(([, v]) => v !== undefined),
  );

  // 7. Insert the invoice
  const { data: invoice, error: insertErr } = await supabase
    .from("invoice")
    .insert([cleaned])
    .select("*, categories(categorie_id, categorie_name)")
    .single();
  if (insertErr) return { error: insertErr.message };

  // 8. If line items were sent, insert them too (best-effort)
  if (Array.isArray(payload.items) && payload.items.length) {
    const items = payload.items.map((it) => ({
      invoice_id: invoice.invoice_id,
      invoice_item_name: it.name,
      quantity: it.quantity || 1,
      price_before_vat: it.price_before_vat || 0,
      vat_amount: it.vat_amount || 0,
      price_with_vat: it.price_with_vat || 0,
    }));
    const { error: itemsErr } = await supabase
      .from("invoice_items")
      .insert(items);
    if (itemsErr)
      console.warn("[odoo] could not insert items:", itemsErr.message);
  }

  // 9. Auto-triggers — same pipeline as a manual receipt
  const notif = await createNewInvoiceNotification(invoice);
  if (notif.error)
    console.warn("[odoo] new-invoice notification failed:", notif.error);

  const sched = await scheduleInvoiceReminders(invoice);
  if (sched.error)
    console.warn("[odoo] reminder scheduling failed:", sched.error);

  const limits = await checkAndNotifySpendingLimits(users_id);
  if (limits.error)
    console.warn("[odoo] spending limit check failed:", limits.error);

  return { receipt: invoice, duplicate: false };
};
