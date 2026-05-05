import supabase from "../supabaseClient.js";

// Upsert a user's monthly limit (creates if not exists, updates if exists)
export const setMonthlyLimit = async (user_id, monthly_limit) => {
  const { data, error } = await supabase
    .from("expense_limits")
    .upsert({ user_id, monthly_limit }, { onConflict: "user_id" })
    .select()
    .single();
  if (error) return { error: error.message };
  return { expense_limit: data };
};

// Get a user's current limit
export const getLimit = async (user_id) => {
  const { data, error } = await supabase
    .from("expense_limits")
    .select("expense_limits_id, user_id, monthly_limit, created_at, updated_at")
    .eq("user_id", user_id)
    .maybeSingle();
  if (error) return { error: error.message };
  return { expense_limit: data }; // null if user has no limit set
};

// Remove a user's limit (turn off budget tracking)
export const removeLimit = async (user_id) => {
  const { error } = await supabase
    .from("expense_limits")
    .delete()
    .eq("user_id", user_id);
  if (error) return { error: error.message };
  return { success: true };
};
