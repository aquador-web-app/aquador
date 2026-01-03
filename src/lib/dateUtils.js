/**
 * Format ISO or YYYY-MM-DD date in French (local-safe)
 * Example: "2025-10-22" → "22 octobre 2025"
 * Handles UTC strings and plain dates without -1 day shift.
 */
export function formatDateFrSafe(isoDate, showTime = false) {
  if (!isoDate) return "—";

  let date;

  // ✅ Handle plain YYYY-MM-DD as LOCAL (not UTC)
  if (/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) {
    const [y, m, d] = isoDate.split("-");
    date = new Date(Number(y), Number(m) - 1, Number(d));
  } else {
    date = new Date(isoDate);
  }

  const base = date.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  if (!showTime) {
    return base.charAt(0).toUpperCase() + base.slice(1);
  }

  const time = date.toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  });

  return `${base.charAt(0).toUpperCase() + base.slice(1)} à ${time}`;
}

/**
 * Normalize any date to YYYY-MM-DD ISO format
 */
export function normalizeISODate(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  return d.toISOString().split("T")[0];
}

/**
 * Format numbers as USD with commas and 2 decimals.
 * Example: 8500 -> "USD 8,500.00"
 */
export function formatCurrencyUSD(amount) {
  if (amount == null || isNaN(amount)) return "USD 0.00";
  return `USD ${Number(amount).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * Format numbers as HTG with commas and 2 decimals.
 * Example: 20000 -> "HTG 20,000.00"
 */
export function formatCurrencyHTG(amount) {
  if (amount == null || isNaN(amount)) return "HTG 0.00";
  return `HTG ${Number(amount).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * Format YYYY-MM-DD safely as local French date
 * Example: "2025-10-22" → "22 octobre 2025"
 */
export function formatDateOnly(dateStr) {
  if (!dateStr) return "—";

  let date;
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const [y, m, d] = dateStr.split("-");
    date = new Date(Number(y), Number(m) - 1, Number(d));
  } else {
    date = new Date(dateStr);
  }

  const str = date.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Format date as French month and year
 * Example: "2025-10-22" → "Octobre 2025"
 */
export function formatMonth(dateStr) {
  if (!dateStr) return "—";

  let date;
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const [y, m, d] = dateStr.split("-");
    date = new Date(Number(y), Number(m) - 1, Number(d));
  } else {
    date = new Date(dateStr);
  }

  const str = date.toLocaleDateString("fr-FR", {
    month: "long",
    year: "numeric",
  });

  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Format timestamp (issued_at, created_at, etc.) with date + time (local)
 * Example: "2025-10-22T21:23:00Z" → "22 octobre 2025 à 17:23" (local time)
 */
export function formatTimestamp(ts) {
  if (!ts) return "—";
  const date = new Date(ts);

  const str = date.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  const time = date.toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  });

  return `${str.charAt(0).toUpperCase() + str.slice(1)} à ${time}`;
}
