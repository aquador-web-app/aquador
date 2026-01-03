export function exportInvoicesCSV(invoices) {
  if (!invoices || invoices.length === 0) {
    alert("Aucune facture à exporter")
    return
  }

  const headers = ["Utilisateur", "Montant total", "Payé", "Statut", "Date d'échéance", "Créée le"]

  const rows = invoices.map((i) => [
    i.user_id || "",
    i.total || 0,
    i.paid_total || 0,
    i.status || "",
    i.due_date || "",
    i.created_at || "",
  ])

  const csvContent =
    [headers, ...rows].map((row) => row.join(",")).join("\n")

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" })
  const url = URL.createObjectURL(blob)

  const link = document.createElement("a")
  link.href = url
  link.setAttribute("download", "factures.csv")
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}
