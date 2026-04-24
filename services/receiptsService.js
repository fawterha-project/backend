// TODO (RAND): Implement storeReceipt with Supabase
export const storeReceipt = async (data) => {
  return { receipt: data };
};

// TODO (RAND): Implement getUserReceipts with Supabase
export const getUserReceipts = async (users_id) => {
  return { receipts: [] };
};

// TODO (RAND): Implement deleteReceipt with Supabase
export const deleteReceipt = async (id) => {
  return { success: true };
};
