// ===================== GOOGLE SIGN-IN GATEWAY =====================
// Bridges Google Identity → Supabase Auth → OlongNotes localStorage.
//
// How it works:
//   1. index.html / about.html load the Supabase JS SDK via <script>
//      BEFORE this file, so window.supabase.createClient is available.
//   2. This file exposes signInWithGoogle() on window.OlongNotes.
//   3. script.js wires the Google button click → signInWithGoogle().
//   4. After the OAuth redirect back, initGoogleAuth() (auto-called on
//      every page load) exchanges the auth code for a session and
//      stores it in olongnotes_token / olongnotes_user.
//
// Dependencies (load order in HTML):
//   1. api.js            — window.OlongNotes.api / setToken / clearToken
//   2. supabase.min.js   — window.supabase.createClient
//   3. auth-gateway.js   — this file
//
// Security:
//   The Supabase anon key is fetched from GET /api/config and is safe
//   to use client-side — it's the same key api.js sends on every
//   request. RLS governs what it can do. The service-role key is
//   never exposed.

;(function () {
  'use strict'

  const SUPABASE_STORAGE_KEY = 'sb-' + (location.hostname || 'localhost') + '-auth-token'
  const USER_STORAGE_KEY     = 'olongnotes_user'
  const TOKEN_KEY            = 'olongnotes_token'

  let _supabase    = null    // Supabase client (created once)
  let _initialising = null   // dedup guard — prevents double init

  // ---- Helpers ----

  function setToken(token) {
    try { localStorage.setItem(TOKEN_KEY, token || '') } catch (_) {}
  }
  function clearToken() {
    try { localStorage.removeItem(TOKEN_KEY) } catch (_) {}
  }
  function writeUser(user) {
    try { localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user)) } catch (_) {}
  }

  function normalizeUser(supaUser) {
    if (!supaUser) return null
    const meta = supaUser.user_metadata || {}
    return {
      id:        null,
      auth_id:   supaUser.id,
      username:  meta.full_name || meta.name || (supaUser.email || '').split('@')[0] || 'user',
      role:      meta.role || 'viewer',
      school_id: null,
    }
  }

  async function _readSession() {
    if (!_supabase) return null
    try {
      const { data: { session } } = await _supabase.auth.getSession()
      return session || null
    } catch (_) { return null }
  }

  function _persistSession(session) {
    if (!session || !session.access_token) {
      clearToken()
      try { localStorage.removeItem(USER_STORAGE_KEY) } catch (_) {}
      return
    }
    setToken(session.access_token)
    writeUser(normalizeUser(session.user))
  }

  // ---- Init ----

  async function initGoogleAuth() {
    if (_initialising) return _initialising

    _initialising = (async () => {
      try {
        console.log('[GG] Step 1 — SDK check...')
        const sb = window.supabase
        console.log('[GG] window.supabase:', typeof sb, '| createClient:', typeof (sb && sb.createClient))
        if (!sb || typeof sb.createClient !== 'function') {
          throw new Error('Supabase JS SDK not loaded.')
        }

        console.log('[GG] Step 2 — fetch /api/config...')
        const cfgRes = await fetch('/api/config')
        console.log('[GG] /api/config status:', cfgRes.status)
        if (!cfgRes.ok) throw new Error('Config HTTP ' + cfgRes.status)
        const cfg = await cfgRes.json()
        console.log('[GG] config keys:', Object.keys(cfg).join(', '))
        if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) throw new Error('Config incomplete.')

        console.log('[GG] Step 3 — createClient...')
        _supabase = sb.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
          auth: {
            persistSession:   true,
            autoRefreshToken: true,
            detectSessionInUrl: true,
            storage:          window.localStorage,
            storageKey:       SUPABASE_STORAGE_KEY,
          },
        })
        console.log('[GG] client created:', !!_supabase, '| auth:', !!_supabase.auth)

        // Exchange auth code left in URL after OAuth redirect.
        try {
          if (typeof _supabase.auth.exchangeCodeForSession === 'function') {
            await _supabase.auth.exchangeCodeForSession(window.location.href)
          }
        } catch (_) {}

        const session = await _readSession()
        _persistSession(session)
        console.log('[GG] Init complete. session:', !!session)
        return true
      } catch (err) {
        console.error('[GG] INIT FAILED:', err && err.message, err)
        _initialising = null
        return false
      }
    })()

    return _initialising
  }

  // ---- Public: sign in / sign out ----

  async function signInWithGoogle() {
    if (!_supabase) throw new Error('Google auth not ready — please refresh.')
    const { error } = await _supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin + window.location.pathname,
        queryParams: { prompt: 'select_account' },
      },
    })
    if (error) throw new Error(error.message || 'Google sign-in failed.')
  }

  async function signOutGoogle() {
    if (_supabase) { try { await _supabase.auth.signOut() } catch (_) {} }
    clearToken()
    try { localStorage.removeItem(USER_STORAGE_KEY) } catch (_) {}
    try { localStorage.removeItem(SUPABASE_STORAGE_KEY) } catch (_) {}
  }

  // ---- Expose + auto-init ----

  window.OlongNotes = window.OlongNotes || {}
  window.OlongNotes.googleAuth = {
    initGoogleAuth,
    signInWithGoogle,
    signOutGoogle,
  }

  // After an OAuth redirect, the browser lands back with a code in the
  // URL — exchange it for a session on every page load.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => initGoogleAuth())
  } else {
    initGoogleAuth()
  }
})();