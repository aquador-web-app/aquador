export default function InvoiceTable({ invoices }) {
  if (!invoices?.length) {
    return (
      <div className="bg-white p-6 rounded-xl shadow">
        <h2 className="font-bold mb-2">Factures</h2>
        <p className="text-gray-500">Aucune facture pour le moment.</p>
      </div>
    )
  }

  return (
    <div className="bg-white p-6 rounded-xl shadow">
      <h2 className="font-bold mb-2">Factures</h2>
      <table className="w-full text-sm border">
        <thead>
          <tr className="bg-gray-100 text-left">
            <th className="p-2 border">#</th>
            <th className="p-2 border">Date d'échéance</th>
            <th className="p-2 border">Montant</th>
            <th className="p-2 border">Payé</th>
            <th className="p-2 border">Statut</th>
          </tr>
        </thead>
        <tbody>
          {invoices.map((inv, i) => (
            <tr key={inv.id} className="hover:bg-gray-50">
              <td className="p-2 border">{i + 1}</td>
              <td className="p-2 border">{inv.due_date || '—'}</td>
              <td className="p-2 border">${inv.total}</td>
              <td className="p-2 border">${inv.paid_total}</td>
              <td className="p-2 border">
                {inv.status === 'paid' && (
                  <span className="bg-green-100 text-green-800 px-2 py-1 rounded text-xs">Payée</span>
                )}
                {inv.status === 'open' && (
                  <span className="bg-red-100 text-red-800 px-2 py-1 rounded text-xs">Non payée</span>
                )}
                {inv.status === 'partial' && (
                  <span className="bg-yellow-100 text-yellow-800 px-2 py-1 rounded text-xs">Partielle</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
