import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient"; // adjust to your actual path

export function useProfileWithBalance() {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchProfile = async () => {
      setLoading(true);
      setError(null);

      try {
        // get the currently logged in user
        const {
          data: { user },
          error: authError,
        } = await supabase.auth.getUser();

        if (authError) throw authError;
        if (!user) throw new Error("No logged-in user");

        // query the view
        const { data, error: dbError } = await supabase
          .from("profile_with_balance")
          .select("*")
          .eq("user_id", user.id)
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
  }, []);

  return { profile, loading, error };
}
