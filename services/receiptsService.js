import supabase from "../supabaseClient.js";

// Store receipt in Supabase
export const storeReceipt = async (data) => {
  const { data: receipt, error } = await supabase
    .from("invoice")
    .insert([data])
    .select()
    .single();

  if (error) {
    return { error: error.message };
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