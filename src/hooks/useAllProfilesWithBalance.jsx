import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient"; // adjust path if needed

export function useAllProfilesWithBalance() {
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchProfiles = async () => {
      setLoading(true);
      setError(null);

      try {
        const { data, error: dbError } = await supabase
          .from("profile_with_balance")
          .select("*")
          .order("first_name", { ascending: true }); // sort alphabetically

        if (dbError) throw dbError;

        setProfiles(data);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchProfiles();
  }, []);

  return { profiles, loading, error };
}
