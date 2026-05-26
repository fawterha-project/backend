import supabase from "../supabaseClient.js";
import process from "node:process";

// Saudi time zone helpers:
const SAUDI_OFFSET_MS =
  parseInt(process.env.SAUDI_TIMEZONE_OFFSET_HOURS || "3", 10) * 60 * 60 * 1000;
function toSaudiView(date) {
  return new Date(date.getTime() + SAUDI_OFFSET_MS);
}
function fromSaudiView(saudiViewDate) {
  return new Date(saudiViewDate.getTime() - SAUDI_OFFSET_MS);
}

const REMINDER_LEAD_DAYS = parseInt(process.env.REMINDER_LEAD_DAYS || "2", 10);

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
    title: "فاتورة جديدة",
    message: `تمت إضافة فاتورة جديدة من ${invoice.merchant_name} بقيمة ${Number(invoice.total_price).toFixed(2)} ${process.env.DEFAULT_CURRENCY || "ريال"}.`,
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
        title: "موعد الإرجاع يقترب",
        message: `تبقى ${REMINDER_LEAD_DAYS} ${REMINDER_LEAD_DAYS === 1 ? "يوم" : "أيام"} لإرجاع المنتجات من فاتورة ${invoice.merchant_name}.`,
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
        title: "موعد الاستبدال يقترب",
        message: `تبقى ${REMINDER_LEAD_DAYS} ${REMINDER_LEAD_DAYS === 1 ? "يوم" : "أيام"} لاستبدال المنتجات من فاتورة ${invoice.merchant_name}.`,
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

// markAsRead — now requires users_id and verifies ownership
export const markAsRead = async (notification_id, users_id) => {
  const { data, error } = await supabase
    .from("notifications")
    .update({ is_read: true })
    .eq("notification_id", notification_id)
    .eq("user_id", users_id)
    .select()
    .maybeSingle();
  if (error) return { error: error.message };
  if (!data) return { error: "Notification not found or not yours" };
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

// deleteNotification — now requires users_id and verifies ownership
export const deleteNotification = async (notification_id, users_id) => {
  const { data, error } = await supabase
    .from("notifications")
    .delete()
    .eq("notification_id", notification_id)
    .eq("user_id", users_id)
    .select();
  if (error) return { error: error.message };
  if (!data || data.length === 0) {
    return { error: "Notification not found or not yours" };
  }
  return { success: true };
};

// Spending limit warnings (monthly only):

const APPROACHING_THRESHOLD = parseFloat(
  process.env.APPROACHING_THRESHOLD || "0.8",
);

function startOfMonth(date = new Date()) {
  const sv = toSaudiView(date); // Convert to Saudi time zone
  sv.setUTCHours(0, 0, 0, 0);
  sv.setUTCDate(1);
  return fromSaudiView(sv);
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

  // Single warning fires once per month when user crosses 80%.
  // If they then cross 100% later, no extra notification — they were already warned.
  if (ratio < APPROACHING_THRESHOLD) {
    return { success: true };
  }

  const subtype = "limit_approaching_monthly";
  const title = "تنبيه الإنفاق الشهري";
  const message = `لقد استخدمت ${Math.round(ratio * 100)}% من حد الإنفاق الشهري. الإنفاق ${total.toFixed(2)} ${process.env.DEFAULT_CURRENCY || "ريال"} من ${limit.toFixed(2)} ${process.env.DEFAULT_CURRENCY || "ريال"}.`;

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

// Monthly report reminder:

const ARABIC_MONTHS = [
  "يناير",
  "فبراير",
  "مارس",
  "إبريل",
  "مايو",
  "يونيو",
  "يوليو",
  "أغسطس",
  "سبتمبر",
  "أكتوبر",
  "نوفمبر",
  "ديسمبر",
];

function addMonths(date, n) {
  const d = new Date(date);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d;
}

// Find every user who had at least one invoice in the previous month
// and (if they haven't already received this month's reminder) send them
// "تقريرك الشهري جاهز". Called by cron once a month — typically on the 1st.
export const runMonthlyReportReminders = async () => {
  const currentMonthStart = startOfMonth();
  const previousMonthStart = addMonths(currentMonthStart, -1);

  const { data: invoices, error } = await supabase
    .from("invoice")
    .select("users_id")
    .gte("issued_at", previousMonthStart.toISOString())
    .lt("issued_at", currentMonthStart.toISOString());
  if (error) return { error: error.message };

  const userIds = [...new Set((invoices || []).map((i) => i.users_id))];

  const monthName = ARABIC_MONTHS[previousMonthStart.getUTCMonth()];
  let sent = 0;
  for (const user_id of userIds) {
    if (
      await alreadyFiredThisPeriod(
        user_id,
        "report_reminder_monthly",
        currentMonthStart,
      )
    ) {
      continue;
    }
    const result = await createNotification({
      user_id,
      title: "تقريرك الشهري جاهز",
      message: `تم إعداد تقرير شهر ${monthName}. اطلع على تفاصيل إنفاقك.`,
      notification_type: "reminder",
      subtype: "report_reminder_monthly",
    });
    if (!result.error) sent++;
  }
  return { sent, considered: userIds.length };
};

// Reset budget-warning dedup so warnings can fire fresh after a limit change
export const resetBudgetWarningDedup = async (user_id) => {
  const monthStart = startOfMonth();
  const { error } = await supabase
    .from("notifications")
    .delete()
    .eq("user_id", user_id)
    .in("subtype", ["limit_approaching_monthly", "limit_exceeded_monthly"])
    .gte("created_at", monthStart.toISOString());
  if (error) return { error: error.message };
  return { success: true };
};
