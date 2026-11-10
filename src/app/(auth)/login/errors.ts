// Turns Supabase's sign-in email errors into something a person can act on.

type AuthErrorLike = { code?: string; status?: number; message?: string };

export type MagicLinkFailure = {
  kind: "rate_limited" | "invalid" | "delivery" | "unknown";
  message: string;
};

export function magicLinkError(error: AuthErrorLike): MagicLinkFailure {
  const code = error.code ?? "";
  if (
    code === "over_email_send_rate_limit" ||
    code === "over_request_rate_limit" ||
    error.status === 429
  ) {
    return {
      kind: "rate_limited",
      message: "Too many sign-in emails were sent just now. Wait a few minutes, then try again.",
    };
  }
  if (
    code === "email_address_invalid" ||
    code === "email_address_not_authorized" ||
    code === "validation_failed"
  ) {
    return {
      kind: "invalid",
      message: "That address can't receive sign-in emails. Check it, or try another address.",
    };
  }
  if (code === "unexpected_failure" || (error.status ?? 0) >= 500) {
    return {
      kind: "delivery",
      message: "We couldn't send the email right now. Try again in a few minutes.",
    };
  }
  return { kind: "unknown", message: "Couldn't send the link. Try again in a minute." };
}
