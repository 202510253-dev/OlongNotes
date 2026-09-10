// ===================== GOOGLE SIGN-IN GATEWAY =====================
// Bridges Google Identity → Supabase Auth → OlongNotes localStorage.
//
// Flow:
//   1. index.html loads this file AFTER api.js.
//   2. script.js calls initGoogleAuth() once the auth modal is ready.
//      (script.js handles the button click → signInWithGoogle().)
//   3. On first load (and after an OAuth redirect back), checkSession()
//      exchanges the authorization code for a Supabase session and
//      stores it in the keys the rest of the app already reads
//      (olongnotes_token / olongnotes_user).
//   4. Every subsequent page load picks up the cached session from
//      localStorage — no extra network round-trip.
//
// Dependencies:
//   - Supabase JS SDK v2 loaded dynamically from CDN (loaded once,
//     cached by the browser).  The project URL + anon key come from
//     GET /api/config (safe to expose — anon key governs RLS only).
//   - api.js must be loaded before this file so that
//     window.OlongNotes.api / setToken / getToken / clearToken exist.
//
// Security notes:
//   - The Supabase anon key is intentionally public: it's the same
//     key api.js already sends on every request.  RLS is the real
//     access gate; the anon key cannot bypass it.
//   - The service-role key is never exposed.
//   - No Google ID tokens are logged or stored on the client.

