"use client";

import { Camera, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { Avatar } from "@/components/social/avatar";
import { Button } from "@/components/ui/button";
import { shrinkImage } from "@/lib/images";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { avatarBucket, avatarPath } from "@/modules/social/avatars";
import { setAvatarAction } from "../actions";

/** Uploads a profile picture to the person's own folder, then points the profile at it. */
export function AvatarPicker({
  userId,
  name,
  handle,
  url,
  enabled,
}: {
  userId: string;
  name: string | null;
  handle: string;
  url: string | null;
  enabled: boolean;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const upload = (file: File) =>
    start(async () => {
      setError(null);
      try {
        const blob = await shrinkImage(file, 400, 0.85);
        const path = avatarPath(userId, crypto.randomUUID());
        const { error: upErr } = await createSupabaseBrowserClient()
          .storage.from(avatarBucket)
          .upload(path, blob, { contentType: "image/jpeg" });
        if (upErr) throw upErr;
        const res = await setAvatarAction(path);
        if (res.error) throw new Error(res.error);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Upload failed");
      }
    });

  const clear = () =>
    start(async () => {
      const res = await setAvatarAction(null);
      if (res.error) setError(res.error);
      router.refresh();
    });

  return (
    <div className="flex items-center gap-4">
      <Avatar name={name} handle={handle} url={url} size="lg" />
      {enabled ? (
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => input.current?.click()}
              disabled={pending}
            >
              <Camera /> {pending ? "Uploading…" : url ? "Change picture" : "Add picture"}
            </Button>
            {url && (
              <Button
                size="sm"
                variant="ghost"
                onClick={clear}
                disabled={pending}
                aria-label="Remove picture"
              >
                <Trash2 />
              </Button>
            )}
          </div>
          <input
            ref={input}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) upload(f);
              e.target.value = "";
            }}
          />
          {error && (
            <p role="alert" className="text-danger text-sm">
              {error}
            </p>
          )}
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">Profile pictures need Supabase storage.</p>
      )}
    </div>
  );
}
