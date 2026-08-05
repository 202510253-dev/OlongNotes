// ===================== ACTIVITIES =====================
// Reads + writes for the user's recent activity feed.
//
// Surface area:
//   GET  /api/activities              (auth)   Fetch the signed-in user's
//                                              recent activity feed. Optional
//                                              ?type= filter (note_viewed |
//                                              note_liked | note_bookmarked
//                                              | note_uploaded |
//                                              note_reported | note_deleted).
//                                              Optional ?limit=&offset=.
//   POST /api/activities              (auth)   Record a new activity row.
//                                              Body: { note_id, activity_type,
//                                              description? }. The client uses
//                                              this for note_viewed / liked /
//                                              bookmarked / reported; the
//                                              backend writes the same values
//                                              directly for upload/delete in
//                                              routes/notes.js.
//
// The module also exports writeActivity() — a fire-and-forget helper used
// by routes/notes.js for the like/bookmark/upload/report/view paths. The
// POST endpoint and the helper share the same write path so the row shape
// is consistent across every caller.
//
// activity_log is polymorphic: target_type='note' + target_id=<note_id>.
//
// TEMPORARY: This module reads and writes via `supabaseAdmin` (service
// role) to bypass the existing `activity_log_select` /
// `activity_log_insert` RLS policies, which compare `auth.uid()` (an
// auth.users UUID) against `activity_log.user_id` (a public.users
// bigint). The types never match for a backend PostgREST request, so
// anon reads/writes always return zero rows / fail silently. A proper
// fix is two replacement policies that resolve public.users.id via
// auth_id (see Phase 2 plan, "Risks"). When those policies land,
// flip both the GET query and the writeActivity POST below back to
// the anon `supabase` client and drop the supabaseAdmin import here.

const express = require('express')
const router = express.Router()
const { supabase, supabaseAdmin } = require('../supabase')
const auth = require('../middleware/auth')

// ---------- Helpers ----------

// Fire-and-forget write to activity_log. NEVER throws — failures are logged
// to the console and the caller moves on. Activity writes are a side
// effect, not a primary operation, so they must not break the user's
// action (like, bookmark, view, etc.) if the log table is unavailable.
//
// Uses `supabaseAdmin` (service role) to bypass RLS — the RLS policy
// on activity_log requires auth.uid() to match the row's user_id, but
// the backend's PostgREST connections don't carry the JWT, so the
// anon client can't INSERT. The service role bypasses RLS entirely
// (see supabase.js: "Service role client - bypasses RLS / Used ONLY
// for activity_log writes and admin operations").
async function writeActivity(userId, activityType, noteId, description) {
  if (!userId || !activityType || !noteId) return { skipped: true }
  try {
    const { error } = await supabaseAdmin
      .from('activity_log')
      .insert({
        user_id: userId,
        target_type: 'note',
        target_id: noteId,
        activity_type: activityType,
        // activity_log.description is NOT NULL. Callers pass null for
        // events that don't have a useful summary (view/like/bookmark);
        // fall back to a stable placeholder so the row always inserts.
        description: description || `${activityType} on note ${noteId}`,
        created_at: new Date().toISOString(),
      })
    if (error) {
      console.error('[activities] writeActivity failed:', error)
      return { error }
    }
    return { ok: true }
  } catch (err) {
    console.error('[activities] writeActivity exception:', err)
    return { error: err }
  }
}

// ---------- Middleware ----------
// All routes below require auth. The viewer-facing page (recent-activities.html)
// treats unauthenticated viewers as a "log in" empty state, so the public
// flow doesn't need a public GET.
router.use(auth)

