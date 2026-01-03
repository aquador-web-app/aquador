import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient"; // adjust path to your setup

export function useUserProfileWithBalance(userId) {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!userId) return; // do nothing if no userId is provided

    const fetchProfile = async () => {
      setLoading(true);
      setError(null);

      try {
        const { data, error: dbError } = await supabase
          .from("profile_with_balance")
          .select("*")
          .eq("user_id", userId)
          .single();

        if (dbError) throw dbError;

        setProfile(data);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, [userId]); // refetch if userId changes

  return { profile, loading, error };
}
