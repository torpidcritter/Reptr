"use client";

import { Camera, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { avatarUploadAction, setAvatarAction } from "@/app/(app)/profile/identity-actions";
import { Avatar } from "@/components/social/avatar";
import { Button } from "@/components/ui/button";
import { shrinkImage } from "@/lib/images";
import { uploadToLink } from "@/lib/upload";
import { avatarBucket } from "@/modules/social/avatars";

/** Shrinks a picture, uploads it to the profile's own folder and makes it the picture. */
export async function uploadAvatar(file: File) {
  const blob = await shrinkImage(file, 400, 0.85);
  const link = await avatarUploadAction();
  if ("error" in link) throw new Error(link.error);
  await uploadToLink(avatarBucket, link, blob);
  const res = await setAvatarAction(link.path);
  if (res.error) throw new Error(res.error);
}

export const ACCEPT = "image/jpeg,image/png,image/webp";

/** The profile picture with change and remove buttons (saved straight away). */
export function AvatarPicker({
  name,
  handle,
  url,
  enabled,
}: {
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
        await uploadAvatar(file);
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
            accept={ACCEPT}
            className="hidden"
            aria-label="Profile picture"
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
        <p className="text-muted-foreground text-sm">Profile pictures aren&apos;t available yet.</p>
      )}
    </div>
  );
}