// ---------- GET /api/activities ----------
//
// Query params (all optional):
//   type    one of: note_viewed | note_liked | note_bookmarked |
//                   note_uploaded | note_reported | note_deleted
//   limit   page size (default 50, max 100)
//   offset  page offset (default 0)
//
// Returns:
//   When limit/offset are passed:
//     { activities: [...], pagination: { total, limit, offset, has_more } }
//   Otherwise:
//     [...activities]
//
// Row shape:
//   {
//     id, type, note_id, title, subject_name, school_name, created_at
//   }
router.get('/', async (req, res) => {
  const { type } = req.query
  const pageLimit = Math.min(parseInt(req.query.limit) || 50, 100)
  const pageOffset = parseInt(req.query.offset) || 0

  const validTypes = [
    'note_viewed',
    'note_liked',
    'note_bookmarked',
    'note_uploaded',
    'note_reported',
    'note_deleted',
  ]
  if (type && !validTypes.includes(type)) {
    return res.status(400).json({
      message: `Invalid type. Must be one of: ${validTypes.join(', ')}.`,
    })
  }

  try {
    // Two-step read — there is no FK relationship declared between
    // `activity_log` and `notes`, so PostgREST cannot auto-join them
    // via the `notes!inner(...)` embed (that returns PGRST200). We
    // fetch the activity rows and the note metadata in parallel and
    // stitch them in JS.
    //
    // Uses supabaseAdmin (service role) so the RLS policy
    // `activity_log_select` doesn't block the read. The policy
    // compares `auth.uid()` (a Supabase Auth UUID) against the row's
    // `user_id` (a public.users bigint) — those never match for a
    // backend PostgREST request, so anon reads return zero rows.
    // Equivalently, we filter to `req.user.id` below so only this
    // user's rows come back.
    let logQuery = supabaseAdmin
      .from('activity_log')
      .select('id, activity_type, target_id, created_at', { count: 'exact' })
      .eq('user_id', req.user.id)
      .eq('target_type', 'note')
      .order('created_at', { ascending: false })
      .range(pageOffset, pageOffset + pageLimit - 1)

    if (type) logQuery = logQuery.eq('activity_type', type)

    const { data: logRows, error: logError, count } = await logQuery

    if (logError) {
      console.error('[activities] fetch error:', logError)
      // RLS or join failure should not 5xx the page — return an empty
      // page so the UI can show its empty state instead of a server
      // error banner.
      return res
        .status(200)
        .json({ activities: [], pagination: { total: 0, limit: pageLimit, offset: pageOffset, has_more: false } })
    }

    // Fetch note metadata for every distinct target_id in the result.
    // A single user with a few view/like events reuses the same note
    // — dedupe before the IN(...) so we issue at most one query.
    const noteIds = Array.from(
      new Set((logRows || []).map((r) => r.target_id).filter((id) => id != null))
    )

    let notesById = {}
    if (noteIds.length > 0) {
      const { data: notesData, error: notesError } = await supabaseAdmin
        .from('notes')
        .select('id, title, subjects ( subject_name ), schools ( school_name )')
        .in('id', noteIds)

      if (notesError) {
        console.error('[activities] notes lookup error:', notesError)
        // Non-fatal — continue with empty note metadata so the feed
        // still renders the activity rows (title falls back to
        // "Untitled note").
      } else {
        for (const n of notesData || []) {
          notesById[n.id] = n
        }
      }
    }

    const rows = (logRows || []).map((row) => {
      const note = notesById[row.target_id] || null
      return {
        id: row.id,
        type: row.activity_type,
        note_id: row.target_id,
        title: note?.title || 'Untitled note',
        subject_name: note?.subjects?.subject_name || null,
        school_name: note?.schools?.school_name || null,
        created_at: row.created_at,
      }
    })

    if (req.query.limit || req.query.offset) {
      return res.status(200).json({
        activities: rows,
        pagination: {
          total: count,
          limit: pageLimit,
          offset: pageOffset,
          has_more: pageOffset + pageLimit < count,
        },
      })
    }

    return res.status(200).json(rows)
  } catch (err) {
    console.error('[activities] GET error:', err)
    return res.status(200).json({ activities: [], pagination: { total: 0, limit: pageLimit, offset: pageOffset, has_more: false } })
  }
})

// ---------- POST /api/activities ----------
//
// Body: { note_id, activity_type, description? }
//   note_id        bigint (required) — the note this activity is about.
//   activity_type  string (required) — one of validTypes above.
//   description    string (optional) — free-form context, used for "user X
//                   reported note Y for spam" etc.
//
// The client posts this from document-viewer.js after each successful
// viewer / like / bookmark / report action. The backend writes the same
// row directly from routes/notes.js for upload (and DELETE which already
// writes 'note_deleted').
router.post('/', async (req, res) => {
  const { note_id, activity_type, description } = req.body || {}

  const validTypes = [
    'note_viewed',
    'note_liked',
    'note_bookmarked',
    'note_uploaded',
    'note_reported',
    'note_deleted',
  ]
  if (!note_id || !activity_type) {
    return res.status(400).json({ message: 'note_id and activity_type are required.' })
  }
  if (!validTypes.includes(activity_type)) {
    return res.status(400).json({
      message: `Invalid activity_type. Must be one of: ${validTypes.join(', ')}.`,
    })
  }

  // Just call the same writeActivity helper. It is fire-and-forget so
  // we don't await a long synchronous write — but the user is waiting
  // for a 201, so we return right after the insert resolves.
  //
  // Uses supabaseAdmin so the RLS WITH CHECK on activity_log_insert
  // (which requires auth.uid() to match the row's user_id) doesn't
  // fail on the backend's anonymous PostgREST connection.
  try {
    const result = await writeActivity(
      req.user.id,
      activity_type,
      parseInt(note_id),
      description
    )
    // writeActivity never throws — it logs and returns. We re-check
    // explicitly for the helper's contract: if it produced an error
    // (it doesn't expose the error, so we just return success if no
    // throw). The actual write success is logged inside the helper.
    if (result && result.error) {
      return res.status(200).json({ message: 'Activity not recorded.' })
    }
    return res.status(201).json({ message: 'Activity recorded.' })
  } catch (err) {
    console.error('[activities] POST exception:', err)
    return res.status(200).json({ message: 'Activity not recorded.' })
  }
})

module.exports = router
module.exports.writeActivity = writeActivity
