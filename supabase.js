const { createClient } = require('@supabase/supabase-js')
require('dotenv').config()

// Standard anon client — must comply with RLS (public reads only).
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
)

// Service role client - bypasses RLS.
// Used ONLY for activity_log writes and admin operations.
// NEVER expose the service-role key to the frontend.
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)


module.exports = { supabase, supabaseAdmin }