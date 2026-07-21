const { createClient } = require('@supabase/supabase-js')
require('dotenv').config()

// The standard Client in which uses the annon key. Must comply to RLS
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_KEY
)
// Service role client - bypasses RLS
// Used ONLY for activity_log writes and admin operations
// STRICLTY NEVER LEAK THIS AT THE FRONT END OMG
const supabaseAdmin = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
)


module.exports = { supabase, supabaseAdmin }