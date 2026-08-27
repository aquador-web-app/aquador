// supabase/functions/admin-delete-user/index.ts
// @ts-nocheck

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl =
  Deno.env.get("PROJECT_URL") ||
  Deno.env.get("SUPABASE_URL");

const supabaseServiceKey =
  Deno.env.get("FUNCTION_ROLE_KEY") ||
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

const supabaseAnonKey =
  Deno.env.get("SUPABASE_ANON_KEY");

if (!supabaseUrl) {
  throw new Error("Missing SUPABASE_URL / PROJECT_URL");
}

if (!supabaseServiceKey) {
  throw new Error(
    "Missing FUNCTION_ROLE_KEY / SUPABASE_SERVICE_ROLE_KEY"
  );
}

if (!supabaseAnonKey) {
  throw new Error("Missing SUPABASE_ANON_KEY");
}

const adminSupabase = createClient(
  supabaseUrl,
  supabaseServiceKey,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders,
    });
  }

  if (req.method !== "POST") {
    return jsonResponse(
      { error: "Method not allowed" },
      405
    );
  }

  try {
    // =========================================================
    // VERIFY CALLER
    // =========================================================

    const authHeader =
      req.headers.get("Authorization");

    if (!authHeader) {
      return jsonResponse(
        { error: "Missing authorization header" },
        401
      );
    }

    const userSupabase = createClient(
      supabaseUrl,
      supabaseAnonKey,
      {
        global: {
          headers: {
            Authorization: authHeader,
          },
        },
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    const {
      data: { user: caller },
      error: callerError,
    } = await userSupabase.auth.getUser();

    if (callerError || !caller) {
      console.error(
        "❌ Invalid admin session:",
        callerError
      );

      return jsonResponse(
        { error: "Invalid session" },
        401
      );
    }

    // =========================================================
    // VERIFY ADMIN ROLE
    // =========================================================

    const {
      data: callerProfile,
      error: profileError,
    } = await adminSupabase
      .from("profiles")
      .select("id, role")
      .eq("id", caller.id)
      .maybeSingle();

    if (profileError) {
      throw profileError;
    }

    if (
      !callerProfile ||
      callerProfile.role !== "admin"
    ) {
      console.warn(
        "⛔ Non-admin attempted user deletion:",
        caller.id
      );

      return jsonResponse(
        { error: "Admin access required" },
        403
      );
    }

    // =========================================================
    // TARGET USER
    // =========================================================

    const body = await req.json();

    const userId =
      body?.user_id ||
      body?.userId ||
      null;

    if (!userId) {
      return jsonResponse(
        { error: "user_id is required" },
        400
      );
    }

    // Prevent accidental self-deletion
    if (userId === caller.id) {
      return jsonResponse(
        {
          error:
            "You cannot delete your own administrator account.",
        },
        400
      );
    }

    // =========================================================
    // CHECK TARGET EXISTS
    // =========================================================

    const {
      data: targetProfile,
      error: targetProfileError,
    } = await adminSupabase
      .from("profiles")
      .select("id, full_name, email")
      .eq("id", userId)
      .maybeSingle();

    if (targetProfileError) {
      throw targetProfileError;
    }

    console.log(
      "🗑️ Admin deleting user:",
      userId,
      targetProfile?.full_name ||
        targetProfile?.email ||
        "Unknown"
    );

    // =========================================================
    // DELETE AUTH USER
    // =========================================================
    //
    // This is the server-side equivalent of what you currently
    // do manually with:
    //
    // DELETE FROM auth.users WHERE ...
    //
    // Your existing FK/cascade behavior will continue to apply.
    // =========================================================

    const {
      data: deletedUser,
      error: deleteError,
    } = await adminSupabase.auth.admin.deleteUser(
      userId
    );

    if (deleteError) {
      console.error(
        "❌ Auth deletion failed:",
        deleteError
      );

      throw deleteError;
    }

    console.log(
      "✅ User deleted:",
      userId
    );

    return jsonResponse({
      success: true,
      user_id: userId,
      deleted_user:
        deletedUser?.user?.email || null,
    });
  } catch (err) {
    console.error(
      "🔥 admin-delete-user failed:",
      err
    );

    return jsonResponse(
      {
        error:
          err?.message ||
          String(err),
      },
      500
    );
  }
});