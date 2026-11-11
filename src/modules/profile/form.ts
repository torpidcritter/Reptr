import { z } from "zod";
import { ProfileError } from "./identity";

// Shared by the create-profile and edit-profile forms.

export type IdentityFields = {
  displayName: string;
  username: string;
  contactEmail: string;
  bio: string;
};

export type IdentityFormState = {
  ok?: boolean;
  error?: string;
  errors?: Partial<Record<keyof IdentityFields, string>>;
  values?: IdentityFields;
};

export const fieldsFrom = (form: FormData): IdentityFields => ({
  displayName: String(form.get("displayName") ?? ""),
  username: String(form.get("username") ?? ""),
  contactEmail: String(form.get("contactEmail") ?? ""),
  bio: String(form.get("bio") ?? ""),
});

/** Field-by-field messages for the form, from a validation or uniqueness failure. */
export function formErrors(e: unknown): IdentityFormState | null {
  if (e instanceof z.ZodError) {
    const errors: IdentityFormState["errors"] = {};
    for (const issue of e.issues) {
      const key = issue.path[0] as keyof IdentityFields;
      errors[key] ??= issue.message;
    }
    return { errors };
  }
  if (e instanceof ProfileError) {
    return e.field && e.field !== "key"
      ? { errors: { [e.field]: e.message } }
      : { error: e.message };
  }
  return null;
}
