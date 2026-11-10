// Headers sent with every response. The content security policy limits where scripts,
// styles, images and connections may come from, so injected markup can't load code
// from elsewhere or send data out, and no other site can frame Reptr.
//
// Scripts allow 'unsafe-inline' because Next's static and partially prerendered pages
// carry inline bootstrap scripts without a per-request nonce (a nonce would force every
// page to render dynamically). Everything else is locked to this origin and Supabase.

import { isDeployed } from "./env-check";

type Env = Record<string, string | undefined>;

export function contentSecurityPolicy(env: Env, dev = env.NODE_ENV === "development") {
  const supabase = env.NEXT_PUBLIC_SUPABASE_URL ? new URL(env.NEXT_PUBLIC_SUPABASE_URL).origin : "";
  const supabaseWs = supabase.replace(/^http/, "ws");
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": ["'self'", "'unsafe-inline'", ...(dev ? ["'unsafe-eval'"] : [])],
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:", supabase],
    "font-src": ["'self'", "data:"],
    "connect-src": ["'self'", supabase, supabaseWs, ...(dev ? ["ws:"] : [])],
    "worker-src": ["'self'"],
    "manifest-src": ["'self'"],
    "frame-src": ["'none'"],
    "frame-ancestors": ["'none'"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
  };
  const policy = Object.entries(directives)
    .map(([k, v]) => [k, ...v.filter(Boolean)].join(" "))
    .join("; ");
  // Only on a real HTTPS deployment: the laptop install is served over plain HTTP, and
  // may be opened from a phone on the same network.
  return isDeployed(env) ? `${policy}; upgrade-insecure-requests` : policy;
}

export function securityHeaders(env: Env = process.env) {
  const dev = env.NODE_ENV === "development";
  return [
    { key: "Content-Security-Policy", value: contentSecurityPolicy(env, dev) },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    {
      key: "Permissions-Policy",
      value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
    },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
    ...(isDeployed(env)
      ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }]
      : []),
  ];
}
