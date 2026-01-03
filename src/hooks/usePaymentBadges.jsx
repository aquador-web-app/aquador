import { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";

export function useBillingData() {
  const [badges, setBadges] = useState([]);
  const [dueInvoices, setDueInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);

      // Fetch payment badges
      const { data: badgeData, error: badgeError } = await supabase
        .from("payment_badge")
        .select("user_id, has_unpaid, show_red");

      // Fetch due invoices
      const { data: dueData, error: dueError } = await supabase
        .from("due_invoices")
        .select("user_id, balance_due, due_date");

      if (badgeError || dueError) {
        setError(badgeError?.message || dueError?.message);
      } else {
        setBadges(badgeData || []);
        setDueInvoices(dueData || []);
      }

      setLoading(false);
    };

    fetchData();
  }, []);

  return { badges, dueInvoices, loading, error };
}
