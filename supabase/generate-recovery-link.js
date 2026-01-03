import { createClient } from "@supabase/supabase-js";

// 🔐 Admin client (SERVICE ROLE)
const supabase = createClient(
  "https://jrwsxeiueezuiueglfpv.supabase.co",
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// 🔴 CHANGE THIS
const userId = "94dbd843-ff41-45f8-bffb-6b0b37400158";
const email = "aquadorecoledenatation@outlook.com";

async function run() {
  const { data, error } = await supabase.auth.admin.generateLink({
    type: "recovery",
    user_id: userId,
    email: email,
    redirectTo: "http://localhost:5173",
  });

  if (error) {
    console.error("❌ Error generating recovery link:", error.message);
    process.exit(1);
  }

  console.log("🔗 OPEN THIS LINK IN YOUR BROWSER:");
  console.log(data.properties.action_link);
}

run();
