import "server-only";
import { createSupabaseServerClient } from "./server";

/** Photos need Supabase Storage; local dev without Supabase stores none. */
export const storageEnabled = () =>
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

/** Short-lived links to private files. Missing files come back without a URL. */
export async function signedUrls(bucket: string, paths: string[], expiresIn = 3600) {
  if (!paths.length || !storageEnabled()) return new Map<string, string>();
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.storage.from(bucket).createSignedUrls(paths, expiresIn);
  return new Map(
    (data ?? []).filter((d) => d.signedUrl && d.path).map((d) => [d.path!, d.signedUrl]),
  );
}

export async function removeFiles(bucket: string, paths: string[]) {
  if (!paths.length || !storageEnabled()) return;
  const supabase = await createSupabaseServerClient();
  await supabase.storage.from(bucket).remove(paths);
}
