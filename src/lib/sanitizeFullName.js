// src/lib/sanitizeFullName.js
export function sanitizeFullName(input) {
  return String(input || "")
    .trim()
    // Normalize accents
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    // Keep letters, numbers, spaces, hyphens
    .replace(/[^a-zA-Z0-9\s-]/g, "")
    // Collapse spaces
    .replace(/\s+/g, " ")
    // Capitalize each word
    .split(" ")
    .map(
      (word) =>
        word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    )
    // Use underscore for folders
    .join("_");
}
