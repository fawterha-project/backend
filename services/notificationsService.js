import supabase from "../supabaseClient.js";

const REMINDER_LEAD_DAYS = 2; // fire reminder this many days before deadline

function addDays(date, days) {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

// Generic insert — supports scheduled (is_sent=false) and immediate notifications
export const createNotification = async ({
  user_id,
  title,
  message,
  notification_type,
  invoice_id = null,
  subtype = null,
  scheduled_at = null,
  is_sent = true,
}) => {
  const { data, error } = await supabase
    .from("notifications")
    .insert([
      {
        user_id,
        title,
        message,
        notification_type,
        invoice_id,
        subtype,
        scheduled_at,
        is_sent,
      },
    ])
    .select()
    .single();
  if (error) return { error: error.message };
  return { notification: data };
};

// Immediate "new invoice" notification (called from storeReceipt)
export const createNewInvoiceNotification = async (invoice) => {
  return createNotification({
    user_id: invoice.users_id,
    title: "New invoice added",
    message: `A new invoice from ${invoice.merchant_name} for ${Number(invoice.total_price).toFixed(2)} SAR was added.`,
    notification_type: "invoice",
    invoice_id: invoice.invoice_id,
    subtype: "new_invoice",
  });
};

// Future-scheduled return + exchange reminders for one invoice
export const scheduleInvoiceReminders = async (invoice) => {
  const now = new Date();
  const returnUntil = invoice.return_until
    ? new Date(invoice.return_until)
    : null;
  const exchangeUntil = invoice.exchange_until
    ? new Date(invoice.exchange_until)
    : null;

  if (returnUntil) {
    const fireAt = addDays(returnUntil, -REMINDER_LEAD_DAYS);
    if (fireAt > now) {
      await createNotification({
        user_id: invoice.users_id,
        title: "Return window closing",
        message: `${REMINDER_LEAD_DAYS} days left to return items from your ${invoice.merchant_name} invoice.`,
        notification_type: "reminder",
        invoice_id: invoice.invoice_id,
        subtype: "return_due",
        scheduled_at: fireAt.toISOString(),
        is_sent: false,
      });
    }
  }

  if (exchangeUntil) {
    const fireAt = addDays(exchangeUntil, -REMINDER_LEAD_DAYS);
    if (fireAt > now) {
      await createNotification({
        user_id: invoice.users_id,
        title: "Exchange window closing",
        message: `${REMINDER_LEAD_DAYS} days left to exchange items from your ${invoice.merchant_name} invoice.`,
        notification_type: "reminder",
        invoice_id: invoice.invoice_id,
        subtype: "exchange_due",
        scheduled_at: fireAt.toISOString(),
        is_sent: false,
      });
    }
  }
  return { success: true };
};

// Compute return/exchange deadlines for a fresh invoice (used by storeReceipt)
export const computeInvoiceDeadlines = (
  issuedAtIso,
  returnDays,
  exchangeDays,
) => {
  const issuedAt = new Date(issuedAtIso);
  return {
    return_until:
      returnDays != null ? addDays(issuedAt, returnDays).toISOString() : null,
    exchange_until:
      exchangeDays != null
        ? addDays(issuedAt, exchangeDays).toISOString()
        : null,
  };
};

// Cron-like dispatcher: flip is_sent on any scheduled rows whose time has come
export const runDueNotifications = async () => {
  const nowIso = new Date().toISOString();
  const { data: due, error: selErr } = await supabase
    .from("notifications")
    .select("notification_id")
    .eq("is_sent", false)
    .lte("scheduled_at", nowIso);
  if (selErr) return { error: selErr.message };
  if (!due || due.length === 0) return { dispatched: 0 };

  const ids = due.map((n) => n.notification_id);
  const { error: updErr } = await supabase
    .from("notifications")
    .update({ is_sent: true })
    .in("notification_id", ids);
  if (updErr) return { error: updErr.message };

  return { dispatched: ids.length };
};

// User-facing list — only show notifications that have actually been sent
export const getUserNotifications = async (users_id) => {
  const { data: notifications, error } = await supabase
    .from("notifications")
    .select("*")
    .eq("user_id", users_id)
    .eq("is_sent", true)
    .order("created_at", { ascending: false });
  if (error) return { error: error.message };
  return { notifications };
};

export const getUnreadCount = async (users_id) => {
  const { count, error } = await supabase
    .from("notifications")
    .select("notification_id", { count: "exact", head: true })
    .eq("user_id", users_id)
    .eq("is_sent", true)
    .eq("is_read", false);
  if (error) return { error: error.message };
  return { unread: count ?? 0 };
};

export const markAsRead = async (notification_id) => {
  const { data, error } = await supabase
    .from("notifications")
    .update({ is_read: true })
    .eq("notification_id", notification_id)
    .select()
    .single();
  if (error) return { error: error.message };
  return { notification: data };
};

export const markAllAsRead = async (users_id) => {
  const { error } = await supabase
    .from("notifications")
    .update({ is_read: true })
    .eq("user_id", users_id)
    .eq("is_read", false);
  if (error) return { error: error.message };
  return { success: true };
};

export const deleteNotification = async (notification_id) => {
  const { error } = await supabase
    .from("notifications")
    .delete()
    .eq("notification_id", notification_id);
  if (error) return { error: error.message };
  return { success: true };
};

// ---- Spending limit warnings (monthly only) ----

const APPROACHING_THRESHOLD = 0.8;

function startOfMonth(date = new Date()) {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(1);
  return d;
}

async function sumSpendingSince(user_id, since) {
  const { data, error } = await supabase
    .from("invoice")
    .select("total_price")
    .eq("users_id", user_id)
    .gte("issued_at", since.toISOString());
  if (error || !data) return 0;
  return data.reduce((sum, row) => sum + Number(row.total_price), 0);
}

async function alreadyFiredThisPeriod(user_id, subtype, periodStart) {
  const { count } = await supabase
    .from("notifications")
    .select("notification_id", { count: "exact", head: true })
    .eq("user_id", user_id)
    .eq("subtype", subtype)
    .gte("created_at", periodStart.toISOString());
  return (count ?? 0) > 0;
}

export const checkAndNotifySpendingLimits = async (user_id) => {
  const { data: limits, error } = await supabase
    .from("expense_limits")
    .select("monthly_limit")
    .eq("user_id", user_id)
    .maybeSingle();
  if (error) return { error: error.message };
  if (!limits || !limits.monthly_limit) return { skipped: true };

  const monthStart = startOfMonth();
  const total = await sumSpendingSince(user_id, monthStart);
  const limit = Number(limits.monthly_limit);
  const ratio = total / limit;

  let subtype, title, message;
  if (ratio >= 1.0) {
    subtype = "limit_exceeded_monthly";
    title = "Monthly budget exceeded";
    message = `You've exceeded your monthly budget. Spent ${total.toFixed(2)} SAR (limit ${limit.toFixed(2)} SAR).`;
  } else if (ratio >= APPROACHING_THRESHOLD) {
    subtype = "limit_approaching_monthly";
    title = "Monthly budget alert";
    message = `You've used ${Math.round(ratio * 100)}% of your monthly budget. Spent ${total.toFixed(2)} SAR of ${limit.toFixed(2)} SAR.`;
  } else {
    return { success: true };
  }

  if (await alreadyFiredThisPeriod(user_id, subtype, monthStart))
    return { success: true };

  await createNotification({
    user_id,
    title,
    message,
    notification_type: "reminder",
    subtype,
  });
  return { success: true };
};
