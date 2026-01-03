import { useEffect, useState } from "react";
import { supabase } from "../supabaseClient"; // adjust path

export default function AdminBillingSettings() {
  const [settings, setSettings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // Load settings from DB
  useEffect(() => {
    const fetchSettings = async () => {
      setLoading(true);
      let { data, error } = await supabase
        .from("billing_settings")
        .select("id, setting_key, setting_value");
      if (error) {
        setError(error.message);
      } else {
        setSettings(data);
      }
      setLoading(false);
    };
    fetchSettings();
  }, []);

  // Handle save
  const saveSetting = async (id, newValue) => {
    setSaving(true);
    const { error } = await supabase
      .from("billing_settings")
      .update({ setting_value: newValue, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      setError(error.message);
    }
    setSaving(false);
  };

  if (loading) return <p>Loading settings...</p>;
  if (error) return <p className="text-red-600">Error: {error}</p>;

  return (
    <div className="p-6 bg-white rounded-lg shadow-md">
      <h2 className="text-xl font-semibold mb-4">Billing & Reminder Settings</h2>
      <p className="text-sm text-gray-500 mb-6">
        Manage email templates and reminder days. Use placeholders like:
        <code> {{name}}, {{month}}, {{amount}}, {{due_date}} </code>
      </p>

      {settings.map((s) => (
        <div key={s.id} className="mb-6">
          <label className="block font-medium mb-1">{s.setting_key}</label>
          <textarea
            defaultValue={s.setting_value}
            rows={s.setting_value.length > 60 ? 4 : 2}
            className="w-full border rounded-md p-2 text-sm"
            onBlur={(e) => saveSetting(s.id, e.target.value)}
          />
        </div>
      ))}

      {saving && <p className="text-blue-600 text-sm">Saving changes...</p>}
    </div>
  );
}
