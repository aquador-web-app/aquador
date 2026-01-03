import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js";
import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib";

serve(async (req) => {
  try {
    const { invoice_id } = await req.json();

    if (!invoice_id) {
      return new Response("Missing invoice_id", { status: 400 });
    }

    // Supabase client
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Fetch invoice + items
    const { data: invoice, error: invoiceError } = await supabase
      .from("invoices")
      .select("id, user_id, full_name, description, total, issued_at, due_date")
      .eq("id", invoice_id)
      .single();

    if (invoiceError || !invoice) {
      console.error("Invoice fetch error:", invoiceError);
      return new Response("No pending invoices for this user", { status: 404 });
    }

    const { data: items } = await supabase
      .from("invoice_items")
      .select("description, amount")
      .eq("invoice_id", invoice_id);

    // === Build PDF ===
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([600, 750]);
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const { height } = page.getSize();

    let y = height - 50;

    // Title
    page.drawText("FACTURE", {
      x: 230,
      y,
      size: 20,
      font,
      color: rgb(0, 0, 0),
    });

    y -= 40;

    page.drawText(`Nom: ${invoice.full_name}`, { x: 50, y, size: 12, font });
    y -= 20;
    page.drawText(`Description: ${invoice.description}`, { x: 50, y, size: 12, font });
    y -= 20;
    page.drawText(`Date d'émission: ${new Date(invoice.issued_at).toLocaleDateString("fr-FR")}`, {
      x: 50,
      y,
      size: 12,
      font,
    });
    y -= 20;
    page.drawText(`Date d'échéance: ${new Date(invoice.due_date).toLocaleDateString("fr-FR")}`, {
      x: 50,
      y,
      size: 12,
      font,
    });

    y -= 40;

    // Items
    page.drawText("Détails:", { x: 50, y, size: 14, font });
    y -= 20;

    if (items && items.length > 0) {
      for (const item of items) {
        page.drawText(`${item.description} - $${item.amount.toFixed(2)}`, {
          x: 70,
          y,
          size: 12,
          font,
        });
        y -= 20;
      }
    }

    y -= 20;
    page.drawText(`TOTAL: $${invoice.total.toFixed(2)}`, {
      x: 70,
      y,
      size: 14,
      font,
    });

    const pdfBytes = await pdfDoc.save();

    // === Filename handling ===
    const prettyFileName = `${invoice.description}.pdf`;
    const safeFileName = encodeURIComponent(prettyFileName);

    return new Response(pdfBytes, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename*=UTF-8''${safeFileName}`, // safe ASCII
      },
    });
  } catch (err) {
    console.error("❌ Error generating PDF:", err);
    return new Response(`Error generating PDF: ${err}`, { status: 500 });
  }
});
