import { createClient } from "@supabase/supabase-js";

// 🔐 CREATE ADMIN CLIENT (SERVICE ROLE)
const supabase = createClient(
  "https://jrwsxeiueezuiueglfpv.supabase.co",
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// 🔴 CHANGE THESE TWO VALUES
const userId = "b9972268-95d5-4f12-8d21-e85e3a08567a";
const newPassword = "djaffey";

async function run() {
  const { error } = await supabase.auth.admin.updateUserById(userId, {
    password: newPassword,
  });

  if (error) {
    console.error("❌ Error resetting password:", error.message);
    process.exit(1);
  }

  console.log("✅ Password successfully updated");
}

run();
