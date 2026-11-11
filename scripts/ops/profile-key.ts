/**
 * Gives an account made before profiles (when Reptr had email sign-in) a profile key,
 * so its owner can open it again without signing in.
 *
 *   pnpm ops:profile-key list                 accounts and whether they have a username
 *   pnpm ops:profile-key <email or user id>   prints a new profile key for that account
 *
 * The person enters the key on "Let's create your profile." under "Already have a
 * profile?", then picks a username if they don't have one yet. Making a key replaces any
 * earlier key for that account. Needs DATABASE_URL; it never prints the URL.
 */
import "dotenv/config";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../../src/db/schema";
import { replaceProfileKey } from "../../src/modules/profile/identity";

async function main() {
  const arg = process.argv[2];
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Set DATABASE_URL (see docs/ops/DEPLOYMENT.md).");
  if (!arg) throw new Error("Usage: pnpm ops:profile-key list | <email or user id>");
  const sql = postgres(url, { max: 1, onnotice: () => {}, prepare: false });
  try {
    if (arg === "list") {
      const rows = await sql`select u.id, u.email, p.username, p.display_name
        from auth.users u left join public.profiles p on p.user_id = u.id
        order by p.created_at nulls last`;
      for (const r of rows)
        console.log(
          `${r.id}  ${r.email ?? "(no email)"}  ${r.username ? "@" + r.username : "(no username)"}  ${r.display_name ?? ""}`,
        );
      return;
    }
    const byId = /^[0-9a-f-]{36}$/i.test(arg);
    const rows = byId
      ? await sql`select id from auth.users where id = ${arg}`
      : await sql`select id from auth.users where lower(email) = lower(${arg})`;
    if (rows.length !== 1) throw new Error(`Found ${rows.length} accounts for that; expected 1.`);
    const key = await replaceProfileKey(drizzle(sql, { schema }), rows[0].id);
    console.log(`Profile key: ${key}`);
    console.log("Give it only to the account's owner. Anyone with it can open the profile.");
  } finally {
    await sql.end();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
