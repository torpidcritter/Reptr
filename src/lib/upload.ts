import { createSupabaseBrowserClient } from "@/lib/supabase/client";

/** Sends a file to a one-time upload link the server made (see signedUpload). */
export async function uploadToLink(
  bucket: string,
  link: { path: string; token: string },
  blob: Blob,
) {
  const { error } = await createSupabaseBrowserClient()
    .storage.from(bucket)
    .uploadToSignedUrl(link.path, link.token, blob, { contentType: "image/jpeg" });
  if (error) throw new Error("The picture couldn't be uploaded. Try again.");
}
