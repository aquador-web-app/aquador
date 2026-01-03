export function exportCommissionsCSV(commissions) {
  if (!commissions || commissions.length === 0) {
    alert("Aucune commission à exporter")
    return
  }

  const headers = ["Utilisateur", "Montant", "Payée", "Date"]

  const rows = commissions.map((c) => [
    c.user_id || "",
    c.amount || 0,
    c.paid ? "Oui" : "Non",
    c.created_at || "",
  ])

  const csvContent =
    [headers, ...rows].map((row) => row.join(",")).join("\n")

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" })
  const url = URL.createObjectURL(blob)

  const link = document.createElement("a")
  link.href = url
  link.setAttribute("download", "commissions.csv")
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}
