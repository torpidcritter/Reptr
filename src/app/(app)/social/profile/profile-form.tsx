"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import type { ProfileInput } from "@/modules/social/social";
import { saveProfileAction, type ProfileFormState } from "../actions";

/** Handle, bio and who can see you. */
export function ProfileForm({ initial, isNew }: { initial: ProfileInput; isNew: boolean }) {
  const [state, save, saving] = useActionState<ProfileFormState, FormData>(saveProfileAction, {
    values: initial,
  });
  const v = state.values ?? initial;
  return (
    <form action={save} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="handle" className="text-sm font-medium">
          Handle
        </label>
        <div className="flex items-center gap-1">
          <span className="text-muted-foreground" aria-hidden>
            @
          </span>
          <Input
            id="handle"
            name="handle"
            defaultValue={v.handle}
            required
            minLength={3}
            maxLength={20}
            pattern="[A-Za-z0-9_]{3,20}"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            aria-describedby="handle-help"
          />
        </div>
        <p id="handle-help" className="text-muted-foreground text-xs">
          3 to 20 letters, numbers or underscores. People find you by it.
        </p>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="bio" className="text-sm font-medium">
          Bio (optional)
        </label>
        <Textarea id="bio" name="bio" defaultValue={v.bio} maxLength={160} rows={2} />
      </div>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">Who can see your workouts</legend>
        <label className="flex items-start gap-3 rounded-xl border p-3">
          <input
            type="radio"
            name="visibility"
            value="private"
            defaultChecked={v.visibility !== "public"}
            className="mt-1"
          />
          <span>
            <span className="block font-medium">Private</span>
            <span className="text-muted-foreground text-sm">
              Only followers you approve see what you share.
            </span>
          </span>
        </label>
        <label className="flex items-start gap-3 rounded-xl border p-3">
          <input
            type="radio"
            name="visibility"
            value="public"
            defaultChecked={v.visibility === "public"}
            className="mt-1"
          />
          <span>
            <span className="block font-medium">Public</span>
            <span className="text-muted-foreground text-sm">
              Anyone signed in can follow you and see posts you share publicly. Pending requests are
              accepted.
            </span>
          </span>
        </label>
      </fieldset>
      <label className="flex items-center gap-3">
        <input type="checkbox" name="discoverable" defaultChecked={v.discoverable !== false} />
        <span className="text-sm">Show me in search and suggestions</span>
      </label>
      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          name="leaderboards"
          defaultChecked={v.leaderboards !== false}
          className="mt-1"
        />
        <span className="text-sm">
          Show me on leaderboards
          <span className="text-muted-foreground block text-xs">
            Your workout count, volume, sets, time, XP, streak and best lifts, to people who can see
            your profile. Challenges you join show your score to the other people in them.
          </span>
        </span>
      </label>
      <p className="text-muted-foreground text-xs">
        Your name comes from your account settings. Your birth date, height, body measurements,
        photos and nutrition are never shown to anyone.
      </p>
      {state.error && (
        <p role="alert" className="text-danger text-sm">
          {state.error}
        </p>
      )}
      {state.ok && (
        <p role="status" className="text-sm">
          Saved.
        </p>
      )}
      <Button type="submit" disabled={saving}>
        {saving ? "Saving…" : isNew ? "Create profile" : "Save"}
      </Button>
    </form>
  );
}
