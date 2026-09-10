// ===================== SAFE FRONTEND CONFIG =====================
// GET /api/config — returns the Supabase project URL and anon key
// that the frontend needs to initialise the Supabase JS SDK for
// Google OAuth (signInWithOAuth).
//
// The anon key is intentionally public: it's the same key the
// existing api.js uses implicitly, and Supabase RLS governs
// what it can do. The service-role key is NEVER exposed.
//
// Response: { supabaseUrl: string, supabaseAnonKey: string }

const express = require('express')
const router = express.Router()
const { supabase } = require('../supabase')

router.get('/', async (req, res) => {
  const url    = process.env.SUPABASE_URL
  const anonKey = process.env.SUPABASE_KEY

  if (!url || !anonKey) {
    console.error('[config] SUPABASE_URL or SUPABASE_KEY not set in env.')
    return res.status(500).json({ message: 'Server configuration error.' })
  }

  // No-cache: the values are static and public, but we don't want a
  // stale copy cached behind a CDN.
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
  res.setHeader('Pragma', 'no-cache')

  return res.status(200).json({ supabaseUrl: url, supabaseAnonKey: anonKey })
})

module.exports = router