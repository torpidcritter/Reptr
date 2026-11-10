import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// Layers: src/modules holds the domain (plain TypeScript and database queries, no UI
// or framework), src/app and src/components hold the UI. These rules keep imports
// flowing one way, so domain code stays testable and server code never reaches a browser.
const uiAndDevice = [
  { group: ["@/app/*", "@/components/*"], message: "Domain modules can't import UI code." },
  {
    group: ["@/lib/device/*", "@/lib/outbox", "@/lib/workout-store"],
    message: "Domain modules can't import browser-only device code.",
  },
  {
    group: ["next", "next/*", "react", "react-dom"],
    message: "Domain modules stay framework-free.",
  },
];
const serverOnly = [
  "@/db",
  "@/db/index",
  "@/db/with-user",
  "@/lib/auth",
  "@/lib/supabase/server",
].map((name) => ({
  name,
  message: "Server-only: call it from a server action or page, not a component.",
}));

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["src/modules/**/*.ts"],
    ignores: ["src/modules/**/*.test.ts"],
    rules: { "no-restricted-imports": ["error", { patterns: uiAndDevice }] },
  },
  {
    files: [
      "src/components/**/*.tsx",
      "src/lib/device/**/*.ts",
      "src/lib/outbox.ts",
      "src/lib/workout-store.ts",
    ],
    rules: { "no-restricted-imports": ["error", { paths: serverOnly }] },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
