// supabase/functions/send-push/index.ts
// @ts-nocheck

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ONESIGNAL_APP_ID = Deno.env.get("ONESIGNAL_APP_ID");
const ONESIGNAL_API_KEY = Deno.env.get("ONESIGNAL_API_KEY");

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } }
);

serve(async (req) => {
  try {
    const payload = await req.json();
    const notification = payload.record;

    if (!notification?.id) {
      return new Response("No notification", { status: 200 });
    }

    // Skip if already pushed
    if (notification.push_sent_at) {
      return new Response("Already sent", { status: 200 });
    }

    const title = "A'QUA D'OR";
    const message = notification.text;

    // 🎯 TARGETING
    const DEFAULT_ADMIN_IDS = [
  "5c654666-0607-4163-92dd-86d84dcb0b1a",
  "c301ae24-84eb-4254-a61d-dc8e19efb52f",
];

let target: any = {};

if (notification.user_id) {
  // 👤 Push to specific user
  target = {
    include_external_user_ids: [notification.user_id],
  };
} else {
  // 🚨 Fallback: send to ALL default admins
  target = {
    include_external_user_ids: DEFAULT_ADMIN_IDS,
  };
}



    // 📡 SEND TO ONESIGNAL
    const res = await fetch("https://onesignal.com/api/v1/notifications", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${ONESIGNAL_API_KEY}`,
      },
      body: JSON.stringify({
  app_id: ONESIGNAL_APP_ID,

  // ✅ UNIQUE → do NOT replace
  collapse_id: notification.id,

  // ✅ GROUPING → stack visually
  android_group: "aquador_notifications",
  ios_thread_id: "aquador_notifications",

  headings: { en: title },
  contents: { en: message },
  ...target,

  data: {
    notification_id: notification.id,
    category: notification.category,
  },
}),

    });

    const result = await res.json();
console.log("📡 OneSignal response:", result);

if (!res.ok || !result.recipients || result.recipients === 0) {
  console.error("❌ Push not delivered", result);
  return new Response("Push not delivered", { status: 200 });
}

// ✅ Mark as sent ONLY if delivered
await supabase
  .from("notifications")
  .update({ push_sent_at: new Date().toISOString() })
  .eq("id", notification.id);


    return new Response("Push sent", { status: 200 });
  } catch (err) {
    console.error("❌ send-push error:", err);
    return new Response("Error", { status: 500 });
  }
});
