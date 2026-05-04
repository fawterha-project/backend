import supabase from "../supabaseClient.js";
import { createNewInvoiceNotification } from "./notificationsService.js";

// Store receipt in Supabase
export const storeReceipt = async (data) => {
  // Drop undefined fields so Postgres column defaults can apply
  const cleaned = Object.fromEntries(
    Object.entries(data).filter(([, v]) => v !== undefined),
  );

  const { data: receipt, error } = await supabase
    .from("invoice")
    .insert([cleaned])
    .select()
    .single();

  if (error) {
    return { error: error.message };
  }

  // Fire a "new invoice" notification — don't fail the whole request if this errors,
  // just log it. The receipt is already saved.
  const notifResult = await createNewInvoiceNotification(receipt);
  if (notifResult.error) {
    console.warn(
      "[receipts] could not create new-invoice notification:",
      notifResult.error,
    );
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
