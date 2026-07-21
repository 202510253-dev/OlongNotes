const { supabase } = require('../supabase')

// ---------- MAKE SURE TO READ THE BASIC API AND AUTH ----------
// auth middleware
// Verifies the JWT token on every protected route
// Attaches req.user = { id, auth_id, role } if valid
// id = bigint - used for all downstream writes
// auth_id = uuid - the Supabase Auth UUID

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
        const { data: profile, error: profileError } = await supabase
            .from('users')
            .select('id, role, account_status')
            .eq('auth_id', authUser.id)
            .single()

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