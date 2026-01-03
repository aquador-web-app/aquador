import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { formatDateFrSafe } from "../../lib/dateUtils";

export default function AdminNotificationsAll({ onUnreadCountChange }) {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

  const updateUnreadCount = (list) => {
    const unread = (list || []).filter((n) => !n.read).length;
    if (onUnreadCountChange) onUnreadCountChange(unread);
  };

  async function markAllAsRead() {
    const { error } = await supabase
      .from("notifications")
      .update({ read: true })
      .eq("read", false)
      .is("user_id", null); // ✅ only admin/global
    if (error) {
      console.error("❌ Error marking all as read:", error);
      return;
    }
    const updated = notifications.map((n) => ({ ...n, read: true }));
    setNotifications(updated);
    updateUnreadCount(updated);
  }

  async function markOneAsRead(id) {
    const { error } = await supabase
      .from("notifications")
      .update({ read: true })
      .eq("id", id);
    if (error) {
      console.error("❌ Error marking single notification:", error);
      return;
    }
    const updated = notifications.map((n) =>
      n.id === id ? { ...n, read: true } : n
    );
    setNotifications(updated);
    updateUnreadCount(updated);
  }

  async function fetchNotifications() {
    const { data, error } = await supabase
      .from("notifications")
      .select("*")
      .is("user_id", null) // ✅ only admin/global
      .order("date", { ascending: false });

    if (error) {
      console.error("🚨 Error fetching notifications:", error);
      return;
    }
    setNotifications(data || []);
    updateUnreadCount(data || []);
    setLoading(false);
  }

  useEffect(() => {
    fetchNotifications();

    const channel = supabase
      .channel("notifications-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications" },
        (payload) => {
          const note = payload?.new || payload?.old || {};
          // ✅ only refresh if admin/global notification changed
          if (!note.user_id) {
            console.log("🔔 Admin/global notification change:", payload.eventType);
            fetchNotifications();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  if (loading)
    return <p className="text-gray-500 italic">Chargement des notifications...</p>;

  return (
    <div className="bg-white p-6 rounded-xl shadow">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold text-aquaBlue">🔔 Toutes les Notifications</h2>
        {notifications.some((n) => !n.read) && (
          <button
            onClick={markAllAsRead}
            className="text-sm bg-aquaBlue text-white px-3 py-1 rounded hover:bg-blue-600 transition"
          >
            Marquer tout comme lu
          </button>
        )}
      </div>

      {notifications.length === 0 ? (
        <p className="text-gray-500 italic">Aucune notification trouvée</p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {notifications.map((n) => (
            <li
              key={n.id}
              className={`py-3 flex justify-between items-center ${
                n.read ? "opacity-70" : "font-semibold"
              }`}
            >
              <div>
                <p>{n.text || "(Sans texte)"}</p>
                <p className="text-sm text-gray-500">
                  {n.date ? formatDateFrSafe(n.date) : "—"}
                </p>
                {n.category && (
                  <p className="text-xs text-gray-400 italic">
                    Catégorie : {n.category}
                  </p>
                )}
              </div>

              {n.read ? (
                <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-full">
                  Lu
                </span>
              ) : (
                <button
                  onClick={() => markOneAsRead(n.id)}
                  className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full hover:bg-blue-200 transition"
                >
                  Marquer comme lu
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
