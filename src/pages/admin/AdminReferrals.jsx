import { useState } from "react";
import { motion } from "framer-motion";
import { FaGift } from "react-icons/fa";
import AdminReferralOverview from "./AdminReferralOverview";
import AdminReferralDetails from "./AdminReferralDetails";

export default function AdminReferrals() {
  const [activeTab, setActiveTab] = useState("overview");
  const [selectedUserId, setSelectedUserId] = useState(null);

  const handleSelectFromOverview = (id) => {
    setSelectedUserId(id);
    setActiveTab("details");
  };

  return (
    <div className="max-w-7xl mx-auto p-6">
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-gradient-to-r from-blue-700 to-teal-500 text-white rounded-2xl shadow-lg py-6 px-6 mb-6 text-center"
      >
        <h2 className="text-3xl font-bold flex items-center justify-center gap-2">
          <FaGift /> Gestion des Parrainages
        </h2>
        <p className="text-sm opacity-90">
          Suivi global et individuel des parrainages et commissions
        </p>

        <div className="flex justify-center gap-4 mt-4">
          <button
            onClick={() => setActiveTab("overview")}
            className={`px-4 py-2 rounded-t-lg font-semibold transition ${
              activeTab === "overview"
                ? "bg-white text-blue-700 shadow-md"
                : "bg-blue-600/30 hover:bg-blue-500/40 text-white"
            }`}
          >
            🧭 Vue d’ensemble
          </button>
          <button
            onClick={() => setActiveTab("details")}
            className={`px-4 py-2 rounded-t-lg font-semibold transition ${
              activeTab === "details"
                ? "bg-white text-blue-700 shadow-md"
                : "bg-blue-600/30 hover:bg-blue-500/40 text-white"
            }`}
          >
            👥 Liens individuels
          </button>
        </div>
      </motion.div>

      <div className="bg-white rounded-2xl shadow-md p-4">
        {activeTab === "overview" ? (
          <AdminReferralOverview onSelect={handleSelectFromOverview} />
        ) : (
          <AdminReferralDetails
            userId={selectedUserId}
            onBack={() => setActiveTab("overview")}
          />
        )}
      </div>
    </div>
  );
}
