// src/pages/Club/ClubQRScanner.jsx
import { useState, useEffect, useRef } from "react";
import { QrReader } from "react-qr-reader";
import { supabase } from "../../lib/supabaseClient";

export default function ClubQRScanner() {
  const [scanActive, setScanActive] = useState(false);
  const [scanResult, setScanResult] = useState(null);
  const [scanError, setScanError] = useState("");
  const [loading, setLoading] = useState(false);
  const [logs, setLogs] = useState([]);

  const scannerRef = useRef(null);
  const lastScan = useRef(0);

  const stopCamera = () => {
    try {
      if (scannerRef.current?.stream) {
        scannerRef.current.stream.getTracks().forEach((t) => t.stop());
      }
    } catch (_) {}
  };

  async function fetchLogs() {
    const { data, error } = await supabase
      .from("club_qr_logs")
      .select("*")
      .order("scanned_at", { ascending: false })
      .limit(20);

    if (error) {
      console.error("❌ Error fetching logs:", error);
      return;
    }

    setLogs(data || []);
  }

  useEffect(() => {
    fetchLogs();
  }, []);

  async function handleScan(res) {
    if (!res?.text) return;

    const now = Date.now();
    if (now - lastScan.current < 3000) return; // 3 seconds cooldown
    lastScan.current = now;

    setLoading(true);
    setScanError("");
    setScanResult(null);

    try {
      let payload;
      try {
        payload = JSON.parse(res.text);
      } catch {
        setScanError("QR Code invalide (JSON).");
        setLoading(false);
        return;
      }

      if (!payload.qr_token) {
        setScanError("QR Code invalide : token manquant.");
        setLoading(false);
        return;
      }

      const endpoint = `${import.meta.env.VITE_SUPABASE_FUNCTIONS_URL}/validate-club-qr`;

      const r = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ qr_token: payload.qr_token }),
      });

      const json = await r.json();
      setLoading(false);
      setScanResult(json);
      setScanError(json.valid ? "" : json.reason || "");

      // Refresh history after each scan
      fetchLogs();
    } catch (err) {
      console.error(err);
      setScanError("Erreur interne.");
      setLoading(false);
    }
  }

  const renderResultCard = () => {
    if (!scanResult && !scanError && !loading) return null;

    if (loading) {
      return (
        <div className="mt-4 p-3 text-center text-blue-600 font-semibold">
          Validation…
        </div>
      );
    }

    if (scanError && !scanResult?.valid) {
      return (
        <div className="mt-4 p-4 bg-red-100 text-red-700 rounded-xl text-center font-semibold">
          ❌ {scanError}
        </div>
      );
    }

    if (!scanResult) return null;

    const isValid = scanResult.valid && !scanResult.used;
    const booking = scanResult.booking || null;

    return (
      <div
        className={`mt-4 p-4 rounded-xl text-center shadow ${
          isValid ? "bg-green-100 text-green-800" : "bg-red-100 text-red-700"
        }`}
      >
        {isValid ? (
          <>
            <h2 className="text-xl font-bold mb-1">✔ Validé</h2>
            {booking ? (
              <>
                <p className="font-semibold">{booking.full_name}</p>
                <p className="text-sm mt-2">
                  <strong>Événement :</strong> {booking.title}
                  <br />
                  <strong>Date :</strong> {booking.date}
                  <br />
                  <strong>Heure :</strong> {booking.start_time} →{" "}
                  {booking.end_time}
                </p>
              </>
            ) : (
              <p className="text-sm mt-2">
                QR valide, mais réservation introuvable.
              </p>
            )}
          </>
        ) : (
          <>
            <h2 className="text-xl font-bold mb-1">❌ Refusé</h2>
            <p className="font-semibold">
              {scanResult.reason || "QR code invalide."}
            </p>
          </>
        )}
      </div>
    );
  };

  const statusLabel = (status) => {
    switch (status) {
      case "valid":
        return "Validé";
      case "used":
        return "Déjà utilisé";
      case "invalid":
        return "Invalide";
      case "valid-no-booking":
        return "Valide (sans réservation)";
      default:
        return status || "—";
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-center mb-2">
        Scanner QR – Club A’QUA D’OR
      </h1>
      <p className="text-center text-gray-500 text-sm mb-4">
        Utilisez ce module pour valider les QR codes des réservations du club.
      </p>

      {/* Scanner Card */}
      <div className="bg-white shadow-lg rounded-2xl p-6">
        <div className="flex flex-col items-center border-b pb-3 mb-4">
          <div className="bg-blue-100 text-blue-700 p-2 rounded-xl mb-2">
            <i className="fa-solid fa-qrcode text-2xl" />
          </div>
          <h3 className="font-semibold text-lg text-gray-800">
            Scanner un QR code
          </h3>
        </div>

        {!scanActive ? (
          <div className="flex flex-col items-center space-y-3">
            <button
              onClick={() => {
                setScanActive(true);
                setScanError("");
                setScanResult(null);
              }}
              className="bg-aquaBlue text-white px-6 py-2 rounded-lg font-medium shadow hover:bg-blue-700 transition"
            >
              <i className="fa-solid fa-camera mr-2" />
              Démarrer le scan
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center space-y-4">
            <div className="w-[280px] h-[280px] rounded-xl overflow-hidden border-2 border-aquaBlue shadow-inner">
              <QrReader
                ref={scannerRef}
                constraints={{ facingMode: "environment" }}
                onResult={(r) => handleScan(r)}
                videoStyle={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                }}
              />
            </div>

            <button
              onClick={() => {
                stopCamera();
                setScanActive(false);
              }}
              className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition"
            >
              <i className="fa-solid fa-xmark mr-2" />
              Fermer
            </button>
          </div>
        )}

        {renderResultCard()}
      </div>

      {/* History Card */}
      <div className="bg-white p-6 rounded-2xl shadow">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-lg">Historique des scans</h3>
          <button
            onClick={fetchLogs}
            className="text-xs px-3 py-1 rounded bg-gray-100 hover:bg-gray-200 text-gray-700"
          >
            Rafraîchir
          </button>
        </div>

        {(!logs || !logs.length) && (
          <p className="text-gray-500 italic">Aucun scan pour le moment.</p>
        )}

        <ul className="space-y-2 max-h-80 overflow-y-auto">
          {logs.map((l) => (
            <li
              key={l.id}
              className="border rounded-lg p-3 text-sm flex justify-between items-center"
            >
              <div>
                <p className="font-semibold">
                  {l.full_name || "—"}{" "}
                  <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">
                    {statusLabel(l.status)}
                  </span>
                </p>
                {l.reason && (
                  <p className="text-gray-600 text-xs mt-1">{l.reason}</p>
                )}
                {l.qr_token && (
                  <p className="text-gray-400 text-[11px] mt-1">
                    Token: {l.qr_token.slice(0, 8)}…
                  </p>
                )}
              </div>
              <div className="text-gray-500 text-xs text-right">
                {l.scanned_at &&
                  new Date(l.scanned_at).toLocaleString("fr-FR")}
                {l.ip_address && (
                  <div className="mt-1 text-[11px] text-gray-400">
                    IP: {l.ip_address}
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
