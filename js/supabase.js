/* ============================================================
   SUPABASE.JS — Client initialization + auth state
   ============================================================ */

const SUPABASE_URL = 'https://xqwamtpyjvapiydplcqf.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhxd2FtdHB5anZhcGl5ZHBsY3FmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2ODg3NzUsImV4cCI6MjA5MTI2NDc3NX0.LXqc43WJkZhdTEEIjnl7AAaqNGXISHlG87mkI7jon5k';

// Initialize Supabase client (CDN expone window.supabase)
if (!window.supabase || typeof window.supabase.createClient !== 'function') {
  document.body.innerHTML = `<div style="color:#ef4444;padding:40px;font-family:monospace;background:#0d0d0d;min-height:100vh">
    <h2>Error: Supabase CDN no cargó</h2>
    <p>Verifica tu conexión a internet. El script de Supabase no se pudo obtener de unpkg.com.</p>
    <p style="color:#606060;font-size:12px">window.supabase = ${JSON.stringify(window.supabase)}</p>
  </div>`;
  throw new Error('Supabase CDN not loaded');
}
const { createClient } = window.supabase;
const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
console.log('[Kiubii] Supabase client initialized ✓', SUPABASE_URL);

// ---- Auth state ----
let currentUser    = null;   // auth.User
let currentProfile = null;   // profiles row { id, name, role }

function isAdmin() {
  return currentProfile?.role?.toLowerCase() === 'admin';
}

function getUserName() {
  return currentProfile?.name || currentUser?.email || '—';
}

// ---- Load profile for the logged-in user ----
async function loadCurrentProfile() {
  if (!currentUser) return null;
  const { data, error } = await sb
    .from('profiles')
    .select('*')
    .eq('id', currentUser.id)
    .single();
  if (error) {
    console.error('[Kiubii] Error loading profile:', error.message);
    // Profile might not exist yet (user created before trigger)
    return null;
  }
  if (data?.disabled) {
    // User exists but is disabled — sign out immediately
    await sb.auth.signOut();
    currentUser = null;
    currentProfile = null;
    throw new Error('Tu cuenta está desactivada. Contacta al administrador.');
  }
  currentProfile = data;
  console.log('[Kiubii] Profile loaded:', { id: data.id, role: data.role, name: data.name });
  return data;
}

// ---- Get current session (called on app boot) ----
async function getSession() {
  const { data: { session } } = await sb.auth.getSession();
  if (session?.user) {
    currentUser = session.user;
    await loadCurrentProfile();
  }
  return session;
}

// ---- Sign in with email/password ----
async function signIn(email, password) {
  console.log('[Kiubii] signInWithPassword →', email);
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) {
    // Log completo para diagnóstico en consola
    console.error('[Kiubii] Auth error:', {
      message: error.message,
      status:  error.status,
      code:    error.code,
      full:    error,
    });
    throw error; // lanzamos el objeto completo, no solo el mensaje
  }
  console.log('[Kiubii] Login OK, user:', data.user?.id);
  currentUser = data.user;
  await loadCurrentProfile();
  console.log('[Kiubii] Profile:', currentProfile);
  return data;
}

// ---- Sign out ----
async function signOut() {
  await sb.auth.signOut();
  currentUser = null;
  currentProfile = null;
}

// ---- Auth state change listener ----
sb.auth.onAuthStateChange(async (event, session) => {
  if (event === 'SIGNED_OUT') {
    currentUser = null;
    currentProfile = null;
  }
});
