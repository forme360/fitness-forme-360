import { createBrowserClient } from "@supabase/ssr";
export function createClient() {
  // Prefer the explicitly configured Forme360 project. The generic variables
  // remain as a local-development fallback for existing .env.local setups.
  const url = process.env.NEXT_PUBLIC_FORME360_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_FORME360_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createBrowserClient(url, key);
}
