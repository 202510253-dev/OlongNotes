const { createClient } = require('@supabase/supabase-js')
require('dotenv').config()

// The standard Client in which uses the annon key. Must comply to RLS
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_KEY
)
// ---- DEBUG (Step 3/4): confirm what URL the client resolves to ----
console.log('Supabase URL used by client:', process.env.SUPABASE_URL)
console.log('supabase.supabaseUrl:', supabase.supabaseUrl)
// Service role client - bypasses RLS
// Used ONLY for activity_log writes and admin operations
// STRICLTY NEVER LEAK THIS AT THE FRONT END OMG
const supabaseAdmin = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
)


module.exports = { supabase, supabaseAdmin }