// supabase/functions/shared/sanitize.ts
export function sanitizeFileName(name: string): string {
  return String(name || "")
    .normalize("NFD")                // remove accents
    .replace(/[\u0300-\u036f]/g, "") // strip diacritics
    .replace(/\s+/g, "_")            // replace spaces with underscores
    .replace(/[^a-zA-Z0-9_\-./]/g, "") // allow safe characters
    .replace(/_+/g, "_")             // compress multiple underscores
    .replace(/^_+|_+$/g, "");        // trim leading/trailing underscores
}
