import supabase from "../supabaseClient.js";
import {
  createNewInvoiceNotification,
  scheduleInvoiceReminders,
  computeInvoiceDeadlines,
} from "./notificationsService.js";

export const storeReceipt = async (data) => {
  const cleaned = Object.fromEntries(
    Object.entries(data).filter(([, v]) => v !== undefined),
  );

  // Look up the merchant's return/exchange policy
  const { data: merchant, error: merchantErr } = await supabase
    .from("merchant")
    .select("return_days, exchange_days")
    .eq("merchant_id", cleaned.merchant_id)
    .single();
  if (merchantErr) {
    return { error: `Could not load merchant policy: ${merchantErr.message}` };
  }

  // Compute deadlines from the merchant's policy
  const deadlines = computeInvoiceDeadlines(
    cleaned.issued_at,
    merchant.return_days,
    merchant.exchange_days,
  );
  if (deadlines.return_until) cleaned.return_until = deadlines.return_until;
  if (deadlines.exchange_until)
    cleaned.exchange_until = deadlines.exchange_until;

  const { data: receipt, error } = await supabase
    .from("invoice")
    .insert([cleaned])
    .select()
    .single();
  if (error) return { error: error.message };

  const newInv = await createNewInvoiceNotification(receipt);
  if (newInv.error) {
    console.warn(
      "[receipts] could not create new-invoice notification:",
      newInv.error,
    );
  }

  const sched = await scheduleInvoiceReminders(receipt);
  if (sched.error) {
    console.warn("[receipts] could not schedule reminders:", sched.error);
  }

  return { receipt };
};

// Get receipts for a specific user
export const getUserReceipts = async (users_id) => {
  const { data: receipts, error } = await supabase
    .from("invoice")
    .select("*")
    .eq("users_id", users_id)
    .order("created_at", { ascending: false });

  if (error) {
    return { error: error.message };
  }

  return { receipts };
};

// Delete receipt by invoice_id
export const deleteReceipt = async (id) => {
  const { error } = await supabase
    .from("invoice")
    .delete()
    .eq("invoice_id", id);

  if (error) {
    return { error: error.message };
  }

  return { success: true };
};
