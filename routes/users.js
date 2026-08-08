// ===================== USERS =====================
// Profile page endpoints (Phase 6 cut 1).
//
// Surface area:
//   GET    /api/users/:id               (public)        Profile header + bio.
//   GET    /api/users/:id/notes         (public)        Notes this user published.
//   GET    /api/users/:id/questions     (public)        Questions asked by this user.
//   GET    /api/users/:id/answers       (public)        Answers this user wrote.
//   GET    /api/users/:id/stats         (public)        Hero stat counters.
//   PATCH  /api/users/:id               (auth, owner)   Edit own profile fields.
//
// All reads use the anon PostgREST client (`supabase`) and rely on the
// existing RLS policies. users.* is publicly readable; only the row
// owner (or an admin) can PATCH it.
//
// Deferred to later cuts:
//   GET /api/users/:id/bookmarks        — Phase 6.2
//   GET /api/users/:id/activity        — Phase 6.3 (use /api/activities)

const express = require('express')
const router = express.Router()
const { supabase, supabaseAdmin } = require('../supabase')
const auth = require('../middleware/auth')

// ---------- Constants ----------
const PROFILE_SELECT =
  'id, user_name, role, bio, avatar_url, location, strand, school_id, ' +
  'grade_level, created_at, verified_at, account_status'

const NOTE_SELECT =
  'id, title, subject_id, grade_level, created_at, updated_at, ' +
  'download_count, view_count, likes_count, bookmarks_count, ' +
  'file_type, annotation, subjects ( subject_name ), schools ( school_name )'

const QUESTION_SELECT =
  'id, title, body, status, created_at, likes_count, answers_count, ' +
  'grade_level, subjects ( subject_name )'

const ANSWER_SELECT =
  'id, question_id, content, created_at, likes_count, is_accepted, ' +
  'questions ( id, title, subjects ( subject_name ) )'

const ALLOWED_GRADE_LEVELS = new Set([
  'Grade 7', 'Grade 8', 'Grade 9', 'Grade 10',
  'Grade 11', 'Grade 12', 'College',
])

const PAGE_LIMIT_DEFAULT = 50
const PAGE_LIMIT_MAX = 100

const NOTE_STATUS_PUBLISHED = 'published'

// ---------- Helpers ----------

// Maps a raw `users` row (+ optional joined schools row) into the
// shape the frontend expects. Empty strings coalesce to null so the
// UI never has to render undefined. Verified schema 2026-08-07:
//
//   users: id (bigint), user_name, role, bio, avatar_url, location,
//          strand, school_id, grade_level, created_at, verified_at,
//          account_status, auth_id
function pickProfile(row, schoolRow) {
  if (!row) return null
  return {
    id: row.id,
    username: row.user_name || null,
    role: row.role || 'user',
    bio: row.bio || null,
    avatar_url: row.avatar_url || null,
    location: row.location || null,
    strand: row.strand || null,
    school_id: row.school_id || null,
    school_name: (schoolRow && schoolRow.school_name) || null,
    grade_level: row.grade_level || null,
    created_at: row.created_at || null,
    verified_at: row.verified_at || null,
    account_status: row.account_status || null,
  }
}

// Resolves a public.users bigint id from the URL. Returns the parsed
// integer, or null if the path param is missing/non-numeric/non-positive.
// Centralized so every route below uses the same validation.
function parseIdParam(raw) {
  const id = parseInt(raw)
  if (!id || Number.isNaN(id) || id <= 0) return null
  return id
}

