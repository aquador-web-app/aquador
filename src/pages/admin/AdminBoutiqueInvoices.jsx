import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import DatePicker from "react-datepicker";
import { formatCurrencyUSD, formatDateFrSafe } from "../../lib/dateUtils";
import { ChevronDownIcon } from "@heroicons/react/24/solid";
import { Menu, Transition } from "@headlessui/react";
import {
  FaCheckCircle,
  FaUndo,
  FaDownload,
  FaMoneyBillWave,
} from "react-icons/fa";
import { useGlobalAlert } from "../../components/GlobalAlert";


const STATUSES = ["all", "pending", "paid", "cancelled"];

export default function AdminBoutiqueInvoices() {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [startDate, setStartDate] = useState(null);
  const [endDate, setEndDate] = useState(null);
  const [authUser, setAuthUser] = useState(null);
  const [role, setRole] = useState(null);
  const { showAlert, showConfirm } = useGlobalAlert();



  // ---------------- AUTH + LOAD ----------------
  useEffect(() => {
    (async () => {
      const {
        data: { user },
        error,
      } = await supabase.auth.getUser();
      if (error) console.error("❌ Auth error:", error);
      if (!user) {
        alert("Please log in again as admin.");
        return;
      }

      console.log("👤 Logged in as:", user.email, user.id);
      setAuthUser(user);
      await load();

      // ✅ Fetch role
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    if (profile) setRole(profile.role);

    await load();

      // auto refresh every 10s
      const interval = setInterval(() => load(), 10000);
      return () => clearInterval(interval);
    })();
  }, []);

  // ---------------- LOAD DATA ----------------
  const load = async () => {
    setLoading(true);

    console.log("🔍 Fetching boutique_invoices (with items)...");
    const { data, error } = await supabase
      .from("boutique_invoices")
      .select(`
        id, user_id, full_name, payment_method, invoice_no,
        total, paid_total, status, created_at, pdf_url,
        boutique_invoice_items (
          id,
          product_id,
          name,
          unit_price,
          qty
        )
      `)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("❌ loadBoutiqueInvoices error:", error);
      setInvoices([]);
      setLoading(false);
      return;
    }

    console.log(`✅ Query returned ${data?.length || 0} rows`);

    const ids = [...new Set(data.map((r) => r.user_id).filter(Boolean))];
    const { data: profs } = await supabase
      .from("profiles_with_unpaid")
      .select("id, full_name, role")
      .in("id", ids);

    const profMap = Object.fromEntries((profs || []).map((p) => [p.id, p]));
    setInvoices(
      data.map((r) => ({
        ...r,
        buyer_name: r.full_name || profMap[r.user_id]?.full_name || "—",
        role: profMap[r.user_id]?.role || "user",
      }))
    );
    setLoading(false);
  };

  // ---------------- FILTERING ----------------
  const filtered = useMemo(() => {
    return invoices.filter((inv) => {
      if (
        statusFilter !== "all" &&
        (inv.status || "").toLowerCase() !== statusFilter
      )
        return false;
      const date = inv.created_at;
      if (startDate && date && new Date(date) < new Date(startDate)) return false;
      if (endDate && date && new Date(date) > new Date(endDate)) return false;
      return true;
    });
  }, [invoices, statusFilter, startDate, endDate]);

  // ---------------- ACTIONS ----------------
  const confirmPayment = async (inv) => {
  const confirmed = await showConfirm(
    `Confirmer le paiement de la facture ${inv.invoice_no} ?`
  );

  if (!confirmed) return;

  try {
    const { error } = await supabase
      .from("boutique_invoices")
      .update({
        status: "paid",
        paid_total: inv.total,
      })
      .eq("id", inv.id);

    if (error) throw error;

    await showAlert("✅ Paiement confirmé !");
    await load();
  } catch (err) {
    await showAlert("Erreur lors de la confirmation: " + err.message);
  }
};


  const revertPayment = async (inv) => {
  const confirmed = await showConfirm(
    `Supprimer la facture ${inv.invoice_no} ? (Cela rétablira le stock et les commissions)`
  );

  if (!confirmed) return;

  try {
    const { error } = await supabase
      .from("boutique_invoices")
      .delete()
      .eq("id", inv.id);

    if (error) throw error;

    await showAlert("🗑️ Facture supprimée.");
    await load();
  } catch (err) {
    await showAlert("Erreur lors de la suppression : " + err.message);
  }
};


  // ---------------- UI ----------------
  return (
    <div className="p-6">
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <h1 className="text-3xl font-bold text-gray-800">
          Gestion des factures Boutique
        </h1>
        <div className="flex gap-2 items-center">
          <StatusDropdown value={statusFilter} onChange={setStatusFilter} />
          <DateField label="Début" date={startDate} onChange={setStartDate} />
          <DateField label="Fin" date={endDate} onChange={setEndDate} />
          <button
            className="px-3 py-2 rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50"
            onClick={() => {
              setStatusFilter("all");
              setStartDate(null);
              setEndDate(null);
            }}
          >
            Réinitialiser
          </button>
        </div>
      </header>

      {loading ? (
        <div className="text-center text-gray-500 py-10">Chargement…</div>
      ) : filtered.length === 0 ? (
        <p className="text-gray-500">
          Aucune facture trouvée.{" "}
          <span className="text-xs text-gray-400">
            (Si vous êtes admin, cela peut être dû à RLS.)
          </span>
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg shadow border border-gray-200">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <Th>Facture</Th>
                <Th>Client</Th>
                <Th>Description</Th>
                <Th right>Total</Th>
                <Th>Status</Th>
                <Th>Méthode</Th>
                <Th>Date</Th>
                <Th>PDF</Th>
                {role !== "assistant" && <Th>Actions</Th>}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {filtered.map((inv) => {
                const items = inv.boutique_invoice_items || [];

                const statusClass =
                  inv.status === "paid"
                    ? "text-green-700 bg-green-50"
                    : inv.payment_method !== "commission" &&
                      inv.status === "pending"
                    ? "text-blue-700 bg-blue-50"
                    : inv.status === "pending"
                    ? "text-yellow-700 bg-yellow-50"
                    : "text-red-700 bg-red-50";

                const statusLabel =
                  inv.status === "paid"
                    ? inv.payment_method === "commission"
                      ? "Utilisé en boutique"
                      : "Payée"
                    : inv.payment_method !== "commission" &&
                      inv.status === "pending"
                    ? "En attente validation admin"
                    : inv.status === "pending"
                    ? "En attente"
                    : "Annulée";

                return (
                  <tr key={inv.id}>
                    <Td>{inv.invoice_no}</Td>
                    <Td>{inv.buyer_name}</Td>
                    <Td>
                      <ul className="text-xs text-gray-700 space-y-1">
                        {items.map((it) => (
                          <li key={it.id}>
                            {it.name} —{" "}
                            <span className="font-medium text-blue-600">
                              {formatCurrencyUSD(it.unit_price)} × {it.qty}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </Td>
                    <Td right>{formatCurrencyUSD(inv.total)}</Td>
                    <Td>
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs font-semibold ${statusClass}`}
                      >
                        {statusLabel}
                      </span>
                    </Td>
                    <Td className="capitalize">
                      {inv.payment_method === "commission" ? (
                        <span className="inline-flex items-center gap-1 text-green-700">
                          <FaMoneyBillWave /> Commissions
                        </span>
                      ) : (
                        inv.payment_method
                      )}
                    </Td>
                    <Td>{formatDateFrSafe(inv.created_at)}</Td>
                    <Td>
                      {inv.pdf_url ? (
                        <a
                          href={inv.pdf_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-aquaBlue hover:text-blue-800 flex items-center gap-1 text-sm font-medium"
                        >
                          <FaDownload /> Ouvrir
                        </a>
                      ) : (
                        <span className="text-xs text-gray-400">
                          PDF en cours…
                        </span>
                      )}
                    </Td>
                    {role !== "assistant" && (
  <Td>
    {inv.status !== "paid" ? (
      <button
        onClick={() => confirmPayment(inv)}
        className="flex items-center gap-1 px-2 py-1 bg-green-600 text-white rounded hover:bg-green-700 text-xs"
      >
        <FaCheckCircle /> Confirmer
      </button>
    ) : (
      <button
        onClick={() => revertPayment(inv)}
        className="flex items-center gap-1 px-2 py-1 bg-orange-500 text-white rounded hover:bg-orange-600 text-xs"
      >
        <FaUndo /> Supprimer
      </button>
    )}
  </Td>
)}

                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ---------------- UI helpers ----------------
function StatusDropdown({ value, onChange }) {
  const label = `Statut: ${value[0].toUpperCase() + value.slice(1)}`;
  return (
    <Menu as="div" className="relative inline-block text-left">
      <Menu.Button className="inline-flex w-full justify-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
        {label}
        <ChevronDownIcon className="h-4 w-4 text-gray-500" />
      </Menu.Button>
      <Transition
        enter="transition duration-100"
        enterFrom="transform scale-95 opacity-0"
        enterTo="transform scale-100 opacity-100"
        leave="transition duration-75"
        leaveFrom="transform scale-100 opacity-100"
        leaveTo="transform scale-95 opacity-0"
      >
        <Menu.Items className="absolute z-10 mt-2 w-40 origin-top-right rounded-md bg-white shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none">
          {STATUSES.map((s) => (
            <Menu.Item key={s}>
              {({ active }) => (
                <button
                  onClick={() => onChange(s)}
                  className={`${
                    active ? "bg-gray-50" : ""
                  } block w-full text-left px-3 py-2 text-sm text-gray-700`}
                >
                  {s[0].toUpperCase() + s.slice(1)}
                </button>
              )}
            </Menu.Item>
          ))}
        </Menu.Items>
      </Transition>
    </Menu>
  );
}

function DateField({ label, date, onChange }) {
  return (
    <div className="flex flex-col">
      <label className="text-xs text-gray-600 mb-1">{label}</label>
      <DatePicker
        selected={date ? new Date(date) : null}
        onChange={(d) => onChange(d)}
        className="border border-gray-300 rounded-md px-3 py-2 text-sm w-40"
        placeholderText="Choisir date"
        isClearable
      />
    </div>
  );
}

function Th({ children, right }) {
  return (
    <th
      className={`px-4 py-2 text-sm font-medium text-gray-600 ${
        right ? "text-right" : "text-left"
      }`}
    >
      {children}
    </th>
  );
}

function Td({ children, right }) {
  return (
    <td
      className={`px-4 py-2 text-sm align-top ${
        right ? "text-right" : "text-left"
      }`}
    >
      {children}
    </td>
  );
} 
