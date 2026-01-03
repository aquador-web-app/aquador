export function exportAttendanceCSV(records) {
  if (!records || records.length === 0) {
    alert("Aucune donnée de présence à exporter")
    return
  }

  const headers = ["Utilisateur", "Date", "Présent", "Entrée", "Sortie"]

  const rows = records.map((r) => [
    r.user_id || "",
    r.date || "",
    r.present ? "Oui" : "Non",
    r.check_in || "",
    r.check_out || "",
  ])

  const csvContent =
    [headers, ...rows].map((row) => row.join(",")).join("\n")

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" })
  const url = URL.createObjectURL(blob)

  const link = document.createElement("a")
  link.href = url
  link.setAttribute("download", "presences.csv")
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}
