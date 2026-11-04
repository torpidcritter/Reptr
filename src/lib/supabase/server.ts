import "server-only";
import { createServerClient } from "@supabase/ssr";
import { supabaseEnv } from "./env";
import { cookies } from "next/headers";

/** Supabase client for Server Components, Server Actions and Route Handlers. */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  return createServerClient(supabaseEnv().url, supabaseEnv().anonKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (cookiesToSet) => {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component, where cookies are read-only. The proxy refreshes them.
        }
      },
    },
  });
}