;(function () {
  'use strict'

  const SUPABASE_SDK_CDN = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js'
  const SUPABASE_STORAGE_KEY = 'sb-' + (location.hostname || 'localhost') + '-auth-token'
  const USER_STORAGE_KEY     = 'olongnotes_user'
  const TOKEN_KEY            = 'olongnotes_token'

  let _supabase = null          // Supabase Client instance (created once)
  let _ready    = null          // resolves when init completes
  let _resolveReady             // attached to _ready
  let _initialising = null      // Promise while init is in flight (dedup guard)

  _ready = new Promise((r) => { _resolveReady = r })

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

  /**
   * Normalise a Supabase User object into the shape the rest of the
   * app expects in olongnotes_user:
   *   { id: bigint, auth_id: uuid, username: string, role: string, school_id: ... }
   *
   * We deliberately don't call /api/auth/login here — the Supabase
   * session already proves identity.  The middleware/auth.js
   * ensureProfile() auto-creates the public.users row on first
   * protected call if it doesn't exist yet, so we can safely
   * return a minimal user object now and let the profile fill in
   * on the next request.
   */
  function normalizeUser(supaUser) {
    if (!supaUser) return null
    const meta = supaUser.user_metadata || {}
    return {
      // id — bigint FK used by notes/answers/questions.  We don't
      //      have it yet on a brand-new Google login; the middleware
      //      will populate it on the first protected call.  The
      //      applyRole('user') path is tolerant of a missing id.
      id:       null,
      auth_id:  supaUser.id,
      username: meta.full_name || meta.name || (supaUser.email || '').split('@')[0] || 'user',
      role:     meta.role || 'viewer',
      school_id: null,
    }
  }

  // ---- Supabase SDK loader ----

  function loadSupabaseSDK() {
    return new Promise((resolve, reject) => {
      // Already on the page?
      if (window.supabase && window.supabase.createClient) {
        return resolve(window.supabase)
      }
      // Look for an existing <script> tag we already injected.
      const existing = document.querySelector(`script[src="${SUPABASE_SDK_CDN}"]`)
      if (existing) {
        existing.addEventListener('load',  () => resolve(window.supabase))
        existing.addEventListener('error', () => reject(new Error('Supabase SDK load failed.')))
        return
      }
      const s = document.createElement('script')
      s.src   = SUPABASE_SDK_CDN
      s.async = true
      s.crossOrigin = 'anonymous'
      s.onload  = () => resolve(window.supabase)
      s.onerror = ()  => reject(new Error('Supabase SDK load failed.'))
      document.head.appendChild(s)
    })
  }

  // ---- Session persistence helpers ----

  /** Read whatever Supabase stored after an OAuth redirect. */
  async function _readSupabaseSession() {
    if (!_supabase) return null
    try {
      const { data: { session } } = await _supabase.auth.getSession()
      return session || null
    } catch (_) {
      return null
    }
  }

  /** Push a Supabase session into olongnotes_token / olongnotes_user. */
  function _persistSession(session) {
    if (!session || !session.access_token) {
      clearToken()
      try { localStorage.removeItem(USER_STORAGE_KEY) } catch (_) {}
      return
    }
    setToken(session.access_token)
    writeUser(normalizeUser(session.user))
  }

  // ---- Public API ----

  /**
   * initGoogleAuth() — called once from script.js on DOMContentLoaded.
   * Fetches the Supabase project config, initialises the client, and
   * checks for a pending OAuth redirect (auth code in URL).
   * Resolves when the session is known (cached or fresh).
   */
  async function initGoogleAuth() {
    // If a previous init is still in flight, wait for it instead of
    // creating a second Supabase client or re-fetching /api/config.
    if (_initialising) return _initialising

    _initialising = (async () => {
      try {
        const supabaseModule = await loadSupabaseSDK()

        const cfgRes = await fetch('/api/config')
        if (!cfgRes.ok) throw new Error('Could not load auth config.')
        const { supabaseUrl, supabaseAnonKey } = await cfgRes.json()
        if (!supabaseUrl || !supabaseAnonKey) throw new Error('Auth config incomplete.')

        _supabase = supabaseModule.createClient(supabaseUrl, supabaseAnonKey, {
          auth: {
            persistSession:  true,
            autoRefreshToken: true,
            detectSessionInUrl: true,       // handles code / hash fragments
            storage: window.localStorage,
            storageKey: SUPABASE_STORAGE_KEY,
          },
        })

        // 1) Exchange an authorization code left in the URL by the OAuth
        //    redirect (PKCE flow — Supabase default).  This call is a
        //    no-op when no code is present, so it's safe on every load.
        try {
          if (typeof _supabase.auth.exchangeCodeForSession === 'function') {
            await _supabase.auth.exchangeCodeForSession(window.location.href)
          }
        } catch (_) {
          // Expired / invalid code — not fatal, just won't have a session.
        }

        // 2) Read the (possibly just-exchanged) session and persist it.
        const session = await _readSupabaseSession()
        _persistSession(session)

        // 3) Expose to the rest of the app.
        window.OlongNotes = window.OlongNotes || {}
        window.OlongNotes.googleAuth = { signInWithGoogle, isReady: _ready }
        _resolveReady()
        return true

      } catch (err) {
        console.warn('[OlongNotes] Google Auth init failed.', err)
        _resolveReady()
        return false
      }
    })()

    return _initialising
  }

  /**
   * signInWithGoogle() — called when the user clicks the Google
   * button.  Opens the Google consent screen via Supabase OAuth.
   * On return, the session is automatically persisted by
   * initGoogleAuth() on the next page load (or by the SDK's own
   * URL detection if detectSessionInUrl is true).
   */
  async function signInWithGoogle() {
    if (!_supabase) {
      throw new Error('Google auth not ready — please refresh.')
    }
    const { error } = await _supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin + window.location.pathname,
        queryParams: {
          // 'select_account' forces the Google account chooser even when
          // the user is already signed in to one Google account.
          prompt: 'select_account',
        },
      },
    })
    if (error) {
      throw new Error(error.message || 'Google sign-in failed.')
    }
    // If we get here without a redirect (unlikely), the session may
    // already be available — persist it just in case.
    const session = await _readSupabaseSession()
    _persistSession(session)
  }

  /**
   * signOutGoogle() — signs out of Supabase Auth and clears the
   * local session cache.  Used by the logout button.
   */
  async function signOutGoogle() {
    if (_supabase) {
      try { await _supabase.auth.signOut() } catch (_) {}
    }
    clearToken()
    try { localStorage.removeItem(USER_STORAGE_KEY) } catch (_) {}
    try { localStorage.removeItem(SUPABASE_STORAGE_KEY) } catch (_) {}
  }

  // ---- Boot ----

  // Expose immediately so script.js can queue work before init
  // completes (the Promise is awaited internally).
  window.OlongNotes = window.OlongNotes || {}
  window.OlongNotes.googleAuth = {
    initGoogleAuth,
    signInWithGoogle,
    signOutGoogle,
    isReady: _ready,
  }

  // ---- Auto-init on page load ----
  // After a Google OAuth redirect, the browser lands back on
  // index.html (or about.html) with an auth code in the URL.
  // initGoogleAuth() exchanges it for a Supabase session and
  // persists the token + user into localStorage — this MUST
  // run on every page load, not just on button click.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => initGoogleAuth())
  } else {
    initGoogleAuth()
  }
})();