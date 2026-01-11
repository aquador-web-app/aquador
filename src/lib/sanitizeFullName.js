// lib/sanitizeFullName.js
export function sanitizeFullName(name) {
  return String(name || "")
    .normalize("NFD")                     // split accents
    .replace(/[\u0300-\u036f]/g, "")      // remove accents
    .replace(/[^a-zA-Z0-9]+/g, "_")       // punctuation → _
    .replace(/_+/g, "_")                  // collapse ___
    .replace(/^_|_$/g, "")                // trim
    .toLowerCase();
}
