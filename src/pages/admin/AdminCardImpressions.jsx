// src/pages/admin/AdminCardImpressions.jsx
// @ts-nocheck
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import jsPDF from "jspdf";

function safeText(v) {
  return String(v ?? "").trim();
}

function formatDT(dt) {
  if (!dt) return "—";
  try {
    return new Date(dt).toLocaleString("fr-FR", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return String(dt);
  }
}

function makeFileName(fullName, profileId) {
  const base =
    safeText(fullName)
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "student";

  return `card_${base}_${String(profileId).slice(0, 8)}.pdf`;
}

/**
 * Simple ID-card PDF generator (landscape)
 * - size: ID-1 style-ish (86mm x 54mm)
 * - adjust design later if you want (logo, QR, photo, etc.)
 */
function generateStudentCardPDF({ full_name, profile_id, referral_code }) {
  const W = 86;
  const H = 54;

  const doc = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: [H, W],
  });

  // Border
  doc.setLineWidth(0.6);
  doc.rect(2, 2, W - 4, H - 4, "S");

  // Header
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("A'QUA D'OR", 6, 10);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text("CARTE ÉLÈVE / STUDENT CARD", 6, 15);

  // Body
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  const name = safeText(full_name) || "—";
  doc.text("Nom:", 6, 24);
  doc.setFont("helvetica", "normal");
  doc.text(name.length > 32 ? name.slice(0, 32) + "…" : name, 18, 24);

  doc.setFont("helvetica", "bold");
  doc.text("ID:", 6, 31);
  doc.setFont("helvetica", "normal");
  doc.text(String(profile_id || "—").slice(0, 18), 18, 31);

  doc.setFont("helvetica", "bold");
  doc.text("Code:", 6, 38);
  doc.setFont("helvetica", "normal");
  doc.text(safeText(referral_code) || "—", 18, 38);

  // Placeholder area (QR/photo)
  doc.setLineWidth(0.3);
  doc.rect(W - 28, 18, 22, 22, "S");
  doc.setFontSize(7);
  doc.text("QR/PHOTO", W - 23.8, 30, { align: "center" });

  // Footer
  doc.setFontSize(7);
  doc.text("www.aquador (placeholder)", 6, 50);

  return doc;
}

