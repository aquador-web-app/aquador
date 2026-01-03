import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js";
import { PDFDocument, rgb, StandardFonts } from "https://esm.sh/pdf-lib";

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

    // Get base invoice (to fetch user_id & name)
    const { data: baseInvoice, error: invErr } = await supabase
      .from("invoices")
      .select("user_id, full_name")
      .eq("id", invoice_id)
      .single();

    if (invErr || !baseInvoice) {
      console.error("Invoice fetch error:", invErr);
      return new Response("Invoice not found", { status: 404 });
    }

    // Fetch all pending invoices for that user
    const { data: invoices, error: allErr } = await supabase
      .from("invoices")
      .select("id, description, total, issued_at, due_date")
      .eq("user_id", baseInvoice.user_id)
      .eq("status", "pending");

    if (allErr || !invoices || invoices.length === 0) {
      return new Response("No pending invoices found", { status: 404 });
    }

    // Fetch all items for those invoices
    const { data: items, error: itemsErr } = await supabase
      .from("invoice_items")
      .select("invoice_id, description, amount")
      .in("invoice_id", invoices.map((i) => i.id));

    if (itemsErr) {
      console.error("Items fetch error:", itemsErr);
      return new Response("Error fetching invoice items", { status: 500 });
    }

    // === Build PDF ===
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([600, 800]);
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const { height } = page.getSize();

    let y = height - 60;

    // Logo (fetch from Supabase bucket)
    const { data: logoData } = await supabase.storage
      .from("assets") // 👈 make sure you have a bucket named "assets"
      .download("aquador.png"); // 👈 file must exist in that bucket

    if (logoData) {
      const logoBytes = new Uint8Array(await logoData.arrayBuffer());
      const logoImage = await pdfDoc.embedPng(logoBytes);
      const logoDims = logoImage.scale(0.2);
      page.drawImage(logoImage, {
        x: 50,
        y: y - 40,
        width: logoDims.width,
        height: logoDims.height,
      });
    }

    page.drawText("A’QUA D’OR - FACTURE", {
      x: 200,
      y,
      size: 18,
      font,
      color: rgb(0, 0.5, 0.3),
    });
    y -= 50;

    // School info
    page.drawText("Imp Hall, Rue Beauvais, Faustin 1er, Delmas 75, Haiti", {
      x: 50,
      y,
      size: 10,
      font,
    });
    y -= 15;
    page.drawText("Tel: +509 3891 2429 | Email: aquadorecoledenatation@hotmail.com", {
      x: 50,
      y,
      size: 10,
      font,
    });
    y -= 40;

    // Client Info
    page.drawText(`Client: ${baseInvoice.full_name}`, { x: 50, y, size: 12, font });
    y -= 25;

    // Table header
    page.drawRectangle({
      x: 50,
      y,
      width: 500,
      height: 20,
      color: rgb(0, 0.7, 0.4),
    });
    page.drawText("Description", { x: 55, y: y + 5, size: 12, font, color: rgb(1, 1, 1) });
    page.drawText("Montant (USD)", { x: 400, y: y + 5, size: 12, font, color: rgb(1, 1, 1) });
    y -= 25;

    // Items
    let total = 0;
    for (const inv of invoices) {
      const invItems = items?.filter((it) => it.invoice_id === inv.id) || [];
      for (const item of invItems) {
        page.drawRectangle({
          x: 50,
          y: y - 2,
          width: 500,
          height: 20,
          borderColor: rgb(0.8, 0.8, 0.8),
          borderWidth: 0.5,
        });
        page.drawText(item.description, { x: 55, y: y + 5, size: 11, font });
        page.drawText(`$${item.amount.toFixed(2)}`, {
          x: 450,
          y: y + 5,
          size: 11,
          font,
        });
        y -= 25;
        total += item.amount;
      }
    }

    // Total
    y -= 20;
    page.drawText(`TOTAL: $${total.toFixed(2)}`, {
      x: 400,
      y,
      size: 14,
      font,
      color: rgb(0.9, 0, 0),
    });

    const pdfBytes = await pdfDoc.save();

    // === Save to Supabase bucket ===
    const fileName = `${baseInvoice.full_name.replace(/\s+/g, " ")} – ${
  invoices[0].description
} – ${new Date(enrollments[0].start_date).toLocaleDateString("fr-FR", {
  month: "long",
  year: "numeric",
})}.pdf`;

    const { error: uploadError } = await supabase.storage
      .from("invoices") // 👈 your invoices bucket
      .upload(fileName, pdfBytes, {
        contentType: "application/pdf",
        upsert: true,
      });

    if (uploadError) {
      console.error("Upload error:", uploadError);
    }

    // Return PDF in response
    return new Response(pdfBytes, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${fileName}"`,
      },
    });
  } catch (err) {
    console.error("❌ Error generating PDF:", err);
    return new Response(`Error generating PDF: ${err}`, { status: 500 });
  }
});
