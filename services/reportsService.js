import supabase from "../supabaseClient.js";

// Arabic day names indexed by JS getUTCDay() (0 = Sunday ... 6 = Saturday)
const ARABIC_DAYS = ["أحد", "اثنين", "ثلاثاء", "أربعاء", "خميس", "جمعة", "سبت"];
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

// ---- Date helpers ----
function startOfWeek(date = new Date()) {
  // Saturday is the start of the week (Saudi convention)
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  const day = d.getUTCDay();
  const offset = (day + 1) % 7; // Sat=0, Sun=1, ..., Fri=6
  d.setUTCDate(d.getUTCDate() - offset);
  return d;
}
function startOfMonth(date = new Date()) {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(1);
  return d;
}
function addDays(date, n) {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + n);
  return d;
}
function addMonths(date, n) {
  const d = new Date(date);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d;
}

// % change vs previous period
function computeChange(current, previous) {
  if (previous === 0) {
    return {
      change_percent: current > 0 ? 100 : 0,
      change_direction: current > 0 ? "up" : "flat",
    };
  }
  const diff = current - previous;
  return {
    change_percent: Math.round(Math.abs((diff / previous) * 100) * 10) / 10,
    change_direction: diff > 0 ? "up" : diff < 0 ? "down" : "flat",
  };
}

// Pull invoices for a user in a date range
async function fetchInvoices(user_id, start, end) {
  const { data, error } = await supabase
    .from("invoice")
    .select("invoice_id, total_price, issued_at, categorie_id")
    .eq("users_id", user_id)
    .gte("issued_at", start.toISOString())
    .lt("issued_at", end.toISOString());
  if (error) return { error: error.message };
  return { invoices: data || [] };
}

const sumTotal = (invs) => invs.reduce((s, i) => s + Number(i.total_price), 0);
const round2 = (n) => Math.round(n * 100) / 100;

// Group invoices into N daily buckets starting from `startDate`
function groupByDay(invoices, startDate, days) {
  const buckets = [];
  for (let i = 0; i < days; i++) {
    const d = addDays(startDate, i);
    buckets.push({
      label: ARABIC_DAYS[d.getUTCDay()],
      date: d.toISOString().slice(0, 10),
      total: 0,
    });
  }
  for (const inv of invoices) {
    const d = new Date(inv.issued_at);
    const idx = Math.floor((d - startDate) / 86400000);
    if (idx >= 0 && idx < days)
      buckets[idx].total = round2(buckets[idx].total + Number(inv.total_price));
  }
  return buckets;
}

// Group invoices in a month into 5 weekly buckets (الأسبوع 1..5)
function groupByWeek(invoices) {
  const buckets = Array.from({ length: 5 }, (_, i) => ({
    label: `الأسبوع ${i + 1}`,
    total: 0,
  }));
  for (const inv of invoices) {
    const day = new Date(inv.issued_at).getUTCDate();
    const idx = Math.min(Math.floor((day - 1) / 7), 4);
    buckets[idx].total = round2(buckets[idx].total + Number(inv.total_price));
  }
  return buckets;
}

// Group invoices in a year into 12 monthly buckets
function groupByMonth(invoices) {
  const buckets = ARABIC_MONTHS.map((label, i) => ({
    label,
    month: i + 1,
    total: 0,
  }));
  for (const inv of invoices) {
    const m = new Date(inv.issued_at).getUTCMonth();
    buckets[m].total = round2(buckets[m].total + Number(inv.total_price));
  }
  return buckets;
}

// Group invoices by category and add percent of total
async function groupByCategory(invoices, totalSum) {
  const { data: cats } = await supabase
    .from("categories")
    .select("categorie_id, categorie_name");
  const nameById = new Map(
    (cats || []).map((c) => [c.categorie_id, c.categorie_name]),
  );
  const totals = new Map();
  let uncategorized = 0;
  for (const inv of invoices) {
    if (!inv.categorie_id) {
      uncategorized += Number(inv.total_price);
      continue;
    }
    totals.set(
      inv.categorie_id,
      (totals.get(inv.categorie_id) || 0) + Number(inv.total_price),
    );
  }
  const result = [];
  for (const [id, total] of totals) {
    result.push({
      categorie_id: id,
      categorie_name: nameById.get(id) || "غير معروفة",
      total: round2(total),
      percent: totalSum > 0 ? Math.round((total / totalSum) * 1000) / 10 : 0,
    });
  }
  if (uncategorized > 0) {
    result.push({
      categorie_id: null,
      categorie_name: "غير مصنفة",
      total: round2(uncategorized),
      percent:
        totalSum > 0 ? Math.round((uncategorized / totalSum) * 1000) / 10 : 0,
    });
  }
  return result.sort((a, b) => b.total - a.total);
}

