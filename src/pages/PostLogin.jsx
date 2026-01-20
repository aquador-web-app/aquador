import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";

export default function PostLogin() {
  const navigate = useNavigate();

  useEffect(() => {
    let isMounted = true;

    async function redirect() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user || !isMounted) {
        navigate("/login", { replace: true });
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

      if (!profile) {
        navigate("/login", { replace: true });
        return;
      }

      switch (profile.role) {
        case "admin":
          navigate("/admin", { replace: true });
          break;
        case "teacher":
          navigate("/teacher", { replace: true });
          break;
        case "assistant":
          navigate("/admin", { replace: true });
          break;
        default:
          navigate("/user", { replace: true });
      }
    }

    redirect();
    return () => {
      isMounted = false;
    };
  }, [navigate]);

  return null; // nothing visible
}
