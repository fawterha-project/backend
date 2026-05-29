import supabase from "../supabaseClient.js";
import process from "node:process";

// Category visual metadata — single source of truth for the
// donut chart + category list cards. Frontend reads these
// fields verbatim, no extra logic needed.
const CATEGORY_META = {
  "المقاضي والبيت": {
    short_name: "المقاضي",
    icon: "shopping-basket",
    color: "#22C55E",
    bg_color: "#EAFBF0",
  },
  "المطاعم والترفيه": {
    short_name: "المطاعم",
    icon: "restaurant",
    color: "#2563FF",
    bg_color: "#EEF4FF",
  },
  "التسوق والأناقة": {
    short_name: "التسوق",
    icon: "shopping-bag",
    color: "#A020F0",
    bg_color: "#F6EAFF",
  },
  "النقل والسيارة": {
    short_name: "النقل",
    icon: "directions-bus",
    color: "#FFB000",
    bg_color: "#FFF6E7",
  },
  "الصحة والعافية": {
    short_name: "الصحة",
    icon: "favorite",
    color: "#FF4B5C",
    bg_color: "#FFECEF",
  },
  "الفواتير والالتزامات": {
    short_name: "الالتزامات",
    icon: "event",
    color: "#12C6D7",
    bg_color: "#EAFBFC",
  },
  أخرى: {
    short_name: "أخرى",
    icon: "more-horiz",
    color: "#8C8FA1",
    bg_color: "#F3F3F6",
  },
};

const FALLBACK_META = {
  short_name: "غير معروفة",
  icon: "label",
  color: "#9CA3AF",
  bg_color: "#F3F4F6",
};

const UNCATEGORIZED_META = {
  short_name: "غير مصنفة",
  icon: "help-outline",
  color: "#BDBDBD",
  bg_color: "#F5F5F5",
};

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

// Saudi time zone helpers:
const SAUDI_OFFSET_MS =
  parseInt(process.env.SAUDI_TIMEZONE_OFFSET_HOURS || "3", 10) * 60 * 60 * 1000;
function toSaudiView(date) {
  return new Date(date.getTime() + SAUDI_OFFSET_MS);
}
function fromSaudiView(saudiViewDate) {
  return new Date(saudiViewDate.getTime() - SAUDI_OFFSET_MS);
}
function saudiDayOfWeek(date) {
  return toSaudiView(date).getUTCDay();
}
function saudiMonthIndex(date) {
  return toSaudiView(date).getUTCMonth();
}
function saudiDayOfMonth(date) {
  return toSaudiView(date).getUTCDate();
}

// Date helpers:
function startOfWeek(date = new Date()) {
  const sv = toSaudiView(date);
  sv.setUTCHours(0, 0, 0, 0);
  const day = sv.getUTCDay();
  const offset = (day + 1) % 7;
  sv.setUTCDate(sv.getUTCDate() - offset);
  return fromSaudiView(sv);
}
function startOfMonth(date = new Date()) {
  const sv = toSaudiView(date);
  sv.setUTCHours(0, 0, 0, 0);
  sv.setUTCDate(1);
  return fromSaudiView(sv);
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

function groupByDay(invoices, startDate, days) {
  const buckets = [];
  for (let i = 0; i < days; i++) {
    const d = addDays(startDate, i);
    buckets.push({
      label: ARABIC_DAYS[saudiDayOfWeek(d)],
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

function groupByWeek(invoices) {
  const buckets = Array.from({ length: 5 }, (_, i) => ({
    label: `الأسبوع ${i + 1}`,
    total: 0,
  }));
  for (const inv of invoices) {
    const day = saudiDayOfMonth(new Date(inv.issued_at));
    const idx = Math.min(Math.floor((day - 1) / 7), 4);
    buckets[idx].total = round2(buckets[idx].total + Number(inv.total_price));
  }
  return buckets;
}

function groupByMonth(invoices) {
  const buckets = ARABIC_MONTHS.map((label, i) => ({
    label,
    month: i + 1,
    total: 0,
  }));
  for (const inv of invoices) {
    const m = saudiMonthIndex(new Date(inv.issued_at));
    buckets[m].total = round2(buckets[m].total + Number(inv.total_price));
  }
  return buckets;
}

// Returns a full design-ready object per category:
//   categorie_id, categorie_name (short), categorie_name_full,
//   icon, color, bg_color, total, percent
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
    const fullName = nameById.get(id) || "غير معروفة";
    const meta = CATEGORY_META[fullName] || FALLBACK_META;
    result.push({
      categorie_id: id,
      categorie_name: meta.short_name,
      categorie_name_full: fullName,
      icon: meta.icon,
      color: meta.color,
      bg_color: meta.bg_color,
      total: round2(total),
      percent: totalSum > 0 ? Math.round((total / totalSum) * 1000) / 10 : 0,
    });
  }
  if (uncategorized > 0) {
    result.push({
      categorie_id: null,
      categorie_name: UNCATEGORIZED_META.short_name,
      categorie_name_full: null,
      icon: UNCATEGORIZED_META.icon,
      color: UNCATEGORIZED_META.color,
      bg_color: UNCATEGORIZED_META.bg_color,
      total: round2(uncategorized),
      percent:
        totalSum > 0 ? Math.round((uncategorized / totalSum) * 1000) / 10 : 0,
    });
  }
  return result.sort((a, b) => b.total - a.total);
}

// Endpoint logic

export const getSummary = async (user_id) => {
  const monthStart = startOfMonth();
  const monthEnd = addMonths(monthStart, 1);
  const prevStart = addMonths(monthStart, -1);
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const sevenDaysAgo = addDays(today, -6);

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
  const yearStart = fromSaudiView(new Date(Date.UTC(yearNum, 0, 1)));
  const yearEnd = fromSaudiView(new Date(Date.UTC(yearNum + 1, 0, 1)));
  const prevStart = fromSaudiView(new Date(Date.UTC(yearNum - 1, 0, 1)));
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