// ---- Endpoint logic ----

export const getSummary = async (user_id) => {
  const monthStart = startOfMonth();
  const monthEnd = addMonths(monthStart, 1);
  const prevStart = addMonths(monthStart, -1);
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const sevenDaysAgo = addDays(today, -6); // last 7 days including today

  const [thisMonth, lastMonth, lastWeek] = await Promise.all([
    fetchInvoices(user_id, monthStart, monthEnd),
    fetchInvoices(user_id, prevStart, monthStart),
    fetchInvoices(user_id, sevenDaysAgo, addDays(today, 1)),
  ]);
  if (thisMonth.error || lastMonth.error || lastWeek.error) {
    return { error: thisMonth.error || lastMonth.error || lastWeek.error };
  }

  const total = sumTotal(thisMonth.invoices);
  const previous_total = sumTotal(lastMonth.invoices);
  const invoice_count = thisMonth.invoices.length;
  const categories = await groupByCategory(thisMonth.invoices, total);

  return {
    summary: {
      total: round2(total),
      previous_total: round2(previous_total),
      ...computeChange(total, previous_total),
      invoice_count,
      average: invoice_count > 0 ? round2(total / invoice_count) : 0,
      top_category: categories[0] || null,
      trend: groupByDay(lastWeek.invoices, sevenDaysAgo, 7),
    },
  };
};

export const getWeekly = async (user_id) => {
  const weekStart = startOfWeek();
  const weekEnd = addDays(weekStart, 7);
  const prevStart = addDays(weekStart, -7);
  const [thisWeek, lastWeek] = await Promise.all([
    fetchInvoices(user_id, weekStart, weekEnd),
    fetchInvoices(user_id, prevStart, weekStart),
  ]);
  if (thisWeek.error || lastWeek.error)
    return { error: thisWeek.error || lastWeek.error };

  const total = sumTotal(thisWeek.invoices);
  const previous_total = sumTotal(lastWeek.invoices);
  const invoice_count = thisWeek.invoices.length;
  const categories = await groupByCategory(thisWeek.invoices, total);

  return {
    weekly: {
      total: round2(total),
      previous_total: round2(previous_total),
      ...computeChange(total, previous_total),
      invoice_count,
      average: invoice_count > 0 ? round2(total / invoice_count) : 0,
      top_category: categories[0] || null,
      trend: groupByDay(thisWeek.invoices, weekStart, 7),
      categories,
    },
  };
};

export const getMonthly = async (user_id) => {
  const monthStart = startOfMonth();
  const monthEnd = addMonths(monthStart, 1);
  const prevStart = addMonths(monthStart, -1);
  const [thisMonth, lastMonth] = await Promise.all([
    fetchInvoices(user_id, monthStart, monthEnd),
    fetchInvoices(user_id, prevStart, monthStart),
  ]);
  if (thisMonth.error || lastMonth.error)
    return { error: thisMonth.error || lastMonth.error };

  const total = sumTotal(thisMonth.invoices);
  const previous_total = sumTotal(lastMonth.invoices);
  const invoice_count = thisMonth.invoices.length;
  const categories = await groupByCategory(thisMonth.invoices, total);

  return {
    monthly: {
      total: round2(total),
      previous_total: round2(previous_total),
      ...computeChange(total, previous_total),
      invoice_count,
      average: invoice_count > 0 ? round2(total / invoice_count) : 0,
      top_category: categories[0] || null,
      trend: groupByWeek(thisMonth.invoices),
      categories,
    },
  };
};

export const getYearly = async (user_id, year) => {
  const yearNum = year ? parseInt(year, 10) : new Date().getUTCFullYear();
  const yearStart = new Date(Date.UTC(yearNum, 0, 1));
  const yearEnd = new Date(Date.UTC(yearNum + 1, 0, 1));
  const prevStart = new Date(Date.UTC(yearNum - 1, 0, 1));
  const [thisYear, lastYear] = await Promise.all([
    fetchInvoices(user_id, yearStart, yearEnd),
    fetchInvoices(user_id, prevStart, yearStart),
  ]);
  if (thisYear.error || lastYear.error)
    return { error: thisYear.error || lastYear.error };

  const total = sumTotal(thisYear.invoices);
  const previous_total = sumTotal(lastYear.invoices);
  const invoice_count = thisYear.invoices.length;
  const categories = await groupByCategory(thisYear.invoices, total);

  return {
    yearly: {
      year: yearNum,
      total: round2(total),
      previous_total: round2(previous_total),
      ...computeChange(total, previous_total),
      invoice_count,
      average: invoice_count > 0 ? round2(total / invoice_count) : 0,
      top_category: categories[0] || null,
      trend: groupByMonth(thisYear.invoices),
      categories,
    },
  };
};
