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
// Supports ?id=X (single subject lookup)
// Supports ?letter=X and ?limit=X&offset=X for filtering and pagination
// No params = all subjects (backward compat for current frontend callers)
// ─────────────────────────────────────────────
router.get('/subjects', async (req, res) => {
  const { education_level, program_id, id, letter, limit, offset } = req.query

try {
    let query = supabase
      .from('subjects')
      .select(`
        id, subject_name, cover_image_url, preview_content, category_id, education_level, program_id,
        shs_strands ( strand_name, shs_tracks ( track_name ) )
      `, { count: 'exact' })
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

    if (letter && letter.length === 1) {
      query = query.ilike('subject_name', `${letter}%`)
    }

    const pageLimit = Math.min(parseInt(limit) || 20, 100)
    const pageOffset = parseInt(offset) || 0
    query = query.range(pageOffset, pageOffset + pageLimit - 1)

    const { data, error, count } = await query

    if (error) {
      console.error('Fetch subjects error:', error)
      return res.status(500).json({ message: 'Could not fetch subjects.' })
    }

    if (limit || offset) {
      return res.status(200).json({
        subjects: data,
        pagination: {
          total: count,
          limit: pageLimit,
          offset: pageOffset,
          has_more: (pageOffset + pageLimit) < count
        }
      })
    }

    return res.status(200).json(data)

  } catch (err) {
    console.error('GET /api/subjects error:', err)
    return res.status(500).json({ message: 'Server error.' })
  }
})

// ─────────────────────────────────────────────
// GET /api/featured — public
// Featured notes for the landing page. Returns multi-image uploads as
// ONE entry (grouped by group_id) so the feed isn't cluttered with N
// separate cards for a single N-image upload. Each returned item is
// shaped like the frontend's adapted note (id/title/school/grade/
// subject/likes/downloads) plus an `imageCount` field so the feed can
// show a gallery badge. Single notes are returned as-is (imageCount 1).
//
// The response is explicitly no-cache. The frontend also appends a
// ?t=<timestamp> cache-buster, but the header guarantees the browser /
// any intermediary never serves a stale featured list.
// ─────────────────────────────────────────────
router.get('/featured', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('notes')
      .select(`
        id,
        title,
        file_url,
        file_type,
        grade_level,
        group_id,
        download_count,
        likes_count,
        created_at,
        status,
        users ( user_name ),
        schools ( school_name ),
        subjects ( subject_name )
      `)
      .eq('status', 'published')
      .order('created_at', { ascending: false })
      .limit(20)

    if (error) {
      console.error('Fetch featured notes error:', error)
      return res.status(500).json({ message: 'Could not fetch featured notes.' })
    }

    const notes = data || []

    // Group by group_id. Keep insertion order stable by walking the
    // already-descending list and preserving the first occurrence.
    const groupMap = new Map()
    notes.forEach((n) => {
      const key = n.group_id || `single_${n.id}`
      if (!groupMap.has(key)) groupMap.set(key, [])
      groupMap.get(key).push(n)
    })

    const featured = []
    groupMap.forEach((members) => {
      const rep = members[0]
      const isImage = (rep.file_type || '').startsWith('image/')
      // Only a genuine multi-IMAGE set collapses into a gallery card.
      // Anything else (a single image, or two files that happen to share
      // a group_id) stays as individual cards.
      const multiImages = members.filter((m) => (m.file_type || '').startsWith('image/'))
      const imageCount = isImage ? multiImages.length : 1

      featured.push({
        id: rep.id,
        title: rep.title || 'Untitled',
        school: (rep.schools && rep.schools.school_name) || 'Unknown school',
        grade: rep.grade_level || '',
        subject: (rep.subjects && rep.subjects.subject_name) || 'General',
        likes: members.reduce((s, m) => s + (parseInt(m.likes_count) || 0), 0),
        downloads: members.reduce((s, m) => s + (parseInt(m.download_count) || 0), 0),
        group_id: rep.group_id || '',
        imageCount,
      })
    })

    // No-cache so the feed always reflects the latest published notes.
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
    res.setHeader('Pragma', 'no-cache')
    return res.status(200).json(featured)

  } catch (err) {
    console.error('GET /api/featured error:', err)
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
