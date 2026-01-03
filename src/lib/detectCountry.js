// src/lib/detectCountry.js
export async function detectCountryISO() {
  try {
    const res = await fetch("https://ipapi.co/json/");
    const data = await res.json();
    return data?.country_code || "HT";
  } catch {
    return "HT";
  }
}
