const { supabase, supabaseAdmin } = require('../supabase')

// ---------- MAKE SURE TO READ THE BASIC API AND AUTH ----------
// auth middleware
// Verifies the JWT token on every protected route
// Attaches req.user = { id, auth_id, role } if valid
// id = bigint - used for all downstream writes
// auth_id = uuid - the Supabase Auth UUID

/**
 * ensureProfile — creates a public.users profile row for a Supabase
 * auth user who doesn't have one yet.  Typically this happens on
 * first Google sign-in: Supabase creates the auth.users entry, but
 * no public.users row exists until we insert it here.
 *
 * Called both by the middleware below (every protected API call) and
 * by POST /api/auth/login when the email/password route succeeds but
 * the profile row is missing (edge case after manual deletion).
 *
 * The service-role client is used to INSERT because RLS allows
 * authenticated users to insert their OWN row, but this runs with
 * the anonymous client's context which has no JWT.
 */
const ROLE_VIEWER = 'viewer'
async function ensureProfile(authUserId, { email, fullName } = {}) {
  if (!authUserId) return null

  // Fast path: profile already exists.
  const { data: existing, error: lookupErr } = await supabase
    .from('users')
    .select('id, user_name, role, account_status, school_id')
    .eq('auth_id', authUserId)
    .maybeSingle()

  if (lookupErr) {
    console.error('[auth] ensureProfile lookup error:', lookupErr)
    return null
  }
  if (existing) return existing

  // Build a safe, unique username from whatever we have.
  const rawName = (fullName || email || '').trim()
  let username = rawName
    .replace(/[^a-zA-Z0-9_ ]/g, '')   // strip non-alphanumeric
    .replace(/\s+/g, '_')              // spaces → underscores
    .toLowerCase()
    .slice(0, 20)

  if (username.length < 3) {
    // Fallback: "user_" + first 8 chars of the UUID
    username = 'user_' + String(authUserId).slice(0, 8)
  }

  // Ensure uniqueness (append random suffix if needed).
  let candidate = username
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data: clash } = await supabase
      .from('users')
      .select('id')
      .eq('user_name', candidate)
      .maybeSingle()
    if (!clash) break
    candidate = username + '_' + Math.random().toString(36).slice(2, 6)
  }

  const { data: newRow, error: insertErr } = await supabaseAdmin
    .from('users')
    .insert({
      auth_id: authUserId,
      user_name: candidate,
      email: email || null,
      role: ROLE_VIEWER,
      account_status: 'active',
      created_at: new Date().toISOString(),
    })
    .select('id, user_name, role, account_status, school_id')
    .maybeSingle()

  if (insertErr) {
    console.error('[auth] ensureProfile insert error:', insertErr)
    return null
  }
  return newRow
}

const auth = async (req, res, next) => {
    try {
        // S1 - READ TOKEN
        const authHeader = req.headers.authorization

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ message: 'Unauthorized. No token provided.' })
        }

        const token = authHeader.split(' ')[1]

        // S2 - VERIFY TOKEN W SUPABASE AUTH
        // This confirms the token is real, not expired, not tampered with
        const { data: { user: authUser }, error: authError } = await supabase.auth.getUser(token)

        if (authError || !authUser) {
            return res.status(401).json({ message: 'Unauthorized. Invalid or expired token.' })
        }

    // S3 - Get internal bigint id + role from users table
    let { data: profile, error: profileError } = await supabase
      .from('users')
      .select('id, role, account_status')
      .eq('auth_id', authUser.id)
      .single()

    // Google (or any OAuth) first login: auth entry exists but no
    // public.users row yet — auto-provision one so subsequent calls
    // succeed. ensureProfile handles username uniqueness, role, etc.
    if ((profileError || !profile) && authUser.id) {
      profile = await ensureProfile(authUser.id, {
        email: authUser.email,
        fullName: authUser.user_metadata && authUser.user_metadata.full_name,
      })
      if (profile) profileError = null
    }

    if (profileError || !profile) {
      return res.status(401).json({ message: 'Unauthorized. User profile not found.' })
    }

        // S4 - Block suspended accounts
        if (profile.account_status === 'suspended') {
            return res.status(403).json({ message: 'Your account has been suspended.' })
        }

        // S5 - Attach to req.user for all downstream route handlers
        req.user = {
            id: profile.id,       // bigint - use this for notes, answers, questions FK writes
            auth_id: authUser.id, // uuid - only for auth-specific lookups
            role: profile.role
        }

        next()

    } catch (err) {
        console.error('Auth middleware error:', err)
        return res.status(500).json({ message: 'Server error during authentication.' })
    }
}

module.exports = auth
module.exports.ensureProfile = ensureProfile