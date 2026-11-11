"use client";

import { Camera, Check, Copy } from "lucide-react";
import { useActionState, useEffect, useRef, useState } from "react";
import { ACCEPT, uploadAvatar } from "@/components/profile/avatar-picker";
import { IdentityFields } from "@/components/profile/identity-fields";
import { Avatar } from "@/components/social/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  checkUsernameAction,
  continueAction,
  createProfileAction,
  openProfileAction,
  type CreateState,
  type OpenState,
} from "./actions";

/** Shows the profile key once, with a copy button. */
export function ProfileKey({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="bg-muted flex flex-col gap-2 rounded-xl p-3">
      <code className="font-mono text-sm break-all" data-testid="profile-key">
        {value}
      </code>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="self-start"
        onClick={async () => {
          await navigator.clipboard?.writeText(value).catch(() => {});
          setCopied(true);
        }}
      >
        {copied ? <Check /> : <Copy />} {copied ? "Copied" : "Copy key"}
      </Button>
    </div>
  );
}

type Picked = { file: File; url: string } | null;

function PicturePicker({
  picked,
  setFile,
  name,
}: {
  picked: Picked;
  setFile: (f: File | null) => void;
  name: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const file = picked?.file;
  return (
    <div className="flex items-center gap-4">
      <Avatar name={name || null} handle="?" url={picked?.url} size="lg" />
      <div className="flex flex-col gap-1">
        <Button type="button" size="sm" variant="outline" onClick={() => input.current?.click()}>
          <Camera /> {file ? "Change picture" : "Add a picture (optional)"}
        </Button>
        {file && (
          <Button type="button" size="sm" variant="ghost" onClick={() => setFile(null)}>
            Remove
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
          if (f) setFile(f);
          e.target.value = "";
        }}
      />
    </div>
  );
}

function Created({
  created,
  picked,
}: {
  created: NonNullable<CreateState["created"]>;
  picked: Picked;
}) {
  const [picture, setPicture] = useState<"none" | "uploading" | "done" | "failed">(
    picked ? "uploading" : "none",
  );
  const preview = picked?.url ?? null;
  const started = useRef(false);
  useEffect(() => {
    if (!picked || started.current) return;
    started.current = true;
    uploadAvatar(picked.file)
      .then(() => setPicture("done"))
      .catch(() => setPicture("failed"));
  }, [picked]);

  return (
    <div className="flex flex-col gap-5" role="status">
      <div className="flex items-center gap-4">
        <Avatar name={created.displayName} handle={created.username} url={preview} size="lg" />
        <div>
          <p className="text-accent flex items-center gap-1 text-sm font-medium">
            <Check className="size-4" /> Profile created
          </p>
          <p className="text-lg font-semibold">{created.displayName}</p>
          <p className="text-muted-foreground">@{created.username}</p>
        </div>
      </div>
      {picture === "uploading" && (
        <p className="text-muted-foreground text-sm">Uploading your picture…</p>
      )}
      {picture === "failed" && (
        <p className="text-danger text-sm">
          Your picture couldn&apos;t be uploaded. You can add it later in Profile.
        </p>
      )}
      {created.key && (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium">Your profile key</p>
          <p className="text-muted-foreground text-sm">
            This browser now remembers you. To open your profile on another device, or if this
            browser&apos;s data is cleared, you&apos;ll need this key. Keep it somewhere safe, like
            a password manager. Anyone with it can open your profile.
          </p>
          <ProfileKey value={created.key} />
        </div>
      )}
      <form action={continueAction} className="flex flex-col">
        <Button type="submit" size="lg" disabled={picture === "uploading"}>
          Continue
        </Button>
      </form>
    </div>
  );
}

/** "Let's create your profile." */
export function CreateProfileForm({
  initial,
  finishing,
}: {
  initial?: { displayName?: string };
  finishing: boolean;
}) {
  const [state, action, pending] = useActionState<CreateState, FormData>(createProfileAction, {});
  const [picked, setPicked] = useState<Picked>(null);
  const setFile = (f: File | null) =>
    setPicked((old) => {
      if (old) URL.revokeObjectURL(old.url);
      return f ? { file: f, url: URL.createObjectURL(f) } : null;
    });
  const [name, setName] = useState(initial?.displayName ?? "");

  if (state.created) {
    return (
      <Card className="p-5">
        <Created created={state.created} picked={picked} />
      </Card>
    );
  }

  return (
    <Card className="p-5">
      <form
        action={action}
        className="flex flex-col gap-5"
        noValidate
        onInput={(e) => {
          const t = e.target as HTMLInputElement;
          if (t.name === "displayName") setName(t.value);
        }}
      >
        <PicturePicker picked={picked} setFile={setFile} name={name} />
        <IdentityFields
          // A fresh set of fields for each answer from the server, showing what was sent.
          key={JSON.stringify(state.values ?? null)}
          initial={state.values ?? initial}
          errors={state.errors}
          checkUsername={checkUsernameAction}
        />
        {state.error && (
          <p role="alert" className="text-danger text-sm">
            {state.error}
          </p>
        )}
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? "Creating…" : finishing ? "Save profile" : "Create Profile"}
        </Button>
      </form>
    </Card>
  );
}

/** For someone who already has a profile: open it here with its key. */
export function OpenProfileForm() {
  const [state, action, pending] = useActionState<OpenState, FormData>(openProfileAction, {});
  return (
    <details className="group">
      <summary className="text-muted-foreground hover:text-foreground cursor-pointer text-sm font-medium">
        Already have a profile? Open it with your profile key
      </summary>
      <form action={action} className="mt-3 flex flex-col gap-2">
        <label htmlFor="key" className="text-sm font-medium">
          Profile key
        </label>
        <Input
          id="key"
          name="key"
          required
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX"
          aria-invalid={Boolean(state.error)}
          className="font-mono"
        />
        {state.error && (
          <p role="alert" className="text-danger text-sm">
            {state.error}
          </p>
        )}
        <Button type="submit" variant="outline" disabled={pending}>
          {pending ? "Opening…" : "Open my profile"}
        </Button>
      </form>
    </details>
  );
}
