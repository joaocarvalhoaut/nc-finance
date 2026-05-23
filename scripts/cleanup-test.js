import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

const envPath = join(process.cwd(), ".env");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf-8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq < 1) continue;
    const k = t.slice(0, eq).trim();
    const v = t.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (k && !process.env[k]) process.env[k] = v;
  }
}

const admin = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data: { users } } = await admin.auth.admin.listUsers();
const testUser = users.find(u => u.email === process.env.TEST_USER_EMAIL);
if (!testUser) { console.log("user not found"); process.exit(1); }
const uid = testUser.id;

await admin.from("user_registros_financeiros").delete().eq("user_id", uid);
await admin.from("user_drive_index").delete().eq("user_id", uid);
await admin.from("user_drive_folders").delete().eq("user_id", uid);
await admin.from("user_subscriptions").delete().eq("user_id", uid);
console.log("cleanup OK — user:", uid.slice(0, 8));
