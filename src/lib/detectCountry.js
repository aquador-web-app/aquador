// src/lib/detectCountry.js
export function detectCountryISO() {
  try {
    const locale = Intl.DateTimeFormat().resolvedOptions().locale;
    const country = locale.split("-")[1];
    return country || "HT";
  } catch {
    return "HT";
  }
}
