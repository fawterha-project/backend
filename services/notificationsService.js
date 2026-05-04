import supabase from "../supabaseClient.js";

// Create a notification row
export const createNotification = async ({
  user_id,
  title,
  message,
  notification_type, // 'invoice' | 'promotion' | 'message' | 'reminder'
}) => {
  const { data, error } = await supabase
    .from("notifications")
    .insert([{ user_id, title, message, notification_type }])
    .select()
    .single();

  if (error) {
    return { error: error.message };
  }
  return { notification: data };
};

// Convenience wrapper called when a new invoice is stored
export const createNewInvoiceNotification = async (invoice) => {
  const title = "New invoice added";
  const message = `A new invoice from ${invoice.merchant_name} for ${Number(
    invoice.total_price,
  ).toFixed(2)} SAR was added.`;
  return createNotification({
    user_id: invoice.users_id,
    title,
    message,
    notification_type: "invoice",
  });
};

// List notifications for a user (newest first)
export const getUserNotifications = async (users_id) => {
  const { data: notifications, error } = await supabase
    .from("notifications")
    .select("*")
    .eq("user_id", users_id)
    .order("created_at", { ascending: false });

  if (error) {
    return { error: error.message };
  }
  return { notifications };
};

// Count unread notifications for a user
export const getUnreadCount = async (users_id) => {
  const { count, error } = await supabase
    .from("notifications")
    .select("notification_id", { count: "exact", head: true })
    .eq("user_id", users_id)
    .eq("is_read", false);

  if (error) {
    return { error: error.message };
  }
  return { unread: count ?? 0 };
};

// Mark one notification as read
export const markAsRead = async (notification_id) => {
  const { data, error } = await supabase
    .from("notifications")
    .update({ is_read: true })
    .eq("notification_id", notification_id)
    .select()
    .single();

  if (error) {
    return { error: error.message };
  }
  return { notification: data };
};

// Mark all of a user's notifications as read
export const markAllAsRead = async (users_id) => {
  const { error } = await supabase
    .from("notifications")
    .update({ is_read: true })
    .eq("user_id", users_id)
    .eq("is_read", false);

  if (error) {
    return { error: error.message };
  }
  return { success: true };
};

// Delete a notification
export const deleteNotification = async (notification_id) => {
  const { error } = await supabase
    .from("notifications")
    .delete()
    .eq("notification_id", notification_id);

  if (error) {
    return { error: error.message };
  }
  return { success: true };
};
