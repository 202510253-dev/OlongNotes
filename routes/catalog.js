// ===================== CATALOG (public reads) =====================
// Public endpoints for browsing the seed data: schools + subjects +
// programs + program-categories. No auth — these feed the catalog
// pages (schools.html, subjects.html, school-profile.html,
// subject-notes.html) and the new K-10 / SHS / College tiered flow.
//
// Why no auth:
//   - Schools, subjects, programs, and program_categories are
//     reference data, not user content.
//   - RLS on these tables is public SELECT (verified 2026-08-02 after
//     K-10/SHS/College schema migration).
//   - The frontend needs to load these at page paint, before any user
//     could possibly be logged in.
//
// Endpoints:
//   GET /api/schools                  → [{ id, school_name }]
//   GET /api/subjects                 → all subjects (backward compat)
//     ?education_level=k10|senior_high|college
//     ?program_id=X
//   GET /api/program-categories       → [{ id, category_name }]
//   GET /api/programs                 → 400 (one of the two params required)
//     ?category_id=X                  → top-level programs in that category
//     ?parent_program_id=X            → majors under that program
//
// Note: `note_count` enrichment was removed in the K-10/SHS/College
// migration. Subjects are now tiered (so a single "all subjects" view
// no longer exists), and schools have no per-row count UI on the
// schools.html design. If a future need arises, re-add via the same
// `fetchNoteCounts` pattern that shipped 2026-08-02 (kept in
// archive — see older commits).

const express = require('express')
const router = express.Router()
const { supabase } = require('../supabase')

// ─────────────────────────────────────────────
// GET /api/schools — public
// ─────────────────────────────────────────────
router.get('/schools', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('schools')
      .select('id, school_name')
      .order('school_name', { ascending: true })

    if (error) {
      console.error('Fetch schools error:', error)
      return res.status(500).json({ message: 'Could not fetch schools.' })
    }

    return res.status(200).json(data)

  } catch (err) {
    console.error('GET /api/schools error:', err)
    return res.status(500).json({ message: 'Server error.' })
  }
})

// ─────────────────────────────────────────────
// GET /api/subjects — public
// Supports ?education_level=k10|senior_high|college
// Supports ?program_id=X (college subjects under a program/major)
// No params = all subjects (backward compat for current frontend callers)
// ─────────────────────────────────────────────
router.get('/subjects', async (req, res) => {
  const { education_level, program_id, id } = req.query

  try {
    let query = supabase
      .from('subjects')
      .select('id, subject_name, cover_image_url, preview_content, category_id, education_level, program_id')
      .order('subject_name', { ascending: true })

    if (education_level) {
      const validLevels = ['k10', 'senior_high', 'college']
      if (!validLevels.includes(education_level)) {
        return res.status(400).json({ message: 'Invalid education_level. Must be k10, senior_high, or college.' })
      }
      query = query.eq('education_level', education_level)
    }

    if (program_id) {
      query = query.eq('program_id', parseInt(program_id))
    }

    if (id) {
      query = query.eq('id', parseInt(id))
    }

    const { data, error } = await query

    if (error) {
      console.error('Fetch subjects error:', error)
      return res.status(500).json({ message: 'Could not fetch subjects.' })
    }

    return res.status(200).json(data)

  } catch (err) {
    console.error('GET /api/subjects error:', err)
    return res.status(500).json({ message: 'Server error.' })
  }
})

// ─────────────────────────────────────────────
// GET /api/program-categories — public
// ─────────────────────────────────────────────
router.get('/program-categories', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('program_categories')
      .select('id, category_name')
      .order('category_name', { ascending: true })

    if (error) {
      console.error('Fetch program categories error:', error)
      return res.status(500).json({ message: 'Could not fetch program categories.' })
    }

    return res.status(200).json(data)

  } catch (err) {
    console.error('GET /api/program-categories error:', err)
    return res.status(500).json({ message: 'Server error.' })
  }
})

// ─────────────────────────────────────────────
// GET /api/programs — public
// Supports ?category_id=X  → top-level programs in that category
//   (parent_program_id IS NULL)
// Supports ?parent_program_id=X → majors under a specific program
// One of the two params is required
// ─────────────────────────────────────────────
router.get('/programs', async (req, res) => {
  const { category_id, parent_program_id } = req.query

  if (!category_id && !parent_program_id) {
    return res.status(400).json({
      message: 'Either category_id or parent_program_id is required.'
    })
  }

  try {
    let query = supabase
      .from('programs')
      .select('id, program_name, parent_program_id, category_id')
      .order('program_name', { ascending: true })

    if (category_id) {
      // Top-level programs only — no majors
      query = query
        .eq('category_id', parseInt(category_id))
        .is('parent_program_id', null)
    }

    if (parent_program_id) {
      // Majors under a specific program
      query = query.eq('parent_program_id', parseInt(parent_program_id))
    }

    const { data, error } = await query

    if (error) {
      console.error('Fetch programs error:', error)
      return res.status(500).json({ message: 'Could not fetch programs.' })
    }

    // Always return array — empty array = no majors, frontend skips that step
    return res.status(200).json(data)

  } catch (err) {
    console.error('GET /api/programs error:', err)
    return res.status(500).json({ message: 'Server error.' })
  }
})

module.exports = router
