import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { createAdminClient } from "@supabase/server/core";

const supabaseUrl = process.env.SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY;
if (!supabaseUrl || !secretKey) {
  throw new Error("Set SUPABASE_URL and the full SUPABASE_SECRET_KEY in .env.local first.");
}

const projectRef = new URL(supabaseUrl).hostname.split(".")[0];
const supabaseAdmin = createAdminClient();
const perPage = 1000;
const users = [];

for (let page = 1; ; page++) {
  const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });
  if (error) throw new Error(`Could not list users: ${error.message}`);
  users.push(...data.users.map((user) => user.id));
  if (data.users.length < perPage) break;
}

if (users.length === 0) {
  console.log(`No accounts found in Supabase project ${projectRef}.`);
  process.exit(0);
}

const expectedConfirmation = `DELETE ALL ${projectRef}`;
console.log(`This will permanently delete ${users.length} Supabase accounts from project ${projectRef}.`);
console.log("Related profiles and video progress will be deleted by database cascades where configured.");
const terminal = createInterface({ input: stdin, output: stdout });
const confirmation = await terminal.question(`Type "${expectedConfirmation}" to continue: `);
terminal.close();

if (confirmation !== expectedConfirmation) {
  console.log("Confirmation did not match. No accounts were deleted.");
  process.exit(0);
}

let deleted = 0;
const failures = [];
for (const userId of users) {
  const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
  if (error) failures.push({ userId, message: error.message });
  else deleted++;
}

console.log(`Deleted ${deleted} of ${users.length} accounts.`);
if (failures.length > 0) {
  console.error(`${failures.length} accounts could not be deleted.`);
  process.exitCode = 1;
}
