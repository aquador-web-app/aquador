// src/lib/detectCountry.js
export function detectCountryISO() {
  try {
    const locale = Intl.DateTimeFormat().resolvedOptions().locale;
    const parts = locale.split("-");
    const country = parts[1];

    // Accept only known countries you WANT
    if (country === "HT") return "HT";

    // Fallback for everything else
    return "HT";
  } catch {
    return "HT";
  }
}
