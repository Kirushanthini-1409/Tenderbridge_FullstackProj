// ─────────────────────────────────────────────────────────────────────────────
// TenderBridge – shared Supabase client (Member 1)
//
// Fill in SUPABASE_URL and SUPABASE_ANON_KEY from your Supabase project:
//   Supabase dashboard → Project Settings → API
//
// SUPABASE_URL      – the project URL, e.g. https://abcxyz.supabase.co
// SUPABASE_ANON_KEY – the "anon / public" key (safe to ship to the browser)
//
// NEVER put the service_role key here. It must stay server-side only.
// ─────────────────────────────────────────────────────────────────────────────

const SUPABASE_URL      = 'https://hgvkbmryuvlgpirxzelj.supabase.co';       // ← replace
const SUPABASE_ANON_KEY = 'sb_publishable_nh_aToHliqcZpQfsfmfm6w_0UyjnGLx'; // ← replace

// ── Guard: do not call createClient until real values are filled in ───────────
// When the placeholders are still present, createClient() throws an
// "supabaseUrl is required" / "Invalid URL" error which crashes this script
// before window.tbSupabase is ever assigned.  Catching that here means:
//   • The test page shows a clear "not configured" message (test 0) instead
//     of an opaque "window.tbSupabase is undefined" error.
//   • tenderbridge.js getSB() returns null and shows its own warning.
//   • All other pages continue to render in demo/mock mode.
// ─────────────────────────────────────────────────────────────────────────────
const isConfigured =
  typeof SUPABASE_URL === 'string' &&
  SUPABASE_URL.startsWith('https://') &&
  typeof SUPABASE_ANON_KEY === 'string' &&
  SUPABASE_ANON_KEY.length > 20 &&
  !SUPABASE_URL.includes('YOUR_') &&
  !SUPABASE_ANON_KEY.includes('YOUR_');

if (isConfigured) {
  // The Supabase JS SDK is loaded from CDN in each HTML file *before* this
  // script, so window.supabase (the UMD global) is already available here.
  const { createClient } = window.supabase;
  window.tbSupabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
} else {
  window.tbSupabase = null;
  console.warn(
    '[TenderBridge] Supabase is not configured.\n' +
    'Open member1/assets/supabase.js and replace the two placeholder values:\n' +
    '  SUPABASE_URL      ← your project URL (Settings → API → Project URL)\n' +
    '  SUPABASE_ANON_KEY ← your anon/public key (Settings → API → Project API keys)'
  );
}
