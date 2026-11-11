import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Profiles have no Supabase sign-in, so photo storage is reached by the server with the
// project's service key. The server only ever touches paths inside the current
// profile's own folder ("<user id>/…"); see storage.ts and the actions that call it.
// The key never reaches the browser: uploads use one-time signed upload links.

let client: SupabaseClient | null = null;

export const storageConfigured = () =>
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);

export function storageAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Photo storage needs SUPABASE_SERVICE_ROLE_KEY.");
  client ??= createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return client;
}