// Tiny relative-time helper for the "Joined X ago" line. Avoids
// pulling in date-fns for one place; mirrors the helper in
// question-detail.js for consistency.
function joinedLabel(createdAt) {
  if (!createdAt) return null
  const t = new Date(createdAt).getTime()
  if (Number.isNaN(t)) return null
  const diffMs = Date.now() - t
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  if (days < 1) return 'Today'
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`
  const months = Math.floor(days / 30)
  if (months < 12) return `${months} month${months === 1 ? '' : 's'} ago`
  const years = Math.floor(months / 12)
  return `${years} year${years === 1 ? '' : 's'} ago`
}

// Counts rows matching a filter. Returns 0 on error so a single
// failed count never breaks the stats endpoint.
async function safeCount(table, column, value) {
  try {
    const { count, error } = await supabaseAdmin
      .from(table)
      .select('*', { count: 'exact', head: true })
      .eq(column, value)
    if (error) {
      console.error(`[users] count(${table}) error:`, error)
      return 0
    }
    return typeof count === 'number' ? count : 0
  } catch (err) {
    console.error(`[users] count(${table}) exception:`, err)
    return 0
  }
}

// Sums a numeric column on filtered rows. Returns 0 on error or when
// no rows match. (PostgREST head+count doesn't SUM, so we have to
// select the column. Capped at 1000 rows for safety — if a user ever
// has more than 1000 notes the sum will be a partial; flagged in
// the route comment for future work.)
async function safeSum(table, sumColumn, filterColumn, filterValue) {
  try {
    const { data, error } = await supabaseAdmin
      .from(table)
      .select(sumColumn)
      .eq(filterColumn, filterValue)
      .limit(1000)
    if (error) {
      console.error(`[users] sum(${table}) error:`, error)
      return 0
    }
    let total = 0
    for (const row of data || []) {
      const v = row[sumColumn]
      if (typeof v === 'number') total += v
    }
    return total
  } catch (err) {
    console.error(`[users] sum(${table}) exception:`, err)
    return 0
  }
}

// ---------- GET /api/users/:id ----------
//
// Public. Returns the user's profile header (bio, location, school,
// avatar URL, joined date, etc.). 404 if the user doesn't exist.
//
// Reads via the anon client — users are publicly readable in this
// schema. We do NOT return email (Supabase Auth owns it; never
// expose public-side).
router.get('/:id', async (req, res) => {
  const userId = parseIdParam(req.params.id)
  if (!userId) {
    return res.status(400).json({ message: 'Invalid user id.' })
  }

  try {
    const { data: user, error } = await supabase
      .from('users')
      .select(PROFILE_SELECT)
      .eq('id', userId)
      .maybeSingle()

    if (error) {
      console.error('[users] GET /:id error:', error)
      return res.status(500).json({ message: 'Could not fetch user.' })
    }
    if (!user) {
      return res.status(404).json({ message: 'User not found.' })
    }

    // One separate lookup for the school name. PostgREST embeds are
    // reliable but keep this isolated so a missing schools row doesn't
    // fail the whole request.
    let schoolRow = null
    if (user.school_id) {
      const { data: sch, error: schError } = await supabase
        .from('schools')
        .select('id, school_name')
        .eq('id', user.school_id)
        .maybeSingle()
      if (!schError) schoolRow = sch
    }

    const profile = pickProfile(user, schoolRow)
    profile.joined_label = joinedLabel(user.created_at)

    return res.status(200).json({ user: profile })
  } catch (err) {
    console.error('[users] GET /:id exception:', err)
    return res.status(500).json({ message: 'Server error.' })
  }
})

// ---------- GET /api/users/:id/notes ----------
//
// Public. Notes published by this user, newest first.
//
// Query params (all optional):
//   limit      page size (default 50, max 100)
//   offset     page offset (default 0)
//
// Returns { notes: [...] }.
router.get('/:id/notes', async (req, res) => {
  const userId = parseIdParam(req.params.id)
  if (!userId) {
    return res.status(400).json({ message: 'Invalid user id.' })
  }

  const pageLimit = Math.min(
    parseInt(req.query.limit) || PAGE_LIMIT_DEFAULT,
    PAGE_LIMIT_MAX
  )
  const pageOffset = parseInt(req.query.offset) || 0

  try {
    const { data: rows, error } = await supabase
      .from('notes')
      .select(NOTE_SELECT)
      .eq('user_id', userId)
      .eq('status', NOTE_STATUS_PUBLISHED)
      .order('created_at', { ascending: false })
      .range(pageOffset, pageOffset + pageLimit - 1)

    if (error) {
      console.error('[users] GET /:id/notes error:', error)
      return res.status(500).json({ message: 'Could not fetch notes.' })
    }

    return res.status(200).json({ notes: rows || [] })
  } catch (err) {
    console.error('[users] GET /:id/notes exception:', err)
    return res.status(500).json({ message: 'Server error.' })
  }
})

// ---------- GET /api/users/:id/questions ----------
//
// Public. Questions asked by this user, newest first.
router.get('/:id/questions', async (req, res) => {
  const userId = parseIdParam(req.params.id)
  if (!userId) {
    return res.status(400).json({ message: 'Invalid user id.' })
  }

  const pageLimit = Math.min(
    parseInt(req.query.limit) || PAGE_LIMIT_DEFAULT,
    PAGE_LIMIT_MAX
  )
  const pageOffset = parseInt(req.query.offset) || 0

  try {
    const { data: rows, error } = await supabase
      .from('questions')
      .select(QUESTION_SELECT)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range(pageOffset, pageOffset + pageLimit - 1)

    if (error) {
      console.error('[users] GET /:id/questions error:', error)
      return res.status(500).json({ message: 'Could not fetch questions.' })
    }

    return res.status(200).json({ questions: rows || [] })
  } catch (err) {
    console.error('[users] GET /:id/questions exception:', err)
    return res.status(500).json({ message: 'Server error.' })
  }
})

// ---------- GET /api/users/:id/answers ----------
//
// Public. Answers this user wrote, newest first. Body is truncated
// at the server to 200 chars — the frontend never needs the full
// body for the profile list and the truncation keeps the response
// payload small.
router.get('/:id/answers', async (req, res) => {
  const userId = parseIdParam(req.params.id)
  if (!userId) {
    return res.status(400).json({ message: 'Invalid user id.' })
  }

  const pageLimit = Math.min(
    parseInt(req.query.limit) || PAGE_LIMIT_DEFAULT,
    PAGE_LIMIT_MAX
  )
  const pageOffset = parseInt(req.query.offset) || 0

  try {
    const { data: rows, error } = await supabase
      .from('answers')
      .select(ANSWER_SELECT)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range(pageOffset, pageOffset + pageLimit - 1)

    if (error) {
      console.error('[users] GET /:id/answers error:', error)
      return res.status(500).json({ message: 'Could not fetch answers.' })
    }

    const truncated = (rows || []).map((r) => ({
      ...r,
      content_preview:
        typeof r.content === 'string' && r.content.length > 200
          ? r.content.slice(0, 200) + '…'
          : r.content,
    }))

    return res.status(200).json({ answers: truncated })
  } catch (err) {
    console.error('[users] GET /:id/answers exception:', err)
    return res.status(500).json({ message: 'Server error.' })
  }
})

// ---------- GET /api/users/:id/stats ----------
//
// Public. Hero stat counters for the profile page. All counts run
// in parallel via Promise.all; each helper never throws — a single
// failed count falls back to 0 so the page still renders even when
// a downstream table is unavailable.
//
// Counter meanings:
//   uploads      Published notes count.
//   downloads    Sum of notes.download_count for the user's notes.
//   likes_given  Likes this user has placed on notes, questions, or
//                answers. All three tables share the same join
//                shape (user_id + parent_id + created_at) but live
//                in separate tables — union via Promise.all.
//   bookmarks    Bookmarks this user has placed on notes.
//   answers      Total answers written.
//   questions    Total questions asked.
router.get('/:id/stats', async (req, res) => {
  const userId = parseIdParam(req.params.id)
  if (!userId) {
    return res.status(400).json({ message: 'Invalid user id.' })
  }

  try {
    const [
      uploads,
      downloads,
      likesNotes,
      likesQuestions,
      likesAnswers,
      bookmarks,
      answers,
      questions,
    ] = await Promise.all([
      safeCount('notes', 'user_id', userId),
      safeSum('notes', 'download_count', 'user_id', userId),
      safeCount('likes', 'user_id', userId),
      safeCount('question_likes', 'user_id', userId),
      safeCount('answer_likes', 'user_id', userId),
      safeCount('bookmarks', 'user_id', userId),
      safeCount('answers', 'user_id', userId),
      safeCount('questions', 'user_id', userId),
    ])

    return res.status(200).json({
      stats: {
        uploads,
        downloads,
        likes_given: likesNotes + likesQuestions + likesAnswers,
        bookmarks,
        answers,
        questions,
      },
    })
  } catch (err) {
    console.error('[users] GET /:id/stats exception:', err)
    return res.status(200).json({
      stats: { uploads: 0, downloads: 0, likes_given: 0, bookmarks: 0, answers: 0, questions: 0 },
    })
  }
})

// ---------- PATCH /api/users/:id ----------
//
// Auth required. Owner of the row OR an admin can edit.
//
// Body (all fields optional — at least one must be present):
//   username      string, ^[a-zA-Z0-9_]{3,20}$
//   bio           string, max 500 chars
//   location      string, max 120 chars
//   strand        string, max 80 chars
//   school_id     int (positive) or null
//   grade_level   string from ALLOWED_GRADE_LEVELS or null
//
// Email is intentionally NOT editable here. Supabase Auth owns the
// auth.users row; changing it requires the email-change flow which
// we don't expose in this cut. The frontend's Settings form omits
// the email field for the same reason.
router.patch('/:id', auth, async (req, res) => {
  const userId = parseIdParam(req.params.id)
  if (!userId) {
    return res.status(400).json({ message: 'Invalid user id.' })
  }

  // Authorization: only the row owner or an admin.
  if (req.user.id !== userId && req.user.role !== 'admin') {
    return res.status(403).json({ message: 'You can only edit your own profile.' })
  }

  const { username, bio, location, strand, school_id, grade_level } = req.body || {}

  const hasEdits = [username, bio, location, strand]
    .some((v) => v !== undefined && v !== null)
    || school_id !== undefined
    || grade_level !== undefined
  if (!hasEdits) {
    return res.status(400).json({ message: 'Nothing to update.' })
  }

  const patch = {}

  if (username !== undefined && username !== null) {
    const u = String(username).trim()
    if (!/^[a-zA-Z0-9_]{3,20}$/.test(u)) {
      return res.status(400).json({
        message: 'Username must be 3-20 characters of letters, numbers, or underscores.',
      })
    }
    patch.user_name = u
  }
  if (bio !== undefined && bio !== null) {
    const b = String(bio).trim()
    if (b.length > 500) {
      return res.status(400).json({ message: 'Bio must be 500 characters or fewer.' })
    }
    patch.bio = b
  }
  if (location !== undefined && location !== null) {
    const l = String(location).trim()
    if (l.length > 120) {
      return res.status(400).json({ message: 'Location must be 120 characters or fewer.' })
    }
    patch.location = l
  }
  if (strand !== undefined && strand !== null) {
    const s = String(strand).trim()
    if (s.length > 80) {
      return res.status(400).json({ message: 'Strand must be 80 characters or fewer.' })
    }
    patch.strand = s
  }
  if (school_id !== undefined && school_id !== null) {
    const sid = parseInt(school_id)
    if (Number.isNaN(sid) || sid <= 0) {
      return res.status(400).json({ message: 'school_id must be a positive integer.' })
    }
    patch.school_id = sid
  } else if (school_id === null) {
    patch.school_id = null
  }
  if (grade_level !== undefined && grade_level !== null) {
    const g = String(grade_level).trim()
    if (!ALLOWED_GRADE_LEVELS.has(g)) {
      return res.status(400).json({
        message: `grade_level must be one of: ${[...ALLOWED_GRADE_LEVELS].join(', ')}.`,
      })
    }
    patch.grade_level = g
  } else if (grade_level === null) {
    patch.grade_level = null
  }

  try {
    const { data: updated, error } = await supabase
      .from('users')
      .update(patch)
      .eq('id', userId)
      .select(PROFILE_SELECT)
      .maybeSingle()

    if (error) {
      // 23505 = unique violation (most likely: another user already
      // claimed this username).
      if (error.code === '23505') {
        return res.status(409).json({ message: 'That username is already taken.' })
      }
      console.error('[users] PATCH /:id error:', error)
      return res.status(500).json({ message: 'Could not update profile.' })
    }
    if (!updated) {
      return res.status(404).json({ message: 'User not found.' })
    }

    // Fetch school name for the response shape (matches GET /:id).
    let schoolRow = null
    if (updated.school_id) {
      const { data: sch, error: schError } = await supabase
        .from('schools')
        .select('id, school_name')
        .eq('id', updated.school_id)
        .maybeSingle()
      if (!schError) schoolRow = sch
    }

    const profile = pickProfile(updated, schoolRow)
    profile.joined_label = joinedLabel(updated.created_at)

    return res.status(200).json({ user: profile })
  } catch (err) {
    console.error('[users] PATCH /:id exception:', err)
    return res.status(500).json({ message: 'Server error.' })
  }
})

module.exports = router