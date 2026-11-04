export function supabaseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      "Supabase isn't configured. Copy .env.example to .env.local and add your project's URL and anon key.",
    );
  }
  return { url, anonKey };
}
