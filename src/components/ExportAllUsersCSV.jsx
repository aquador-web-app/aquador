export function exportAllUsersCSV(users) {
  if (!users || users.length === 0) {
    alert("Aucun utilisateur à exporter")
    return
  }

  const headers = [
    "Prénom",
    "Deuxième prénom",
    "Nom",
    "Email",
    "Téléphone",
    "Sexe",
    "Date de naissance",
    "Referral Code",
    "Rôle",
  ]

  const rows = users.map((u) => [
    u.first_name || "",
    u.middle_name || "",
    u.last_name || "",
    u.email || "",
    u.phone || "",
    u.sex || "",
    u.birth_date || "",
    u.referral_code || "",
    u.role || "",
  ])

  const csvContent =
    [headers, ...rows].map((row) => row.join(",")).join("\n")

  const blob = new Blob([csvContent], {
    type: "text/csv;charset=utf-8;",
  })
  const url = URL.createObjectURL(blob)

  const link = document.createElement("a")
  link.href = url
  link.setAttribute("download", "utilisateurs.csv")
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}
