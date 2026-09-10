// ===================== STATS (public) =====================
// GET /api/stats — platform-wide counts that the static pages used to
// hardcode (landing-page badges/marquee, About-page school count).
// One endpoint so the frontend hydrates every counter from a single
// round-trip instead of N parallel queries.
//
// Counts:
//   notes         published notes only
//   contributors  accounts with a contribution-worthy role
//                 (limited / verified / admin — the same gate used by
//                 routes/notes.js and routes/questions.js)
//   schools       schools in the directory
//   questions     questions asked (any status)
//
// RLS: all reads go through the anon client; every table here is
// public-SELECT. No auth required.
//
// The count: 'exact' head queries return only the row count — no row
// data, so this is cheap even as the tables grow.

const express = require('express')
const router = express.Router()
const { supabase } = require('../supabase')

router.get('/', async (req, res) => {
  try {
    const [notes, contributors, schools, questions] = await Promise.all([
      supabase
        .from('notes')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'published'),
      supabase
        .from('users')
        .select('id', { count: 'exact', head: true })
        .in('role', ['limited', 'verified', 'admin']),
      supabase
        .from('schools')
        .select('id', { count: 'exact', head: true }),
      supabase
        .from('questions')
        .select('id', { count: 'exact', head: true }),
    ])

    if (notes.error || contributors.error || schools.error || questions.error) {
      console.error('Stats fetch error:', {
        notes: notes.error && notes.error.message,
        contributors: contributors.error && contributors.error.message,
        schools: schools.error && schools.error.message,
        questions: questions.error && questions.error.message,
      })
      return res.status(500).json({ message: 'Could not fetch stats.' })
    }

    // No-cache so the badges always reflect the latest data.
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
    res.setHeader('Pragma', 'no-cache')

    return res.status(200).json({
      notes: notes.count || 0,
      contributors: contributors.count || 0,
      schools: schools.count || 0,
      questions: questions.count || 0,
    })

  } catch (err) {
    console.error('GET /api/stats error:', err)
    return res.status(500).json({ message: 'Server error.' })
  }
})

module.exports = router