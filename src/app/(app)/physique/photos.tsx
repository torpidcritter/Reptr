"use client";

import { Camera, Trash2 } from "lucide-react";
import { useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { photoBucket } from "@/modules/body/metrics";
import { addPhotoAction, deletePhotoAction } from "./actions";
import { useConfirm } from "@/components/ui/confirm";

export type Photo = { id: string; pose: string; takenOn: string; url: string | null };

/** Shrinks a photo to at most 1600px on the long side as JPEG, and drops its metadata (GPS etc.). */
async function shrink(file: File): Promise<Blob> {
  const img = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(img.width, img.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
  return new Promise((res, rej) =>
    canvas.toBlob(
      (b) => (b ? res(b) : rej(new Error("Couldn't read that image"))),
      "image/jpeg",
      0.85,
    ),
  );
}

const today = () => new Date().toLocaleDateString("en-CA");
const fmt = (d: string) =>
  new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${d}T00:00:00Z`));

export function Photos({
  userId,
  photos,
  enabled,
}: {
  userId: string;
  photos: Photo[];
  enabled: boolean;
}) {
  const ask = useConfirm();
  const input = useRef<HTMLInputElement>(null);
  const [pose, setPose] = useState("front");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [compare, setCompare] = useState<string[]>([]);

  const upload = (file: File) =>
    start(async () => {
      try {
        setError(null);
        const blob = await shrink(file);
        const path = `${userId}/${crypto.randomUUID()}.jpg`;
        const { error: upErr } = await createSupabaseBrowserClient()
          .storage.from(photoBucket)
          .upload(path, blob, { contentType: "image/jpeg" });
        if (upErr) throw upErr;
        const res = await addPhotoAction({ pose, takenOn: today(), storagePath: path });
        if (res.error) throw new Error(res.error);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Upload failed");
      }
    });

  const toggle = (id: string) =>
    setCompare((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id].slice(-2)));
  const pair = compare.map((id) => photos.find((p) => p.id === id)).filter(Boolean) as Photo[];

  if (!enabled) {
    return (
      <p className="text-muted-foreground text-sm">
        Progress photos are stored privately in Supabase Storage. Connect your Supabase project to
        turn them on.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={pose}
          onChange={(e) => setPose(e.target.value)}
          className="w-28"
          aria-label="Pose"
        >
          <option value="front">Front</option>
          <option value="side">Side</option>
          <option value="back">Back</option>
        </Select>
        <Button type="button" onClick={() => input.current?.click()} disabled={pending}>
          <Camera /> {pending ? "Uploading…" : "Add photo"}
        </Button>
        <input
          ref={input}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) upload(f);
            e.target.value = "";
          }}
        />
        {error && <p className="text-danger text-sm">{error}</p>}
      </div>
      <p className="text-muted-foreground text-xs">
        Only you can see these. Photos are resized on your device and their location data is removed
        before upload. Tap two photos to compare them.
      </p>

      {pair.length === 2 && (
        <div className="grid grid-cols-2 gap-2">
          {pair
            .sort((a, b) => (a.takenOn < b.takenOn ? -1 : 1))
            .map((p) => (
              <figure key={p.id}>
                {p.url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={p.url}
                    alt={`${p.pose} on ${fmt(p.takenOn)}`}
                    className="aspect-[3/4] w-full rounded-lg object-cover"
                  />
                )}
                <figcaption className="text-muted-foreground mt-1 text-xs">
                  {fmt(p.takenOn)} · {p.pose}
                </figcaption>
              </figure>
            ))}
        </div>
      )}

      {photos.length ? (
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
          {photos.map((p) => (
            <li key={p.id} className="group relative">
              <button
                type="button"
                onClick={() => toggle(p.id)}
                aria-pressed={compare.includes(p.id)}
                className="block w-full overflow-hidden rounded-lg outline-offset-2 aria-pressed:outline-2 aria-pressed:outline-[var(--accent)]"
              >
                {p.url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={p.url}
                    alt={`${p.pose} on ${fmt(p.takenOn)}`}
                    className="aspect-[3/4] w-full object-cover"
                  />
                ) : (
                  <div className="bg-muted aspect-[3/4] w-full" />
                )}
              </button>
              <div className="text-muted-foreground mt-1 flex items-center justify-between text-xs">
                <span>
                  {fmt(p.takenOn)} · {p.pose}
                </span>
                <button
                  type="button"
                  aria-label="Delete photo"
                  className="hover:text-danger"
                  onClick={async () => {
                    if (
                      await ask({
                        title: "Delete this photo for good?",
                        confirm: "Delete",
                        danger: true,
                      })
                    )
                      start(() => deletePhotoAction(p.id));
                  }}
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground text-sm">No photos yet.</p>
      )}
    </div>
  );
}