export default function AdminCardImpressions() {
  const [loading, setLoading] = useState(true);
  const [enrolled, setEnrolled] = useState([]); // { profile_id, full_name, referral_code }
  const [impressions, setImpressions] = useState({}); // map profile_id -> row
  const [query, setQuery] = useState("");
  const [savingId, setSavingId] = useState(null);

  const load = async () => {
    setLoading(true);

    // 1) Load enrollments (only enrolled students)
    const { data: enr, error: enrErr } = await supabase
      .from("enrollments")
      .select(
        `
        profile_id,
        status,
        profiles:profile_id (
          id,
          full_name,
          referral_code
        )
      `
      )
      .order("enrolled_at", { ascending: false });

    if (enrErr) {
      console.error(enrErr);
      alert("Erreur lors du chargement des inscriptions.");
      setLoading(false);
      return;
    }

    // Keep only active-ish enrollments (adjust if your statuses differ)
    const onlyActive = (enr || []).filter((e) => {
      const s = String(e.status || "").toLowerCase();
      return s === "" || s === "active" || s === "enrolled" || s === "paid";
    });

    // Unique students by profile_id
    const map = new Map();
    for (const e of onlyActive) {
      const p = e.profiles;
      const pid = e.profile_id || p?.id;
      if (!pid) continue;
      if (!map.has(pid)) {
        map.set(pid, {
          profile_id: pid,
          full_name: p?.full_name || pid,
          referral_code: p?.referral_code || "",
        });
      }
    }

    const students = Array.from(map.values()).sort((a, b) =>
      String(a.full_name || "").localeCompare(String(b.full_name || ""), "fr")
    );
    setEnrolled(students);

    // 2) Load impressions rows
    const { data: imp, error: impErr } = await supabase
      .from("student_card_impressions")
      .select("*");

    if (impErr) {
      console.error(impErr);
      alert("Erreur lors du chargement des impressions de cartes.");
      setLoading(false);
      return;
    }

    const impMap = {};
    (imp || []).forEach((r) => {
      impMap[r.profile_id] = r;
    });

    setImpressions(impMap);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return enrolled;

    return enrolled.filter((s) => {
      const name = String(s.full_name || "").toLowerCase();
      const code = String(s.referral_code || "").toLowerCase();
      const id = String(s.profile_id || "").toLowerCase();
      return name.includes(q) || code.includes(q) || id.includes(q);
    });
  }, [enrolled, query]);

  const counts = useMemo(() => {
    let generatedYes = 0;
    let givenYes = 0;

    for (const s of enrolled) {
      const row = impressions[s.profile_id];
      if (row?.card_generated) generatedYes++;
      if (row?.card_given) givenYes++;
    }

    return {
      total: enrolled.length,
      generatedYes,
      generatedNo: Math.max(0, enrolled.length - generatedYes),
      givenYes,
      givenNo: Math.max(0, enrolled.length - givenYes),
    };
  }, [enrolled, impressions]);

  const upsertGenerated = async ({ profile_id, fileName }) => {
    const payload = {
      profile_id,
      card_generated: true,
      generated_at: new Date().toISOString(),
      generated_by: (await supabase.auth.getUser())?.data?.user?.id || null,
      generated_file_name: fileName,
    };

    const { data, error } = await supabase
      .from("student_card_impressions")
      .upsert(payload, { onConflict: "profile_id" })
      .select("*")
      .single();

    if (error) throw error;
    return data;
  };

  const toggleGiven = async (profile_id, nextValue) => {
    const payload = {
      profile_id,
      card_given: !!nextValue,
      given_at: nextValue ? new Date().toISOString() : null,
    };

    const { data, error } = await supabase
      .from("student_card_impressions")
      .upsert(payload, { onConflict: "profile_id" })
      .select("*")
      .single();

    if (error) throw error;

    setImpressions((prev) => ({ ...prev, [profile_id]: data }));
  };

  const handleGenerate = async (student) => {
    try {
      setSavingId(student.profile_id);

      // 1) Generate PDF locally
      const doc = generateStudentCardPDF(student);
      const fileName = makeFileName(student.full_name, student.profile_id);

      // 2) Save local file (browser download)
      doc.save(fileName);

      // 3) Immediately mark as generated in DB
      const saved = await upsertGenerated({
        profile_id: student.profile_id,
        fileName,
      });

      setImpressions((prev) => ({ ...prev, [student.profile_id]: saved }));
    } catch (e) {
      console.error(e);
      alert("Erreur: impossible de générer / enregistrer le statut de la carte.");
    } finally {
      setSavingId(null);
    }
  };

  if (loading) return <div className="p-6">Chargement...</div>;

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-gray-800">🪪 Card Impressions</h1>
          <p className="text-sm text-gray-600">
            Suivi des cartes: générée / remise à l’élève.
          </p>

          <div className="mt-2 flex flex-wrap gap-2 text-sm">
            <span className="bg-white border rounded-lg px-3 py-1">
              Total: <b>{counts.total}</b>
            </span>
            <span className="bg-white border rounded-lg px-3 py-1">
              Generated ✅: <b>{counts.generatedYes}</b>
            </span>
            <span className="bg-white border rounded-lg px-3 py-1">
              Not generated ❌: <b>{counts.generatedNo}</b>
            </span>
            <span className="bg-white border rounded-lg px-3 py-1">
              Given ✅: <b>{counts.givenYes}</b>
            </span>
            <span className="bg-white border rounded-lg px-3 py-1">
              Not given ❌: <b>{counts.givenNo}</b>
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-2 w-full md:w-[360px]">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name / code / id..."
            className="border rounded-lg px-3 py-2 text-sm"
          />
          <button
            onClick={load}
            className="bg-gray-900 text-white px-3 py-2 rounded-lg text-sm hover:bg-black"
          >
            🔄 Refresh
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow overflow-x-auto">
        <table className="min-w-[900px] w-full text-sm border">
          <thead className="bg-gray-100">
            <tr>
              <th className="p-2 border text-left">Student</th>
              <th className="p-2 border">Referral</th>
              <th className="p-2 border">Generated?</th>
              <th className="p-2 border">Generated at</th>
              <th className="p-2 border">File</th>
              <th className="p-2 border">Given?</th>
              <th className="p-2 border">Given at</th>
              <th className="p-2 border">Actions</th>
            </tr>
          </thead>

          <tbody>
            {filtered.map((s) => {
              const row = impressions[s.profile_id];
              const generated = !!row?.card_generated;
              const given = !!row?.card_given;

              return (
                <tr key={s.profile_id} className="hover:bg-gray-50">
                  <td className="p-2 border">
                    <div className="font-medium text-gray-800">{s.full_name}</div>
                    <div className="text-xs text-gray-500">{s.profile_id}</div>
                  </td>

                  <td className="p-2 border text-center">{s.referral_code || "—"}</td>

                  <td className="p-2 border text-center">
                    {generated ? "✅ Yes" : "❌ No"}
                  </td>

                  <td className="p-2 border text-center">
                    {formatDT(row?.generated_at)}
                  </td>

                  <td className="p-2 border text-center">
                    <span className="text-xs">{row?.generated_file_name || "—"}</span>
                  </td>

                  <td className="p-2 border text-center">
                    {given ? "✅ Yes" : "❌ No"}
                  </td>

                  <td className="p-2 border text-center">
                    {formatDT(row?.given_at)}
                  </td>

                  <td className="p-2 border">
                    <div className="flex gap-2 justify-center">
                      <button
                        onClick={() => handleGenerate(s)}
                        disabled={savingId === s.profile_id}
                        className="bg-aquaOrange text-white px-3 py-1.5 rounded hover:bg-orange-500 text-xs disabled:opacity-60"
                      >
                        {savingId === s.profile_id ? "Generating..." : "🪪 Generate"}
                      </button>

                      <button
                        onClick={() => toggleGiven(s.profile_id, !given)}
                        className={`px-3 py-1.5 rounded text-xs ${
                          given
                            ? "bg-gray-200 text-gray-800 hover:bg-gray-300"
                            : "bg-green-600 text-white hover:bg-green-700"
                        }`}
                      >
                        {given ? "↩️ Mark Not Given" : "✅ Mark Given"}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}

            {!filtered.length && (
              <tr>
                <td colSpan={8} className="p-6 text-center text-gray-500">
                  Aucun élève trouvé.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="text-xs text-gray-500">
        Note: Le navigateur ne peut pas “confirmer” que le fichier a été sauvegardé.
        Donc on marque “Generated” juste après <b>doc.save()</b> (c’est la meilleure pratique).
      </div>
    </div>
  );
}